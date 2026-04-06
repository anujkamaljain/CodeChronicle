'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const { authenticateRequest } = require('./authz');
const {
    listPlans,
    getPlanById,
    ensureUserWallet,
    getWalletWithHistory,
    createPendingPayment,
    grantCreditsForSuccessfulPayment,
    reverseCreditsForRefund,
    getAdminBillingSummary,
} = require('./creditService');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const WEBSITE_URL = process.env.WEBSITE_URL || '';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET,
});

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Razorpay-Signature',
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        },
        body: JSON.stringify(body),
    };
}

function parseJsonBody(event) {
    const raw = event.body || '{}';
    const bodyStr = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
    return { bodyStr, body: JSON.parse(bodyStr || '{}') };
}

module.exports.getPlans = async () => response(200, {
    plans: listPlans(),
    currency: 'INR',
    creditPriceInr: Number(process.env.CREDIT_PRICE_INR || 1),
});

module.exports.getWallet = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) return response(auth.statusCode, auth.body);

        const wallet = await getWalletWithHistory(auth.user.email, 100);
        return response(200, wallet);
    } catch (err) {
        console.error('getWallet error:', err);
        return response(500, { error: 'Failed to fetch wallet.', details: err.message });
    }
};

module.exports.createOrder = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) return response(auth.statusCode, auth.body);

        if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
            return response(500, { error: 'Razorpay is not configured.' });
        }

        const { body } = parseJsonBody(event);
        const plan = getPlanById(body.planId);
        if (!plan) {
            return response(400, { error: 'Invalid plan selected.' });
        }

        await ensureUserWallet(auth.user.email);

        const receipt = `cc_${Date.now()}_${auth.user.email.replace(/[^a-z0-9]/gi, '').slice(0, 18)}`;
        const order = await razorpay.orders.create({
            amount: plan.amountInr * 100,
            currency: 'INR',
            receipt,
            notes: {
                userEmail: auth.user.email,
                planId: plan.id,
            },
        });

        const paymentId = `pay_${order.id}`;
        await createPendingPayment({
            paymentId,
            userId: auth.user.email,
            planId: plan.id,
            amountInr: plan.amountInr,
            razorpayOrderId: order.id,
        });

        return response(200, {
            orderId: order.id,
            amountInr: plan.amountInr,
            currency: 'INR',
            razorpayKeyId: RAZORPAY_KEY_ID,
            plan: {
                id: plan.id,
                name: plan.name,
                baseCredits: plan.baseCredits,
                firstPurchaseBonusCredits: listPlans().find((p) => p.id === plan.id)?.firstPurchaseBonusCredits || 0,
            },
            prefill: {
                email: auth.user.email,
                name: auth.user.name || '',
            },
            successRedirectUrl: WEBSITE_URL ? `${WEBSITE_URL}/billing/success` : '/billing/success',
        });
    } catch (err) {
        console.error('createOrder error:', err);
        return response(500, { error: 'Failed to create payment order.', details: err.message });
    }
};

module.exports.razorpayWebhook = async (event) => {
    try {
        if (!RAZORPAY_WEBHOOK_SECRET) {
            return response(500, { error: 'Razorpay webhook secret is not configured.' });
        }

        const signature = event?.headers?.['x-razorpay-signature'] || event?.headers?.['X-Razorpay-Signature'];
        if (!signature) {
            return response(400, { error: 'Missing webhook signature.' });
        }

        const { bodyStr, body } = parseJsonBody(event);
        const expected = crypto
            .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
            .update(bodyStr)
            .digest('hex');
        const valid = crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(String(signature), 'utf8'));
        if (!valid) {
            return response(401, { error: 'Invalid webhook signature.' });
        }

        const eventType = body?.event;
        if (eventType === 'payment.captured') {
            const paymentEntity = body?.payload?.payment?.entity;
            if (!paymentEntity?.id || !paymentEntity?.order_id) {
                return response(400, { error: 'Malformed payment payload.' });
            }

            const userId = paymentEntity?.notes?.userEmail;
            const planId = paymentEntity?.notes?.planId;
            if (!userId || !planId) {
                return response(400, { error: 'Missing user/plan metadata in payment notes.' });
            }

            const paymentId = `pay_${paymentEntity.order_id}`;
            const grant = await grantCreditsForSuccessfulPayment({
                paymentId,
                userId,
                planId,
                amountInr: Number(paymentEntity.amount || 0) / 100,
                razorpayPaymentId: paymentEntity.id,
                razorpayOrderId: paymentEntity.order_id,
                metadata: { eventId: body?.payload?.payment?.entity?.id },
            });

            return response(200, { ok: true, grant });
        }

        if (eventType === 'refund.processed') {
            const refundEntity = body?.payload?.refund?.entity;
            const paymentEntity = body?.payload?.payment?.entity;
            let resolvedPayment = paymentEntity;

            // Razorpay may not include full payment entity with notes in refund events.
            if ((!resolvedPayment?.order_id || !resolvedPayment?.notes?.userEmail) && refundEntity?.payment_id) {
                try {
                    resolvedPayment = await razorpay.payments.fetch(refundEntity.payment_id);
                } catch (fetchErr) {
                    console.error('Failed to resolve payment from refund payload:', fetchErr);
                }
            }

            if (!resolvedPayment?.order_id || !resolvedPayment?.notes?.userEmail) {
                return response(400, { error: 'Malformed refund payload. Unable to resolve payment owner.' });
            }

            const paymentId = `pay_${resolvedPayment.order_id}`;
            const reversal = await reverseCreditsForRefund({
                paymentId,
                userId: resolvedPayment.notes.userEmail,
                razorpayRefundId: refundEntity?.id,
                razorpayPaymentId: resolvedPayment.id,
                razorpayOrderId: resolvedPayment.order_id,
                metadata: { eventId: refundEntity?.id || resolvedPayment.id },
            });

            return response(200, { ok: true, reversal });
        }

        return response(200, { ok: true, ignored: true, eventType });
    } catch (err) {
        console.error('razorpayWebhook error:', err);
        return response(500, { error: 'Webhook processing failed.', details: err.message });
    }
};

module.exports.adminBillingSummary = async (event) => {
    try {
        const adminKey = event?.headers?.['x-admin-key'] || event?.headers?.['X-Admin-Key'] || '';
        if (ADMIN_API_KEY && adminKey === ADMIN_API_KEY) {
            const summary = await getAdminBillingSummary();
            return response(200, summary);
        }

        const auth = await authenticateRequest(event);
        if (!auth.ok) return response(auth.statusCode, auth.body);
        if (!ADMIN_EMAILS.includes(String(auth.user.email || '').toLowerCase())) {
            return response(403, { error: 'Admin access required.' });
        }

        const summary = await getAdminBillingSummary();
        return response(200, summary);
    } catch (err) {
        console.error('adminBillingSummary error:', err);
        return response(500, { error: 'Failed to fetch admin billing summary.', details: err.message });
    }
};
