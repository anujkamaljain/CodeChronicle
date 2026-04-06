'use strict';

const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
    TransactWriteCommand,
    ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
});

const WALLET_TABLE = process.env.CREDITS_WALLET_TABLE;
const LEDGER_TABLE = process.env.CREDITS_LEDGER_TABLE;
const PAYMENTS_TABLE = process.env.CREDITS_PAYMENTS_TABLE;
const METRICS_TABLE = process.env.CREDITS_METRICS_TABLE;
const COUPONS_TABLE = process.env.CREDITS_COUPONS_TABLE;
const METRICS_KEY = 'global';

const DEFAULT_FREE_CREDITS = Number(process.env.FREE_TRIAL_CREDITS || 25);
const CREDIT_PRICE_INR = Number(process.env.CREDIT_PRICE_INR || 1);
const CREDIT_COST_SAFETY_MULTIPLIER = Number(process.env.CREDIT_COST_SAFETY_MULTIPLIER || 1.2);
const INR_PER_USD = Number(process.env.INR_PER_USD || 93);
const INPUT_TOKEN_USD_PER_1M = Number(process.env.INPUT_TOKEN_USD_PER_1M || 2.5);
const OUTPUT_TOKEN_USD_PER_1M = Number(process.env.OUTPUT_TOKEN_USD_PER_1M || 12.5);
const RAZORPAY_NET_FACTOR = Number(process.env.RAZORPAY_NET_FACTOR || 0.9764);

const BILLING_PLANS = {
    starter: {
        id: 'starter',
        name: 'Starter',
        amountInr: Number(process.env.STARTER_PLAN_PRICE_INR || 19),
        baseCredits: Number(process.env.STARTER_PLAN_CREDITS || 99),
        originalAmountInr: Number(process.env.STARTER_PLAN_ORIGINAL_PRICE_INR || 29),
    },
    growth: {
        id: 'growth',
        name: 'Growth',
        amountInr: Number(process.env.GROWTH_PLAN_PRICE_INR || 49),
        baseCredits: Number(process.env.GROWTH_PLAN_CREDITS || 305),
        originalAmountInr: Number(process.env.GROWTH_PLAN_ORIGINAL_PRICE_INR || 79),
    },
    pro: {
        id: 'pro',
        name: 'Pro',
        amountInr: Number(process.env.PRO_PLAN_PRICE_INR || 99),
        baseCredits: Number(process.env.PRO_PLAN_CREDITS || 1050),
        originalAmountInr: Number(process.env.PRO_PLAN_ORIGINAL_PRICE_INR || 149),
    },
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

function createDeterministicUsageEntryId(sourceId) {
    const digest = crypto.createHash('sha256').update(String(sourceId || '')).digest('hex').slice(0, 20);
    return `usage_${digest}`;
}

function createDeterministicLedgerEntryId(sourceId) {
    const digest = crypto.createHash('sha256').update(String(sourceId || '')).digest('hex').slice(0, 20);
    return `idemp_${digest}`;
}

function validateTables() {
    if (!WALLET_TABLE || !LEDGER_TABLE || !PAYMENTS_TABLE || !METRICS_TABLE || !COUPONS_TABLE) {
        throw new Error('Credit tables are not configured in environment variables.');
    }
}

function normalizeCouponCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

async function incrementMetrics(delta) {
    const entries = Object.entries(delta || {}).filter(([, v]) => Number(v) !== 0);
    const addExpr = [];
    const values = { ':now': nowIso() };
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
    const entryId = createDeterministicLedgerEntryId(sourceId);
    try {
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
        return { created: true, entryId };
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            return { created: false, entryId };
        }
        throw err;
    }
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
    if (!sourceId) {
        throw new Error('sourceId is required for usage debit.');
    }

    const debit = calculateCreditsToDebit(inputTokens, outputTokens);
    if (!Number.isFinite(debit) || debit <= 0) return { debited: 0 };
    const now = nowIso();
    const usageEntryId = createDeterministicUsageEntryId(sourceId);
    await ddb.send(new TransactWriteCommand({
        TransactItems: [
            {
                Update: {
                    TableName: WALLET_TABLE,
                    Key: { userId },
                    UpdateExpression: 'SET balanceCredits = balanceCredits - :debit, updatedAt = :now',
                    ConditionExpression: 'balanceCredits >= :debit',
                    ExpressionAttributeValues: {
                        ':debit': debit,
                        ':now': now,
                    },
                },
            },
            {
                Put: {
                    TableName: LEDGER_TABLE,
                    Item: {
                        userId,
                        entryId: usageEntryId,
                        type: 'debit',
                        credits: debit,
                        source,
                        sourceId,
                        metadata: { ...(metadata || {}), inputTokens, outputTokens },
                        createdAt: now,
                    },
                    ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                },
            },
        ],
    }));
    await incrementMetrics({
        totalOutstandingCredits: -debit,
        creditsConsumed: debit,
    });

    return { debited: debit };
}

