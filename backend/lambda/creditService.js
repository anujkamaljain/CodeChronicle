'use strict';

const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});

const WALLET_TABLE = process.env.CREDITS_WALLET_TABLE;
const LEDGER_TABLE = process.env.CREDITS_LEDGER_TABLE;
const PAYMENTS_TABLE = process.env.CREDITS_PAYMENTS_TABLE;
const METRICS_TABLE = process.env.CREDITS_METRICS_TABLE;
const METRICS_KEY = 'global';

const DEFAULT_FREE_CREDITS = Number(process.env.FREE_TRIAL_CREDITS || 25);
const CREDIT_PRICE_INR = Number(process.env.CREDIT_PRICE_INR || 1);
const CREDIT_COST_SAFETY_MULTIPLIER = Number(process.env.CREDIT_COST_SAFETY_MULTIPLIER || 1.2);
const INR_PER_USD = Number(process.env.INR_PER_USD || 93);
const INPUT_TOKEN_USD_PER_1M = Number(process.env.INPUT_TOKEN_USD_PER_1M || 2.5);
const OUTPUT_TOKEN_USD_PER_1M = Number(process.env.OUTPUT_TOKEN_USD_PER_1M || 12.5);
const RAZORPAY_NET_FACTOR = Number(process.env.RAZORPAY_NET_FACTOR || 0.9764);

const BILLING_PLANS = {
    starter: { id: 'starter', name: 'Starter', amountInr: 99, baseCredits: 99, originalAmountInr: 149 },
    growth: { id: 'growth', name: 'Growth', amountInr: 299, baseCredits: 305, originalAmountInr: 399 },
    pro: { id: 'pro', name: 'Pro', amountInr: 999, baseCredits: 1050, originalAmountInr: 1299 },
};

const FIRST_PURCHASE_BONUS = {
    starter: 20,
    growth: 45,
    pro: 120,
};

function nowIso() {
    return new Date().toISOString();
}

function createEntryId(prefix) {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function validateTables() {
    if (!WALLET_TABLE || !LEDGER_TABLE || !PAYMENTS_TABLE || !METRICS_TABLE) {
        throw new Error('Credit tables are not configured in environment variables.');
    }
}

async function incrementMetrics(delta) {
    const entries = Object.entries(delta || {}).filter(([, v]) => Number(v) !== 0);
    const addExpr = [];
    const values = { ':zero': 0, ':now': nowIso() };
    let idx = 0;
    for (const [key, value] of entries) {
        idx += 1;
        const token = `:v${idx}`;
        addExpr.push(`${key} ${token}`);
        values[token] = Number(value);
    }

    const updateExpression = `${addExpr.length ? `ADD ${addExpr.join(', ')} ` : ''}SET updatedAt = :now`;
    await ddb.send(new UpdateCommand({
        TableName: METRICS_TABLE,
        Key: { metricKey: METRICS_KEY },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: values,
    }));
}

async function ensureUserWallet(userId) {
    validateTables();
    const current = await ddb.send(new GetCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
    }));

    if (current.Item) return current.Item;

    const createdAt = nowIso();
    let created = false;
    await ddb.send(new PutCommand({
        TableName: WALLET_TABLE,
        Item: {
            userId,
            balanceCredits: 0,
            freeCreditsGranted: false,
            hasFirstPurchaseBonusClaimed: false,
            createdAt,
            updatedAt: createdAt,
        },
        ConditionExpression: 'attribute_not_exists(userId)',
    })).then(() => {
        created = true;
    }).catch((err) => {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
    });

    if (created) {
        await incrementMetrics({ usersWithWallets: 1 });
    }

    const reloaded = await ddb.send(new GetCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
    }));
    return reloaded.Item;
}

async function grantFreeCreditsIfEligible(userId, credits = DEFAULT_FREE_CREDITS) {
    await ensureUserWallet(userId);
    try {
        await ddb.send(new UpdateCommand({
            TableName: WALLET_TABLE,
            Key: { userId },
            UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, freeCreditsGranted = :true, updatedAt = :now',
            ConditionExpression: 'attribute_not_exists(freeCreditsGranted) OR freeCreditsGranted = :false',
            ExpressionAttributeValues: {
                ':zero': 0,
                ':credits': credits,
                ':true': true,
                ':false': false,
                ':now': nowIso(),
            },
        }));

        await recordLedgerEntry({
            userId,
            type: 'credit',
            credits,
            source: 'free_trial',
            sourceId: `free_trial:${userId}`,
            metadata: { reason: 'new_user_onboarding' },
        });
        await incrementMetrics({ totalOutstandingCredits: credits });
        return { granted: true, credits };
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            return { granted: false, credits: 0 };
        }
        throw err;
    }
}

