const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');
const { authenticateRequest } = require('./authz');
const {
    reserveCreditsForUsage,
    creditAdjustment,
    estimateMaxCreditsForRequest,
    calculateCreditsToDebit,
} = require('./creditService');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-lite-v1:0';
const SUMMARIES_TABLE = process.env.SUMMARIES_TABLE;
const AI_USAGE_TABLE = process.env.AI_USAGE_TABLE;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const USAGE_TTL_SECONDS = 32 * 24 * 60 * 60; // 32 days
const AI_QUERY_DAILY_LIMIT = Number(process.env.AI_QUERY_DAILY_LIMIT || 200);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ========================================
// POST /ai/explain
// ========================================
module.exports.explain = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) {
            return response(auth.statusCode, auth.body);
        }

        const body = JSON.parse(event.body || '{}');
        const { filePath, fileHash, metrics, dependencies, dependents, fileContent, detailed, relationship } = body;

        if (relationship) {
            return handleRelationshipExplain(relationship, auth.user.email);
        }

        if (!filePath || !fileHash) {
            return response(400, { error: 'filePath and fileHash are required.' });
        }

        const cacheKey = detailed ? `detailed:${fileHash}` : fileHash;

        // Check DynamoDB cache first
        const cached = await getCachedSummary(cacheKey, filePath);
        if (cached) {
            console.log(`Cache hit for ${detailed ? 'detailed ' : ''}summary: ${filePath}`);
            return response(200, {
                summary: cached.summary,
                cached: true,
                timestamp: cached.timestamp,
            });
        }

        // Build prompt
        const prompt = detailed
            ? buildDetailedSummaryPrompt({ filePath, fileContent, metrics, dependencies, dependents })
            : buildSummaryPrompt({ filePath, fileContent, metrics, dependencies, dependents });

        // Keep synchronous requests bounded to reduce API timeout risk.
        const maxTokens = detailed ? 2200 : 700;

        const usageId = randomUUID();
        const reservedCredits = estimateMaxCreditsForRequest(prompt.length, maxTokens);
        try {
            await reserveCreditsForUsage({
                userId: auth.user.email,
                credits: reservedCredits,
                source: 'ai_usage_reserve',
                sourceId: `reserve:${usageId}`,
                metadata: { filePath, detailed: !!detailed, maxTokens },
            });
        } catch (billingErr) {
            if (billingErr.name === 'ConditionalCheckFailedException' || billingErr.name === 'TransactionCanceledException') {
                return response(402, { error: 'Insufficient credits. Please buy more credits to continue.' });
            }
            throw billingErr;
        }

        let aiResponse;
        try {
            // Call Bedrock via Converse API
            aiResponse = await invokeModel(prompt, maxTokens);
        } catch (invokeErr) {
            await creditAdjustment({
                userId: auth.user.email,
                credits: reservedCredits,
                source: 'ai_usage_reserve_release',
                sourceId: `reserve_release:${usageId}`,
                metadata: { reason: 'invoke_failed', message: invokeErr.message },
            });
            throw invokeErr;
        }
        const summary = aiResponse.text.trim();

        const totalActual = calculateCreditsToDebit(aiResponse.usage.inputTokens, aiResponse.usage.outputTokens);
        if (totalActual < reservedCredits) {
            await creditAdjustment({
                userId: auth.user.email,
                credits: reservedCredits - totalActual,
                source: 'ai_usage_reconciliation_credit',
                sourceId: `reserve_reconcile:${usageId}`,
                metadata: { reservedCredits, totalActual },
            });
        } else if (totalActual > reservedCredits) {
            await reserveCreditsForUsage({
                userId: auth.user.email,
                credits: totalActual - reservedCredits,
                source: 'ai_usage_reconciliation_debit',
                sourceId: `reserve_reconcile_extra:${usageId}`,
                metadata: { reservedCredits, totalActual },
            });
        }

        // Cache in DynamoDB
        await cacheSummary(cacheKey, filePath, summary);

        console.log(`Generated ${detailed ? 'detailed ' : ''}summary for: ${filePath}`);
        return response(200, {
            summary,
            cached: false,
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        console.error('Explain error:', err);
        return response(500, { error: 'Failed to generate summary. Please try again later.' });
    }
};

