const { randomUUID } = require('crypto');
const { SQSClient, SendMessageCommand, GetQueueAttributesCommand } = require('@aws-sdk/client-sqs');
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { authenticateRequest } = require('./authz');
const {
    reserveCreditsForUsage,
    creditAdjustment,
    estimateMaxCreditsForRequest,
    calculateCreditsToDebit,
} = require('./creditService');

const sqsClient = new SQSClient({});
const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';
const AI_QUERY_QUEUE_URL = process.env.AI_QUERY_QUEUE_URL;
const AI_JOBS_TABLE = process.env.AI_JOBS_TABLE;
const AI_USAGE_TABLE = process.env.AI_USAGE_TABLE;
const JOB_TTL_SECONDS = 2 * 24 * 60 * 60; // 2 days
const USAGE_TTL_SECONDS = 32 * 24 * 60 * 60; // 32 days
const AI_QUERY_MAX_BACKLOG = Number(process.env.AI_QUERY_MAX_BACKLOG || 2000);
const AI_QUERY_MAX_RESULTS = Number(process.env.AI_QUERY_MAX_RESULTS || 10);
const AI_QUERY_MAX_FILES = Number(process.env.AI_QUERY_MAX_FILES || 10);
const AI_QUERY_MAX_PROMPT_CHARS = Number(process.env.AI_QUERY_MAX_PROMPT_CHARS || 120000);
const AI_QUERY_MAX_CONTENT_PER_FILE = Number(process.env.AI_QUERY_MAX_CONTENT_PER_FILE || 12000);
const AI_QUERY_MAX_TOKENS = Number(process.env.AI_QUERY_MAX_TOKENS || 1200);
const AI_QUERY_DAILY_LIMIT = Number(process.env.AI_QUERY_DAILY_LIMIT || 200);
const AI_ASYNC_ENABLED = process.env.AI_ASYNC_ENABLED !== 'false';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

module.exports.submitQueryJob = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) {
            return response(auth.statusCode, auth.body);
        }

        if (!AI_ASYNC_ENABLED) {
            return response(503, { error: 'Async AI queue is temporarily disabled.' });
        }
        const body = JSON.parse(event.body || '{}');
        const { query, graphContext, maxResults } = body;
        const ownerId = auth.user.email;

        if (!query || typeof query !== 'string') {
            return response(400, { error: 'query is required.' });
        }
        if (!AI_QUERY_QUEUE_URL || !AI_JOBS_TABLE || !AI_USAGE_TABLE) {
            return response(500, { error: 'AI job queue is not configured.' });
        }
        if (query.length > 2000) {
            return response(400, { error: 'Query is too long. Please keep it under 2000 characters.' });
        }

        const usageCheck = await consumeDailyQuota(ownerId);
        if (!usageCheck.allowed) {
            return response(429, {
                error: `Daily AI query limit reached (${AI_QUERY_DAILY_LIMIT}).`,
                retryAt: usageCheck.retryAt,
            });
        }

        const backlog = await getQueueBacklog();
        if (backlog >= AI_QUERY_MAX_BACKLOG) {
            return response(429, {
                error: 'AI service is busy right now. Please retry shortly.',
                queued: backlog,
            });
        }

        const jobId = randomUUID();
        const nowIso = new Date().toISOString();
        const ttl = Math.floor(Date.now() / 1000) + JOB_TTL_SECONDS;

        await dynamoClient.send(new PutCommand({
            TableName: AI_JOBS_TABLE,
            Item: {
                jobId,
                type: 'query',
                ownerId,
                status: 'queued',
                createdAt: nowIso,
                updatedAt: nowIso,
                ttl,
            },
        }));

        await sqsClient.send(new SendMessageCommand({
            QueueUrl: AI_QUERY_QUEUE_URL,
            MessageBody: JSON.stringify({
                jobId,
                ownerId,
                query,
                graphContext: sanitizeGraphContext(graphContext || {}),
                maxResults: clampNumber(maxResults, 1, AI_QUERY_MAX_RESULTS, AI_QUERY_MAX_RESULTS),
            }),
        }));

        return response(202, {
            jobId,
            status: 'queued',
            pollAfterMs: 1000,
        });
    } catch (err) {
        console.error('submitQueryJob error:', err);
        return response(500, { error: 'Failed to enqueue query job. Please try again later.' });
    }
};

module.exports.getJobStatus = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) {
            return response(auth.statusCode, auth.body);
        }

        const jobId = event.pathParameters?.jobId;
        const ownerId = auth.user.email;
        if (!jobId) {
            return response(400, { error: 'jobId is required.' });
        }

        const result = await dynamoClient.send(new GetCommand({
            TableName: AI_JOBS_TABLE,
            Key: { jobId },
        }));

        if (!result.Item) {
            return response(404, { error: 'Job not found.' });
        }
        if (result.Item.ownerId && result.Item.ownerId !== ownerId) {
            return response(403, { error: 'Not authorized to view this job.' });
        }

        const item = result.Item;
        return response(200, {
            jobId: item.jobId,
            status: item.status,
            result: item.result || null,
            error: item.error || null,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        });
    } catch (err) {
        console.error('getJobStatus error:', err);
        return response(500, { error: 'Failed to fetch job status. Please try again later.' });
    }
};