async function recordLedgerEntry({ userId, type, credits, source, sourceId, metadata }) {
    const entryId = createEntryId('ledger');
    await ddb.send(new PutCommand({
        TableName: LEDGER_TABLE,
        Item: {
            userId,
            entryId,
            type,
            credits,
            source,
            sourceId,
            metadata: metadata || {},
            createdAt: nowIso(),
        },
        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
    }));
    return entryId;
}

async function recordLedgerEntryIdempotent({ userId, type, credits, source, sourceId, metadata }) {
    const existing = await ddb.send(new QueryCommand({
        TableName: LEDGER_TABLE,
        IndexName: 'SourceIdIndex',
        KeyConditionExpression: 'sourceId = :sourceId',
        ExpressionAttributeValues: { ':sourceId': sourceId },
        Limit: 1,
    }));
    if (existing.Items && existing.Items.length > 0) {
        return { created: false, entryId: existing.Items[0].entryId };
    }

    const entryId = await recordLedgerEntry({ userId, type, credits, source, sourceId, metadata });
    return { created: true, entryId };
}

function getPlanById(planId) {
    if (!planId || !BILLING_PLANS[planId]) return null;
    return BILLING_PLANS[planId];
}

function listPlans() {
    return Object.values(BILLING_PLANS).map((plan) => ({
        ...plan,
        firstPurchaseBonusCredits: FIRST_PURCHASE_BONUS[plan.id] || 0,
    }));
}

function calculateCreditsToDebit(inputTokens, outputTokens) {
    const inputCostUsd = (Math.max(0, Number(inputTokens) || 0) / 1_000_000) * INPUT_TOKEN_USD_PER_1M;
    const outputCostUsd = (Math.max(0, Number(outputTokens) || 0) / 1_000_000) * OUTPUT_TOKEN_USD_PER_1M;
    const costInr = (inputCostUsd + outputCostUsd) * INR_PER_USD * CREDIT_COST_SAFETY_MULTIPLIER;
    const rawCredits = costInr / (RAZORPAY_NET_FACTOR * CREDIT_PRICE_INR);
    return Math.max(1, Math.ceil(rawCredits));
}

function estimateMaxCreditsForRequest(promptChars, maxOutputTokens) {
    // Conservative estimate to ensure pre-auth always covers final debit.
    // We treat prompt chars as upper-bound input tokens for safety.
    const estimatedInputTokens = Math.max(1, Number(promptChars) || 1);
    const estimatedOutputTokens = Math.max(1, Number(maxOutputTokens) || 1);
    return calculateCreditsToDebit(estimatedInputTokens, estimatedOutputTokens);
}

async function debitCreditsForUsage({ userId, source, sourceId, inputTokens, outputTokens, metadata }) {
    await ensureUserWallet(userId);

    const debit = calculateCreditsToDebit(inputTokens, outputTokens);
    await ddb.send(new UpdateCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
        UpdateExpression: 'SET balanceCredits = balanceCredits - :debit, updatedAt = :now',
        ConditionExpression: 'balanceCredits >= :debit',
        ExpressionAttributeValues: {
            ':debit': debit,
            ':now': nowIso(),
        },
    }));

    await recordLedgerEntry({
        userId,
        type: 'debit',
        credits: debit,
        source,
        sourceId,
        metadata: { ...(metadata || {}), inputTokens, outputTokens },
    });
    await incrementMetrics({
        totalOutstandingCredits: -debit,
        creditsConsumed: debit,
    });

    return { debited: debit };
}