async function reserveCreditsForUsage({ userId, credits, source, sourceId, metadata }) {
    if (!Number.isFinite(credits) || credits <= 0) {
        throw new Error('Invalid credit amount for reservation.');
    }
    await ensureUserWallet(userId);
    const now = nowIso();
    const usageEntryId = createDeterministicUsageEntryId(sourceId);

    // Idempotency guard: if this exact sourceId was already processed, do nothing.
    const existing = await ddb.send(new GetCommand({
        TableName: LEDGER_TABLE,
        Key: { userId, entryId: usageEntryId },
    }));
    if (existing.Item) {
        return { reserved: 0, duplicate: true };
    }

    await ddb.send(new TransactWriteCommand({
        TransactItems: [
            {
                Update: {
                    TableName: WALLET_TABLE,
                    Key: { userId },
                    UpdateExpression: 'SET balanceCredits = balanceCredits - :credits, updatedAt = :now',
                    ConditionExpression: 'balanceCredits >= :credits',
                    ExpressionAttributeValues: {
                        ':credits': credits,
                        ':now': now,
                    },
                },
            },
            {
                Put: {
                    TableName: LEDGER_TABLE,
                    Item: {
                        userId,
                        entryId: usageEntryId,
                        type: 'debit',
                        credits,
                        source,
                        sourceId,
                        metadata: metadata || {},
                        createdAt: now,
                    },
                    ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                },
            },
        ],
    }));

    await incrementMetrics({
        totalOutstandingCredits: -credits,
        creditsConsumed: credits,
    });

    return { reserved: credits };
}