module.exports.processQueryJob = async (event) => {
    const records = event.Records || [];

    for (const record of records) {
        let parsed;
        try {
            parsed = JSON.parse(record.body || '{}');
        } catch (err) {
            console.error('Invalid queue payload:', err.message);
            continue;
        }

        const { jobId, query, graphContext, maxResults } = parsed;
        if (!jobId || !query || !parsed.ownerId) {
            console.error('Missing required job payload fields.');
            continue;
        }

        const nowIso = new Date().toISOString();
        try {
            await dynamoClient.send(new UpdateCommand({
                TableName: AI_JOBS_TABLE,
                Key: { jobId },
                UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
                ConditionExpression: 'attribute_exists(jobId) AND #status = :queued',
                ExpressionAttributeNames: { '#status': 'status' },
                ExpressionAttributeValues: {
                    ':queued': 'queued',
                    ':status': 'processing',
                    ':updatedAt': nowIso,
                },
            }));

            const prompt = buildQueryPrompt({ query, graphContext, maxResults });
            const reservedCredits = estimateMaxCreditsForRequest(prompt.length, AI_QUERY_MAX_TOKENS);
            try {
                await reserveCreditsForUsage({
                    userId: parsed.ownerId,
                    credits: reservedCredits,
                    source: 'ai_usage_reserve',
                    sourceId: `reserve:async:${jobId}`,
                    metadata: { queryLength: query.length, maxTokens: AI_QUERY_MAX_TOKENS },
                });
            } catch (billingErr) {
                if (billingErr.name === 'ConditionalCheckFailedException' || billingErr.name === 'TransactionCanceledException') {
                    throw new Error('Insufficient credits. Please buy more credits to continue.');
                }
                throw billingErr;
            }

            let aiResponse;
            try {
                aiResponse = await invokeModel(prompt, AI_QUERY_MAX_TOKENS);
            } catch (invokeErr) {
                await creditAdjustment({
                    userId: parsed.ownerId,
                    credits: reservedCredits,
                    source: 'ai_usage_reserve_release',
                    sourceId: `reserve_release:async:${jobId}`,
                    metadata: { reason: 'invoke_failed', message: invokeErr.message },
                });
                throw invokeErr;
            }

            let result;
            try {
                result = JSON.parse(aiResponse.text);
            } catch {
                result = {
                    answer: aiResponse.text.trim(),
                    references: [],
                    suggestedQuestions: [],
                    confidence: 0.5,
                };
            }

            const totalActual = calculateCreditsToDebit(aiResponse.usage.inputTokens, aiResponse.usage.outputTokens);
            if (totalActual < reservedCredits) {
                await creditAdjustment({
                    userId: parsed.ownerId,
                    credits: reservedCredits - totalActual,
                    source: 'ai_usage_reconciliation_credit',
                    sourceId: `reserve_reconcile:async:${jobId}`,
                    metadata: { reservedCredits, totalActual },
                });
            } else if (totalActual > reservedCredits) {
                await reserveCreditsForUsage({
                    userId: parsed.ownerId,
                    credits: totalActual - reservedCredits,
                    source: 'ai_usage_reconciliation_debit',
                    sourceId: `reserve_reconcile_extra:async:${jobId}`,
                    metadata: { reservedCredits, totalActual },
                });
            }

            await dynamoClient.send(new UpdateCommand({
                TableName: AI_JOBS_TABLE,
                Key: { jobId },
                UpdateExpression: 'SET #status = :status, #result = :result, updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#status': 'status', '#result': 'result' },
                ExpressionAttributeValues: {
                    ':status': 'completed',
                    ':result': result,
                    ':updatedAt': new Date().toISOString(),
                },
            }));
        } catch (err) {
            if (err.name === 'ConditionalCheckFailedException') {
                // Already processed or no longer queued; avoid duplicate charging on SQS retries.
                console.warn(`Skipping duplicate/non-queued job ${jobId}.`);
                continue;
            }
            console.error(`processQueryJob error for ${jobId}:`, err);
            await dynamoClient.send(new UpdateCommand({
                TableName: AI_JOBS_TABLE,
                Key: { jobId },
                UpdateExpression: 'SET #status = :status, #error = :error, updatedAt = :updatedAt',
                ExpressionAttributeNames: { '#status': 'status', '#error': 'error' },
                ExpressionAttributeValues: {
                    ':status': 'failed',
                    ':error': err.message || 'Unknown processing error',
                    ':updatedAt': new Date().toISOString(),
                },
            }));
            // Job is now terminally marked as failed; don't rethrow and trigger duplicate SQS redelivery.
            continue;
        }
    }
};

async function invokeModel(prompt, maxTokens = 2048) {
    const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [
            {
                role: 'user',
                content: [{ text: prompt }],
            },
        ],
        inferenceConfig: {
            maxTokens,
            temperature: 0.3,
            topP: 0.9,
        },
    });

    const result = await bedrockClient.send(command);
    return {
        text: result.output.message.content[0].text,
        usage: {
            inputTokens: result.usage?.inputTokens || 0,
            outputTokens: result.usage?.outputTokens || 0,
        },
    };
}

