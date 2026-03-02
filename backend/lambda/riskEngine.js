const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const RISKS_TABLE = process.env.RISKS_TABLE;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ========================================
// POST /ai/risk-score
// ========================================
module.exports.assessRisk = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { filePath, fileHash, metrics, dependencies, dependents, fileContent } = body;

        if (!filePath || !fileHash) {
            return response(400, { error: 'filePath and fileHash are required.' });
        }

        // Check DynamoDB cache first
        const cached = await getCachedRisk(fileHash, filePath);
        if (cached) {
            console.log(`Cache hit for risk: ${filePath}`);
            return response(200, {
                riskFactor: cached.riskFactor,
                cached: true,
                timestamp: cached.timestamp,
            });
        }

        // Build risk assessment prompt
        const prompt = buildRiskPrompt({ filePath, fileContent, metrics, dependencies, dependents });

        // Call Bedrock
        const aiResponse = await invokeModel(prompt);

        // Parse AI response
        let riskFactor;
        try {
            riskFactor = JSON.parse(aiResponse);
        } catch {
            // Fallback if AI doesn't return proper JSON
            riskFactor = {
                level: 'medium',
                score: 50,
                explanation: aiResponse.trim().substring(0, 200),
                factors: ['Unable to parse structured risk assessment'],
            };
        }

        // Validate and normalize
        riskFactor.score = Math.max(0, Math.min(100, Number(riskFactor.score) || 50));
        if (!['low', 'medium', 'high'].includes(riskFactor.level)) {
            riskFactor.level = riskFactor.score >= 60 ? 'high' : riskFactor.score >= 30 ? 'medium' : 'low';
        }
        riskFactor.factors = Array.isArray(riskFactor.factors) ? riskFactor.factors : [];

        // Cache in DynamoDB
        await cacheRisk(fileHash, filePath, riskFactor);

        console.log(`Risk assessed for ${filePath}: ${riskFactor.level} (${riskFactor.score}/100)`);
        return response(200, {
            riskFactor,
            cached: false,
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        console.error('Risk assessment error:', err);
        return response(500, { error: 'Failed to assess risk.', details: err.message });
    }
};

// ========================================
// Helper: Invoke Bedrock model
// ========================================
async function invokeModel(prompt, maxTokens = 1024) {
    const requestBody = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
        temperature: 0.2,
        top_p: 0.9,
    };

    const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(requestBody),
    });

    const result = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(result.body));

    return responseBody.content[0].text;
}

// ========================================
// Helper: Build risk prompt
// ========================================
function buildRiskPrompt({ filePath, fileContent, metrics, dependencies, dependents }) {
    return `You are assessing the risk of modifying a source code file.

File: ${filePath}
${metrics ? `Structural Metrics:
- Lines of Code: ${metrics.linesOfCode}
- Number of Dependencies: ${metrics.dependencyCount}
- Number of Dependents: ${metrics.dependentCount}
- Centrality Score: ${metrics.centralityScore}` : ''}

${fileContent ? `File Content:
${fileContent.substring(0, 4000)}` : 'File content not provided. Assess based on metrics only.'}

${dependencies ? `Dependencies: ${JSON.stringify(dependencies)}` : ''}
${dependents ? `Dependents: ${JSON.stringify(dependents)}` : ''}

Analyze this file for semantic risk factors including:
- Business-critical logic
- Side effects (database writes, API calls, file I/O)
- Security-sensitive operations (authentication, authorization, encryption)
- Hidden coupling (global state, singletons, event emitters)
- Complex control flow or error handling

Return a JSON object with:
{
  "level": "low" | "medium" | "high",
  "score": 0-100,
  "explanation": "Brief explanation of the risk",
  "factors": ["factor1", "factor2"]
}

Return ONLY the JSON object, no markdown formatting.`;
}

// ========================================
// Helper: DynamoDB cache operations
// ========================================
async function getCachedRisk(fileHash, filePath) {
    try {
        const result = await dynamoClient.send(new GetCommand({
            TableName: RISKS_TABLE,
            Key: { fileHash, filePath },
        }));
        return result.Item || null;
    } catch (err) {
        console.warn('Cache lookup failed:', err.message);
        return null;
    }
}

async function cacheRisk(fileHash, filePath, riskFactor) {
    try {
        await dynamoClient.send(new PutCommand({
            TableName: RISKS_TABLE,
            Item: {
                fileHash,
                filePath,
                riskFactor,
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
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify(body),
    };
}