async function creditAdjustment({ userId, credits, source, sourceId, metadata }) {
    if (!credits || credits <= 0) return { adjusted: 0 };
    await ensureUserWallet(userId);
    const now = nowIso();
    const usageEntryId = createDeterministicUsageEntryId(sourceId);

    const existing = await ddb.send(new GetCommand({
        TableName: LEDGER_TABLE,
        Key: { userId, entryId: usageEntryId },
    }));
    if (existing.Item) {
        return { adjusted: 0, duplicate: true };
    }

    await ddb.send(new TransactWriteCommand({
        TransactItems: [
            {
                Update: {
                    TableName: WALLET_TABLE,
                    Key: { userId },
                    UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':zero': 0,
                        ':credits': credits,
                        ':now': now,
                    },
                },
            },
            {
                Put: {
                    TableName: LEDGER_TABLE,
                    Item: {
                        userId,
                        entryId: usageEntryId,
                        type: 'credit',
                        credits,
                        source,
                        sourceId,
                        metadata: metadata || {},
                        createdAt: now,
                    },
                    ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                },
            },
        ],
    }));

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

    const sourceId = `razorpay_payment:${razorpayPaymentId}`;
    const ledgerEntryId = createDeterministicLedgerEntryId(sourceId);
    const existing = await ddb.send(new GetCommand({
        TableName: LEDGER_TABLE,
        Key: { userId, entryId: ledgerEntryId },
    }));
    if (existing.Item) {
        return { granted: false, reason: 'already_processed' };
    }

    const bonusCredits = FIRST_PURCHASE_BONUS[plan.id] || 0;
    let appliedBonus = 0;
    let totalCredits = plan.baseCredits;
    const now = nowIso();

    try {
        // Bonus path: only the first successful purchase can satisfy this wallet condition.
        totalCredits = plan.baseCredits + bonusCredits;
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: WALLET_TABLE,
                        Key: { userId },
                        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, hasFirstPurchaseBonusClaimed = :true, updatedAt = :now',
                        ConditionExpression: 'attribute_not_exists(hasFirstPurchaseBonusClaimed) OR hasFirstPurchaseBonusClaimed = :false',
                        ExpressionAttributeValues: {
                            ':zero': 0,
                            ':credits': totalCredits,
                            ':true': true,
                            ':false': false,
                            ':now': now,
                        },
                    },
                },
                {
                    Put: {
                        TableName: LEDGER_TABLE,
                        Item: {
                            userId,
                            entryId: ledgerEntryId,
                            type: 'credit',
                            credits: totalCredits,
                            source: 'razorpay_order',
                            sourceId,
                            metadata: {
                                paymentId,
                                planId,
                                baseCredits: plan.baseCredits,
                                bonusCredits,
                                razorpayOrderId,
                                razorpayPaymentId,
                                ...(metadata || {}),
                            },
                            createdAt: now,
                        },
                        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                    },
                },
                {
                    Update: {
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
                            ':now': now,
                        },
                    },
                },
            ],
        }));
        appliedBonus = bonusCredits;
    } catch (err) {
        if (err.name !== 'TransactionCanceledException' && err.name !== 'ConditionalCheckFailedException') {
            throw err;
        }
        // If already processed by a concurrent handler, return idempotent success.
        const after = await ddb.send(new GetCommand({
            TableName: LEDGER_TABLE,
            Key: { userId, entryId: ledgerEntryId },
        }));
        if (after.Item) {
            return { granted: false, reason: 'already_processed' };
        }

        // Non-bonus fallback path when first-purchase bonus condition is no longer true.
        totalCredits = plan.baseCredits;
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: WALLET_TABLE,
                        Key: { userId },
                        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':zero': 0,
                            ':credits': totalCredits,
                            ':now': now,
                        },
                    },
                },
                {
                    Put: {
                        TableName: LEDGER_TABLE,
                        Item: {
                            userId,
                            entryId: ledgerEntryId,
                            type: 'credit',
                            credits: totalCredits,
                            source: 'razorpay_order',
                            sourceId,
                            metadata: {
                                paymentId,
                                planId,
                                baseCredits: plan.baseCredits,
                                bonusCredits: 0,
                                razorpayOrderId,
                                razorpayPaymentId,
                                ...(metadata || {}),
                            },
                            createdAt: now,
                        },
                        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                    },
                },
                {
                    Update: {
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
                            ':now': now,
                        },
                    },
                },
            ],
        }));
        appliedBonus = 0;
    }

    await incrementMetrics({
        totalOutstandingCredits: totalCredits,
        creditsSold: totalCredits,
        grossRevenueInr: amountInr,
        paymentsCaptured: 1,
    });

    return {
        granted: true,
        totalCredits,
        bonusCredits: appliedBonus,
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
    const grantedCredits = Math.max(0, Number(payment.creditsGranted || 0));
    if (!grantedCredits) {
        return { reversed: false, reason: 'no_credits_to_reverse' };
    }

    const alreadyReversed = await getReversedCreditsForPayment({ userId, paymentId });
    const reversibleRemaining = Math.max(0, grantedCredits - alreadyReversed);
    if (!reversibleRemaining) {
        return { reversed: false, reason: 'already_fully_reversed' };
    }

    const refundAmountInr = Number(metadata?.refundAmountInr || 0);
    const paymentAmountInr = Number(payment.amountInr || 0);
    let requestedReversal = grantedCredits;
    if (refundAmountInr > 0 && paymentAmountInr > 0) {
        requestedReversal = Math.max(1, Math.round((refundAmountInr / paymentAmountInr) * grantedCredits));
    }
    const creditsToReverse = Math.max(0, Math.min(reversibleRemaining, requestedReversal));
    if (!creditsToReverse) {
        return { reversed: false, reason: 'no_credits_to_reverse' };
    }

    // Idempotent per unique refund event id, atomically applied with wallet + payment state.
    const sourceId = `refund:${razorpayRefundId || razorpayPaymentId}`;
    const entryId = createDeterministicLedgerEntryId(sourceId);
    const now = nowIso();
    try {
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: WALLET_TABLE,
                        Key: { userId },
                        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) - :credits, updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':zero': 0,
                            ':credits': creditsToReverse,
                            ':now': now,
                        },
                    },
                },
                {
                    Put: {
                        TableName: LEDGER_TABLE,
                        Item: {
                            userId,
                            entryId,
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
                            createdAt: now,
                        },
                        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                    },
                },
                {
                    Update: {
                        TableName: PAYMENTS_TABLE,
                        Key: { paymentId },
                        UpdateExpression: 'SET #status = :status, updatedAt = :now',
                        ExpressionAttributeNames: { '#status': 'status' },
                        ExpressionAttributeValues: {
                            ':status': 'refunded',
                            ':now': now,
                        },
                    },
                },
            ],
        }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException') {
            const duplicate = (err.CancellationReasons || [])
                .some((reason) => reason?.Code === 'ConditionalCheckFailed');
            if (duplicate) {
                return { reversed: false, reason: 'already_processed' };
            }
        }
        throw err;
    }

    await incrementMetrics({
        totalOutstandingCredits: -creditsToReverse,
        creditsReversed: creditsToReverse,
        paymentsRefunded: 1,
    });

    return { reversed: true, creditsReversed: creditsToReverse };
}