function buildQueryPrompt({ query, graphContext, maxResults }) {
    const fileEntries = graphContext?.relevantFiles
        ?.slice(0, clampNumber(maxResults, 1, AI_QUERY_MAX_RESULTS, AI_QUERY_MAX_RESULTS))
        ?.map((f) => {
            let entry = `### ${f.path}`;
            if (f.summary) entry += `\nSummary: ${f.summary}`;
            entry += `\n(${f.metrics?.linesOfCode || '?'} LOC, ${f.metrics?.dependencyCount || 0} deps, ${f.metrics?.dependentCount || 0} dependents, centrality: ${(f.metrics?.centralityScore || 0).toFixed(3)})`;
            if (f.content) entry += `\n\`\`\`\n${String(f.content).substring(0, AI_QUERY_MAX_CONTENT_PER_FILE)}\n\`\`\``;
            return entry;
        })
        ?.join('\n\n') || 'No files available.';

    const prompt = `You are a precise code analysis assistant. Answer questions about a codebase using ONLY the source code and metadata provided below. Do NOT hallucinate or guess information that isn't in the provided context.

User Query: ${query}

Codebase Context:
Total Files in Codebase: ${graphContext?.totalFiles || 'unknown'}
Files Provided Below: ${graphContext?.relevantFiles?.length || 0} (ranked by relevance)

Relevant Files:
${fileEntries}

RULES:
1. Base your answer STRICTLY on the code and metadata provided above.
2. Reference specific file paths, function/class/variable names, and logic you can actually see.
3. If the provided files don't contain enough information to fully answer, explicitly state what's missing.
4. Do NOT invent line numbers — they are unreliable. Reference by function/class name instead.
5. Be concise but thorough. Prefer specificity over vagueness.
6. For large codebases, focus on the most architecturally significant files.

Format your response as JSON:
{
  "answer": "Your precise answer referencing actual code",
  "references": [
    {
      "path": "src/file.js",
      "snippet": "brief description of what this file contributes to the answer"
    }
  ],
  "suggestedQuestions": ["follow-up question 1", "follow-up question 2"],
  "confidence": 0.85
}

Return ONLY the JSON object, no markdown wrapping.`;

    return prompt.substring(0, AI_QUERY_MAX_PROMPT_CHARS);
}

async function getQueueBacklog() {
    try {
        const result = await sqsClient.send(new GetQueueAttributesCommand({
            QueueUrl: AI_QUERY_QUEUE_URL,
            AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
        }));

        const visible = Number(result.Attributes?.ApproximateNumberOfMessages || 0);
        const inflight = Number(result.Attributes?.ApproximateNumberOfMessagesNotVisible || 0);
        return visible + inflight;
    } catch (err) {
        console.warn('Failed to read queue backlog:', err.message);
        // Fail-open to avoid accidental outage if SQS attribute call fails.
        return 0;
    }
}

async function consumeDailyQuota(ownerId) {
    const day = new Date().toISOString().slice(0, 10);
    const pk = `${ownerId}#${day}`;
    const now = Date.now();
    const tomorrow = new Date(day);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    try {
        await dynamoClient.send(new UpdateCommand({
            TableName: AI_USAGE_TABLE,
            Key: { usageKey: pk },
            UpdateExpression: 'SET requestCount = if_not_exists(requestCount, :zero) + :one, ownerId = :ownerId, usageDate = :usageDate, updatedAt = :updatedAt, #ttl = :ttl',
            ConditionExpression: 'attribute_not_exists(requestCount) OR requestCount < :limit',
            ExpressionAttributeNames: {
                '#ttl': 'ttl',
            },
            ExpressionAttributeValues: {
                ':zero': 0,
                ':one': 1,
                ':limit': AI_QUERY_DAILY_LIMIT,
                ':ownerId': ownerId,
                ':usageDate': day,
                ':updatedAt': new Date().toISOString(),
                ':ttl': Math.floor((now + USAGE_TTL_SECONDS * 1000) / 1000),
            },
        }));
        return { allowed: true };
    } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
            return { allowed: false, retryAt: tomorrow.toISOString() };
        }
        console.error('Usage quota update failed (fail-open):', err);
        // Fail-open for transient/internal issues to avoid blocking all AI traffic.
        return { allowed: true };
    }
}

function sanitizeGraphContext(graphContext) {
    const relevantFiles = Array.isArray(graphContext?.relevantFiles)
        ? graphContext.relevantFiles.slice(0, AI_QUERY_MAX_FILES).map((f) => ({
            path: f?.path || 'unknown',
            summary: f?.summary ? String(f.summary).substring(0, 3000) : undefined,
            metrics: f?.metrics || undefined,
            content: f?.content ? String(f.content).substring(0, AI_QUERY_MAX_CONTENT_PER_FILE) : undefined,
        }))
        : [];

    return {
        totalFiles: Number(graphContext?.totalFiles || 0),
        relevantFiles,
    };
}

function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
}

function response(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        body: JSON.stringify(body),
    };
}