// ========================================
// POST /ai/query
// ========================================
module.exports.query = async (event) => {
    try {
        const auth = await authenticateRequest(event);
        if (!auth.ok) {
            return response(auth.statusCode, auth.body);
        }

        const body = JSON.parse(event.body || '{}');
        const { query, graphContext, maxResults } = body;

        if (!query) {
            return response(400, { error: 'query is required.' });
        }
        if (String(query).length > 2000) {
            return response(400, { error: 'Query is too long. Please keep it under 2000 characters.' });
        }

        const usage = await consumeDailyQuota(auth.user.email);
        if (!usage.allowed) {
            return response(429, {
                error: `Daily AI query limit reached (${AI_QUERY_DAILY_LIMIT}).`,
                retryAt: usage.retryAt,
            });
        }

        const prompt = buildQueryPrompt({ query, graphContext, maxResults });
        const usageId = randomUUID();
        const reservedCredits = estimateMaxCreditsForRequest(prompt.length, 2048);
        try {
            await reserveCreditsForUsage({
                userId: auth.user.email,
                credits: reservedCredits,
                source: 'ai_usage_reserve',
                sourceId: `reserve:${usageId}`,
                metadata: { queryLength: query.length, maxTokens: 2048 },
            });
        } catch (billingErr) {
            if (billingErr.name === 'ConditionalCheckFailedException' || billingErr.name === 'TransactionCanceledException') {
                return response(402, { error: 'Insufficient credits. Please buy more credits to continue.' });
            }
            throw billingErr;
        }

        let aiResponse;
        try {
            aiResponse = await invokeModel(prompt, 2048);
        } catch (invokeErr) {
            await creditAdjustment({
                userId: auth.user.email,
                credits: reservedCredits,
                source: 'ai_usage_reserve_release',
                sourceId: `reserve_release:${usageId}`,
                metadata: { reason: 'invoke_failed', message: invokeErr.message },
            });
            throw invokeErr;
        }

        // Try to parse structured response
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
                userId: auth.user.email,
                credits: reservedCredits - totalActual,
                source: 'ai_usage_reconciliation_credit',
                sourceId: `reserve_reconcile:${usageId}`,
                metadata: { reservedCredits, totalActual },
            });
        } else if (totalActual > reservedCredits) {
            await reserveCreditsForUsage({
                userId: auth.user.email,
                credits: totalActual - reservedCredits,
                source: 'ai_usage_reconciliation_debit',
                sourceId: `reserve_reconcile_extra:${usageId}`,
                metadata: { reservedCredits, totalActual },
            });
        }

        console.log(`Processed query: "${query.substring(0, 50)}..."`);
        return response(200, result);

    } catch (err) {
        console.error('Query error:', err);
        return response(500, { error: 'Failed to process query. Please try again later.' });
    }
};