async function reserveCreditsForUsage({ userId, credits, source, sourceId, metadata }) {
    await ensureUserWallet(userId);
    await ddb.send(new UpdateCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
        UpdateExpression: 'SET balanceCredits = balanceCredits - :credits, updatedAt = :now',
        ConditionExpression: 'balanceCredits >= :credits',
        ExpressionAttributeValues: {
            ':credits': credits,
            ':now': nowIso(),
        },
    }));

    await recordLedgerEntry({
        userId,
        type: 'debit',
        credits,
        source,
        sourceId,
        metadata: metadata || {},
    });
    await incrementMetrics({
        totalOutstandingCredits: -credits,
        creditsConsumed: credits,
    });

    return { reserved: credits };
}

async function creditAdjustment({ userId, credits, source, sourceId, metadata }) {
    if (!credits || credits <= 0) return { adjusted: 0 };
    await ensureUserWallet(userId);
    await ddb.send(new UpdateCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, updatedAt = :now',
        ExpressionAttributeValues: {
            ':zero': 0,
            ':credits': credits,
            ':now': nowIso(),
        },
    }));

    await recordLedgerEntry({
        userId,
        type: 'credit',
        credits,
        source,
        sourceId,
        metadata: metadata || {},
    });
    const isUsageRelease = source.startsWith('ai_usage_');
    await incrementMetrics({
        totalOutstandingCredits: credits,
        creditsConsumed: isUsageRelease ? -credits : 0,
    });
    return { adjusted: credits };
}

async function getWalletWithHistory(userId, historyLimit = 50) {
    const wallet = await ensureUserWallet(userId);
    const ledger = await ddb.send(new QueryCommand({
        TableName: LEDGER_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        Limit: Math.max(1, Math.min(100, historyLimit)),
        ScanIndexForward: false,
    }));

    return {
        userId,
        balanceCredits: wallet.balanceCredits || 0,
        freeCreditsGranted: !!wallet.freeCreditsGranted,
        hasFirstPurchaseBonusClaimed: !!wallet.hasFirstPurchaseBonusClaimed,
        ledger: ledger.Items || [],
    };
}

async function getPaymentById(paymentId) {
    const result = await ddb.send(new GetCommand({
        TableName: PAYMENTS_TABLE,
        Key: { paymentId },
    }));
    return result.Item || null;
}

async function createPendingPayment({ paymentId, userId, planId, amountInr, razorpayOrderId }) {
    const existing = await getPaymentById(paymentId);
    if (existing) return existing;

    const item = {
        paymentId,
        userId,
        planId,
        amountInr,
        razorpayOrderId,
        status: 'created',
        creditsGranted: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
    };
    await ddb.send(new PutCommand({
        TableName: PAYMENTS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(paymentId)',
    }));
    return item;
}

async function grantCreditsForSuccessfulPayment({
    paymentId,
    userId,
    razorpayPaymentId,
    razorpayOrderId,
    amountInr,
    planId,
    metadata,
}) {
    await ensureUserWallet(userId);
    const plan = getPlanById(planId);
    if (!plan) throw new Error(`Unknown plan for payment: ${planId}`);

    const wallet = await ensureUserWallet(userId);
    const eligibleForFirstBonus = !wallet.hasFirstPurchaseBonusClaimed;
    const bonus = eligibleForFirstBonus ? (FIRST_PURCHASE_BONUS[plan.id] || 0) : 0;
    const totalCredits = plan.baseCredits + bonus;
    const sourceId = `razorpay_payment:${razorpayPaymentId}`;

    const ledgerResult = await recordLedgerEntryIdempotent({
        userId,
        type: 'credit',
        credits: totalCredits,
        source: 'razorpay_order',
        sourceId,
        metadata: {
            paymentId,
            planId,
            baseCredits: plan.baseCredits,
            bonusCredits: bonus,
            razorpayOrderId,
            razorpayPaymentId,
            ...(metadata || {}),
        },
    });

    if (!ledgerResult.created) {
        return { granted: false, reason: 'already_processed' };
    }

    await ddb.send(new UpdateCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, hasFirstPurchaseBonusClaimed = :bonusClaimed, updatedAt = :now',
        ExpressionAttributeValues: {
            ':zero': 0,
            ':credits': totalCredits,
            ':bonusClaimed': eligibleForFirstBonus ? true : wallet.hasFirstPurchaseBonusClaimed,
            ':now': nowIso(),
        },
    }));
    await incrementMetrics({
        totalOutstandingCredits: totalCredits,
        creditsSold: totalCredits,
        grossRevenueInr: amountInr,
        paymentsCaptured: 1,
    });

    await ddb.send(new UpdateCommand({
        TableName: PAYMENTS_TABLE,
        Key: { paymentId },
        UpdateExpression: 'SET #status = :status, userId = :userId, planId = :planId, razorpayPaymentId = :razorpayPaymentId, razorpayOrderId = :razorpayOrderId, amountInr = :amountInr, creditsGranted = :creditsGranted, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':status': 'captured',
            ':userId': userId,
            ':planId': planId,
            ':razorpayPaymentId': razorpayPaymentId,
            ':razorpayOrderId': razorpayOrderId,
            ':amountInr': amountInr,
            ':creditsGranted': totalCredits,
            ':now': nowIso(),
        },
    }));
    await incrementMetrics({
        totalOutstandingCredits: -creditsToReverse,
        creditsReversed: creditsToReverse,
        paymentsRefunded: 1,
    });

    return {
        granted: true,
        totalCredits,
        bonusCredits: bonus,
        baseCredits: plan.baseCredits,
    };
}