async function getReversedCreditsForPayment({ userId, paymentId }) {
    let lastEvaluatedKey;
    let total = 0;
    do {
        const page = await ddb.send(new QueryCommand({
            TableName: LEDGER_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': userId },
            ProjectionExpression: '#source, metadata, credits',
            ExpressionAttributeNames: { '#source': 'source' },
            ExclusiveStartKey: lastEvaluatedKey,
            ScanIndexForward: false,
        }));
        for (const entry of page.Items || []) {
            if (entry.source === 'razorpay_refund' && entry?.metadata?.paymentId === paymentId) {
                total += Number(entry.credits || 0);
            }
        }
        lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    return total;
}

async function getAdminBillingSummary() {
    validateTables();
    const walletRollup = await getWalletRollup();
    const paymentRollup = await getPaymentsRollup();
    const ledgerRollup = await getLedgerRollup();
    const couponRollup = await getCouponRollup();
    const grossRevenueFromLedger = sumRevenueForCapturedPayments(paymentRollup.amountByPaymentId, ledgerRollup.capturedPaymentIds);
    const updatedAt = maxIsoDate(walletRollup.updatedAt, paymentRollup.updatedAt, ledgerRollup.updatedAt, couponRollup.updatedAt) || nowIso();

    return {
        usersWithWallets: walletRollup.usersWithWallets,
        totalOutstandingCredits: walletRollup.totalOutstandingCredits,
        // Ledger entries are source-of-truth for granted/reversed credits.
        creditsSold: ledgerRollup.creditsSold,
        creditsRedeemed: ledgerRollup.creditsRedeemed,
        creditsConsumed: ledgerRollup.creditsConsumed,
        creditsReversed: ledgerRollup.creditsReversed,
        couponCodesCreated: couponRollup.couponCodesCreated,
        couponClaims: couponRollup.couponClaims,
        grossRevenueInr: grossRevenueFromLedger,
        paymentsCaptured: ledgerRollup.paymentsCaptured,
        paymentsRefunded: ledgerRollup.paymentsRefunded,
        updatedAt,
    };
}

async function getWalletRollup() {
    let lastEvaluatedKey;
    const totals = {
        usersWithWallets: 0,
        totalOutstandingCredits: 0,
        updatedAt: null,
    };

    do {
        const page = await ddb.send(new ScanCommand({
            TableName: WALLET_TABLE,
            ProjectionExpression: 'userId, balanceCredits, updatedAt',
            ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const wallet of page.Items || []) {
            totals.usersWithWallets += 1;
            totals.totalOutstandingCredits += Number(wallet.balanceCredits || 0);
            if (wallet.updatedAt && (!totals.updatedAt || wallet.updatedAt > totals.updatedAt)) {
                totals.updatedAt = wallet.updatedAt;
            }
        }
        lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return totals;
}

async function getPaymentsRollup() {
    let lastEvaluatedKey;
    const totals = {
        amountByPaymentId: {},
        updatedAt: null,
    };

    do {
        const page = await ddb.send(new ScanCommand({
            TableName: PAYMENTS_TABLE,
            ProjectionExpression: 'paymentId, #status, amountInr, creditsGranted, updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const payment of page.Items || []) {
            const amount = Number(payment.amountInr || 0);
            if (payment.paymentId) totals.amountByPaymentId[payment.paymentId] = amount;
            if (payment.updatedAt && (!totals.updatedAt || payment.updatedAt > totals.updatedAt)) {
                totals.updatedAt = payment.updatedAt;
            }
        }

        lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return totals;
}

async function getLedgerRollup() {
    let lastEvaluatedKey;
    const capturedPaymentIds = new Set();
    const soldByPayment = new Map();
    const reversedByPayment = new Map();
    let usageDebit = 0;
    let usageCredit = 0;
    let creditsRedeemed = 0;
    let updatedAt = null;

    do {
        const page = await ddb.send(new ScanCommand({
            TableName: LEDGER_TABLE,
            ProjectionExpression: 'entryId, #type, #source, metadata, credits, createdAt',
            ExpressionAttributeNames: {
                '#type': 'type',
                '#source': 'source',
            },
            ExclusiveStartKey: lastEvaluatedKey,
        }));

        for (const entry of page.Items || []) {
            const source = String(entry.source || '');
            const credits = Number(entry.credits || 0);
            if (source === 'razorpay_order') {
                const pid = entry?.metadata?.paymentId;
                if (pid) {
                    capturedPaymentIds.add(pid);
                    soldByPayment.set(pid, (soldByPayment.get(pid) || 0) + credits);
                }
            } else if (source === 'razorpay_refund') {
                const pid = entry?.metadata?.paymentId;
                if (pid) {
                    reversedByPayment.set(pid, (reversedByPayment.get(pid) || 0) + credits);
                }
            } else if (source === 'coupon_redeem') {
                creditsRedeemed += credits;
            } else if (source.startsWith('ai_usage_')) {
                if (entry.type === 'debit') usageDebit += credits;
                else if (entry.type === 'credit') usageCredit += credits;
            }
            if (entry.createdAt && (!updatedAt || entry.createdAt > updatedAt)) {
                updatedAt = entry.createdAt;
            }
        }

        lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    let creditsSold = 0;
    for (const sold of soldByPayment.values()) creditsSold += sold;

    // Cap reversal per payment to sold credits for that payment, making metrics resilient
    // against historical duplicates or webhook noise.
    let creditsReversed = 0;
    const refundedPaymentIds = new Set();
    for (const [paymentId, reversed] of reversedByPayment.entries()) {
        const sold = soldByPayment.get(paymentId) || 0;
        const effectiveReversal = Math.max(0, Math.min(reversed, sold));
        if (effectiveReversal > 0) refundedPaymentIds.add(paymentId);
        creditsReversed += effectiveReversal;
    }

    return {
        creditsSold,
        creditsRedeemed,
        creditsConsumed: Math.max(0, usageDebit - usageCredit),
        creditsReversed,
        paymentsCaptured: capturedPaymentIds.size,
        paymentsRefunded: refundedPaymentIds.size,
        capturedPaymentIds,
        updatedAt,
    };
}

async function getCouponRollup() {
    let lastEvaluatedKey;
    let couponCodesCreated = 0;
    let couponClaims = 0;
    let updatedAt = null;

    do {
        const page = await ddb.send(new ScanCommand({
            TableName: COUPONS_TABLE,
            ProjectionExpression: 'couponCode, claimedCount, updatedAt, createdAt',
            ExclusiveStartKey: lastEvaluatedKey,
        }));
        for (const coupon of page.Items || []) {
            couponCodesCreated += 1;
            couponClaims += Number(coupon.claimedCount || 0);
            const ts = coupon.updatedAt || coupon.createdAt || null;
            if (ts && (!updatedAt || ts > updatedAt)) updatedAt = ts;
        }
        lastEvaluatedKey = page.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return { couponCodesCreated, couponClaims, updatedAt };
}

async function createCoupon({
    code,
    credits,
    createdBy,
    maxClaims = 1000000,
    expiresAt = null,
    description = '',
}) {
    validateTables();
    const couponCode = normalizeCouponCode(code);
    const creditAmount = Number(credits || 0);
    const claimsLimit = Math.max(1, Number(maxClaims || 1));
    if (!couponCode || !/^[A-Z0-9_-]{4,32}$/.test(couponCode)) {
        throw new Error('Coupon code must be 4-32 chars and contain only A-Z, 0-9, - or _.');
    }
    if (!Number.isFinite(creditAmount) || creditAmount <= 0) {
        throw new Error('Coupon credits must be a positive number.');
    }

    const now = nowIso();
    const item = {
        couponCode,
        credits: Math.floor(creditAmount),
        active: true,
        maxClaims: claimsLimit,
        claimedCount: 0,
        createdBy: String(createdBy || 'admin'),
        description: String(description || ''),
        createdAt: now,
        updatedAt: now,
    };
    if (expiresAt) item.expiresAt = new Date(expiresAt).toISOString();

    await ddb.send(new PutCommand({
        TableName: COUPONS_TABLE,
        Item: item,
        ConditionExpression: 'attribute_not_exists(couponCode)',
    }));

    return item;
}

async function redeemCoupon({ userId, code }) {
    validateTables();
    await ensureUserWallet(userId);
    const couponCode = normalizeCouponCode(code);
    if (!couponCode) {
        throw new Error('Coupon code is required.');
    }

    const couponRes = await ddb.send(new GetCommand({
        TableName: COUPONS_TABLE,
        Key: { couponCode },
    }));
    const coupon = couponRes.Item;
    if (!coupon || coupon.active === false) {
        return { redeemed: false, reason: 'invalid_coupon' };
    }
    if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
        return { redeemed: false, reason: 'coupon_expired' };
    }

    const sourceId = `coupon:${couponCode}:${userId}`;
    const entryId = createDeterministicLedgerEntryId(sourceId);
    const now = nowIso();
    const credits = Number(coupon.credits || 0);
    if (!Number.isFinite(credits) || credits <= 0) {
        return { redeemed: false, reason: 'invalid_coupon' };
    }

    try {
        await ddb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Update: {
                        TableName: WALLET_TABLE,
                        Key: { userId },
                        UpdateExpression: 'SET balanceCredits = if_not_exists(balanceCredits, :zero) + :credits, updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':zero': 0,
                            ':credits': credits,
                            ':now': now,
                        },
                    },
                },
                {
                    Put: {
                        TableName: LEDGER_TABLE,
                        Item: {
                            userId,
                            entryId,
                            type: 'credit',
                            credits,
                            source: 'coupon_redeem',
                            sourceId,
                            metadata: {
                                couponCode,
                            },
                            createdAt: now,
                        },
                        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(entryId)',
                    },
                },
                {
                    Update: {
                        TableName: COUPONS_TABLE,
                        Key: { couponCode },
                        UpdateExpression: 'SET claimedCount = if_not_exists(claimedCount, :zero) + :one, updatedAt = :now',
                        ConditionExpression: 'active = :true AND (attribute_not_exists(maxClaims) OR claimedCount < maxClaims)',
                        ExpressionAttributeValues: {
                            ':zero': 0,
                            ':one': 1,
                            ':true': true,
                            ':now': now,
                        },
                    },
                },
            ],
        }));
    } catch (err) {
        if (err.name === 'TransactionCanceledException' || err.name === 'ConditionalCheckFailedException') {
            const existing = await ddb.send(new GetCommand({
                TableName: LEDGER_TABLE,
                Key: { userId, entryId },
            }));
            if (existing.Item) return { redeemed: false, reason: 'already_claimed' };

            const refreshed = await ddb.send(new GetCommand({
                TableName: COUPONS_TABLE,
                Key: { couponCode },
            }));
            const freshCoupon = refreshed.Item;
            if (!freshCoupon || freshCoupon.active === false) return { redeemed: false, reason: 'invalid_coupon' };
            if (freshCoupon.expiresAt && new Date(freshCoupon.expiresAt).getTime() < Date.now()) {
                return { redeemed: false, reason: 'coupon_expired' };
            }
            if (Number(freshCoupon.claimedCount || 0) >= Number(freshCoupon.maxClaims || 0)) {
                return { redeemed: false, reason: 'coupon_exhausted' };
            }
            return { redeemed: false, reason: 'already_claimed' };
        }
        throw err;
    }

    await incrementMetrics({
        totalOutstandingCredits: credits,
    });

    return {
        redeemed: true,
        couponCode,
        credits,
    };
}

function sumRevenueForCapturedPayments(amountByPaymentId, capturedPaymentIds) {
    let total = 0;
    for (const paymentId of capturedPaymentIds || []) {
        total += Number(amountByPaymentId[paymentId] || 0);
    }
    return total;
}

function maxIsoDate(...candidates) {
    const vals = candidates.filter(Boolean);
    if (!vals.length) return null;
    return vals.sort().at(-1) || null;
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
    createCoupon,
    redeemCoupon,
};