// ========================================
// Helper: Invoke Bedrock model via Converse API
// ========================================
async function invokeModel(prompt, maxTokens = 1024) {
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

// ========================================
// Helper: Build prompts
// ========================================
function buildSummaryPrompt({ filePath, fileContent, metrics, dependencies, dependents }) {
    return `You are analyzing a source code file in a large codebase.

File: ${filePath}
${metrics ? `Lines of Code: ${metrics.linesOfCode}
Dependencies: ${metrics.dependencyCount}
Dependents: ${metrics.dependentCount}
Centrality Score: ${metrics.centralityScore}` : ''}

${fileContent ? `File Content:
${fileContent.substring(0, 80000)}` : 'File content not provided — infer purpose from file path, metrics, and dependency graph only.'}

${dependencies ? `This file imports: ${JSON.stringify(dependencies)}` : ''}
${dependents ? `This file is imported by: ${JSON.stringify(dependents)}` : ''}

Generate a concise summary (2-3 sentences) explaining:
1. What this file does
2. Why it exists in the codebase
3. Its role in the overall architecture

Return only the summary text, no additional formatting.`;
}

function buildDetailedSummaryPrompt({ filePath, fileContent, metrics, dependencies, dependents }) {
    return `You are an expert software architect performing a deep analysis of a source code file.

File: ${filePath}
${metrics ? `Lines of Code: ${metrics.linesOfCode}
Dependencies: ${metrics.dependencyCount}
Dependents: ${metrics.dependentCount}
Centrality Score: ${metrics.centralityScore}` : ''}

${fileContent ? `File Content:
${fileContent.substring(0, 80000)}` : 'File content not provided — infer from file path, metrics, and dependency graph.'}

${dependencies ? `This file imports: ${JSON.stringify(dependencies)}` : ''}
${dependents ? `This file is imported by: ${JSON.stringify(dependents)}` : ''}

Provide an exhaustive 7-section analysis. Use EXACTLY these section headers followed by a colon:

Purpose & Overview:
Explain what this file does, why it exists, and its primary responsibilities. Be thorough.

Key Components:
List and describe every major export, class, function, constant, or pattern. Explain what each does and how they relate.

Architecture Role:
Describe how this file fits into the broader codebase architecture. What layer does it belong to? What patterns does it implement?

Dependency Analysis:
Analyze its imports (what it depends on) and its dependents (what depends on it). Identify any tight coupling or circular risks.

Data Flow & State Management:
Trace how data enters, transforms, and exits this file. Identify state management patterns, side effects, and data boundaries.

Risk & Complexity:
Identify complexity hotspots, potential failure points, error handling gaps, security concerns, and maintainability issues.

Improvement Suggestions:
Provide concrete, actionable suggestions for refactoring, performance improvements, better error handling, or architectural changes.

Write each section with 3-5 detailed sentences. Be specific — reference actual code constructs when possible.`;
}

async function handleRelationshipExplain(rel, userId) {
    const { sourceFile, targetFile, cacheKey } = rel;
    if (!sourceFile?.path || !targetFile?.path) {
        return response(400, { error: 'relationship requires sourceFile and targetFile with path.' });
    }

    const cached = await getCachedSummary(cacheKey, `${sourceFile.path}|${targetFile.path}`);
    if (cached) {
        return response(200, { summary: cached.summary, cached: true, timestamp: cached.timestamp });
    }

    const sourceId = `relationship_${cacheKey || `${sourceFile.path}:${targetFile.path}`}_${Date.now()}`;
    const prompt = buildRelationshipPrompt(rel);
    const estimatedCredits = estimateMaxCreditsForRequest(prompt.length, 2048);

    try {
        await reserveCreditsForUsage({
            userId,
            credits: estimatedCredits,
            source: 'ai_relationship_explain',
            sourceId,
            metadata: { sourceFile: sourceFile.path, targetFile: targetFile.path },
        });
    } catch (billingErr) {
        if (billingErr.name === 'ConditionalCheckFailedException' || billingErr.name === 'TransactionCanceledException') {
            return response(402, { error: 'Insufficient credits. Please buy more credits to continue.' });
        }
        throw billingErr;
    }

    let aiResponse;
    try {
        aiResponse = await invokeModel(prompt, 2048);
    } catch (invokeErr) {
        const refundCredits = estimatedCredits;
        await creditAdjustment({
            userId,
            credits: refundCredits,
            source: 'ai_relationship_explain_refund',
            sourceId: `${sourceId}_refund`,
            metadata: { reason: 'invoke_failed' },
        }).catch(() => {});
        throw invokeErr;
    }
    const summary = aiResponse.text.trim();

    const actualCredits = calculateCreditsToDebit(aiResponse.inputTokens || 0, aiResponse.outputTokens || 0);
    const refund = estimatedCredits - actualCredits;
    if (refund > 0) {
        await creditAdjustment({
            userId,
            credits: refund,
            source: 'ai_relationship_explain_reconciliation',
            sourceId: `${sourceId}_reconciliation`,
            metadata: { estimated: estimatedCredits, actual: actualCredits },
        }).catch(() => {});
    }

    await cacheSummary(cacheKey, `${sourceFile.path}|${targetFile.path}`, summary);

    return response(200, { summary, cached: false, timestamp: new Date().toISOString() });
}

function buildRelationshipPrompt({ sourceFile, targetFile, direction }) {
    const describeFile = (f) => {
        let desc = `File: ${f.path}`;
        if (f.metrics) {
            desc += `\nLOC: ${f.metrics.linesOfCode}, Dependencies: ${f.metrics.dependencyCount}, Dependents: ${f.metrics.dependentCount}, Centrality: ${f.metrics.centralityScore}`;
        }
        if (f.summary) desc += `\nSummary: ${f.summary}`;
        if (f.content) desc += `\n\nSource Code:\n${f.content.substring(0, 40000)}`;
        return desc;
    };

    const arrow = direction === 'dependency' ? 'imports' : 'is imported by';

    return `You are an expert software architect analyzing the relationship between two connected files in a codebase.

${describeFile(sourceFile)}

---

${describeFile(targetFile)}

---

Connection: "${sourceFile.path}" ${arrow} "${targetFile.path}"

Analyze this dependency relationship in detail. Use EXACTLY these section headers followed by a colon:

Connection Type:
What kind of dependency is this? (data import, component usage, utility consumption, configuration, type/interface sharing, etc.) Be specific about what is being imported and used.

What Gets Exchanged:
Precisely describe the exports/imports between these files — functions, classes, constants, types, or default exports. Name them specifically if you can infer from the code.

Why They're Connected:
Explain the architectural reason these files depend on each other. What purpose does this connection serve in the system design?

Coupling Assessment:
Rate the coupling (Loose / Moderate / Tight) and explain why. Is this dependency healthy or does it introduce risk? Could changes to one file break the other?

Potential Improvements:
If applicable, suggest ways to reduce coupling, improve the interface between them, or refactor the dependency. If the connection is clean, say so.

Write 2-4 sentences per section. Be specific — reference actual code constructs when possible.`;
}

function buildQueryPrompt({ query, graphContext, maxResults }) {
    const fileEntries = graphContext?.relevantFiles
        ?.slice(0, maxResults || 10)
        ?.map((f) => {
            let entry = `### ${f.path}`;
            if (f.summary) entry += `\nSummary: ${f.summary}`;
            entry += `\n(${f.metrics?.linesOfCode || '?'} LOC, ${f.metrics?.dependencyCount || 0} deps, ${f.metrics?.dependentCount || 0} dependents, centrality: ${(f.metrics?.centralityScore || 0).toFixed(3)})`;
            if (f.content) {
                entry += `\n\`\`\`\n${f.content}\n\`\`\``;
            }
            return entry;
        })
        ?.join('\n\n') || 'No files available.';

    return `You are a precise code analysis assistant. Answer questions about a codebase using ONLY the source code and metadata provided below. Do NOT hallucinate or guess information that isn't in the provided context.

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
}

// ========================================
// Helper: DynamoDB cache operations
// ========================================
async function getCachedSummary(fileHash, filePath) {
    try {
        const result = await dynamoClient.send(new GetCommand({
            TableName: SUMMARIES_TABLE,
            Key: { fileHash, filePath },
        }));
        return result.Item || null;
    } catch (err) {
        console.warn('Cache lookup failed:', err.message);
        return null;
    }
}

async function cacheSummary(fileHash, filePath, summary) {
    try {
        await dynamoClient.send(new PutCommand({
            TableName: SUMMARIES_TABLE,
            Item: {
                fileHash,
                filePath,
                summary,
                timestamp: new Date().toISOString(),
                ttl: Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS,
            },
        }));
    } catch (err) {
        console.warn('Cache write failed:', err.message);
    }
}

// ========================================
// Helper: HTTP response
// ========================================
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
            ExpressionAttributeNames: { '#ttl': 'ttl' },
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
        console.error('Sync query quota update failed (fail-open):', err);
        return { allowed: true };
    }
}