async function reverseCreditsForRefund({
    paymentId,
    userId,
    razorpayRefundId,
    razorpayPaymentId,
    razorpayOrderId,
    metadata,
}) {
    await ensureUserWallet(userId);

    const payment = await getPaymentById(paymentId);
    if (!payment) {
        throw new Error(`Payment not found for reversal: ${paymentId}`);
    }
    const creditsToReverse = Math.max(0, Number(payment.creditsGranted || 0));
    if (!creditsToReverse) {
        return { reversed: false, reason: 'no_credits_to_reverse' };
    }

    const sourceId = `refund:${razorpayRefundId || razorpayPaymentId}`;
    const ledgerResult = await recordLedgerEntryIdempotent({
        userId,
        type: 'reversal',
        credits: creditsToReverse,
        source: 'razorpay_refund',
        sourceId,
        metadata: {
            paymentId,
            razorpayRefundId: razorpayRefundId || null,
            razorpayPaymentId,
            razorpayOrderId,
            ...(metadata || {}),
        },
    });

    if (!ledgerResult.created) {
        return { reversed: false, reason: 'already_processed' };
    }

    await ddb.send(new UpdateCommand({
        TableName: WALLET_TABLE,
        Key: { userId },
        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) - :credits, updatedAt = :now',
        ExpressionAttributeValues: {
            ':zero': 0,
            ':credits': creditsToReverse,
            ':now': nowIso(),
        },
    }));

    await ddb.send(new UpdateCommand({
        TableName: PAYMENTS_TABLE,
        Key: { paymentId },
        UpdateExpression: 'SET #status = :status, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
            ':status': 'refunded',
            ':now': nowIso(),
        },
    }));

    return { reversed: true, creditsReversed: creditsToReverse };
}

async function getAdminBillingSummary() {
    validateTables();
    const metrics = await ddb.send(new GetCommand({
        TableName: METRICS_TABLE,
        Key: { metricKey: METRICS_KEY },
    }));
    const m = metrics.Item || {};

    return {
        usersWithWallets: Number(m.usersWithWallets || 0),
        totalOutstandingCredits: Number(m.totalOutstandingCredits || 0),
        creditsSold: Number(m.creditsSold || 0),
        creditsConsumed: Number(m.creditsConsumed || 0),
        creditsReversed: Number(m.creditsReversed || 0),
        grossRevenueInr: Number(m.grossRevenueInr || 0),
        paymentsCaptured: Number(m.paymentsCaptured || 0),
        paymentsRefunded: Number(m.paymentsRefunded || 0),
        updatedAt: nowIso(),
    };
}

module.exports = {
    listPlans,
    getPlanById,
    ensureUserWallet,
    grantFreeCreditsIfEligible,
    calculateCreditsToDebit,
    estimateMaxCreditsForRequest,
    debitCreditsForUsage,
    reserveCreditsForUsage,
    creditAdjustment,
    getWalletWithHistory,
    createPendingPayment,
    getPaymentById,
    grantCreditsForSuccessfulPayment,
    reverseCreditsForRefund,
    getAdminBillingSummary,
};
