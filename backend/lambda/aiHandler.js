const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';
const SUMMARIES_TABLE = process.env.SUMMARIES_TABLE;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ========================================
// POST /ai/explain
// ========================================
module.exports.explain = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { filePath, fileHash, metrics, dependencies, dependents, fileContent } = body;

        if (!filePath || !fileHash) {
            return response(400, { error: 'filePath and fileHash are required.' });
        }

        // Check DynamoDB cache first
        const cached = await getCachedSummary(fileHash, filePath);
        if (cached) {
            console.log(`Cache hit for summary: ${filePath}`);
            return response(200, {
                summary: cached.summary,
                cached: true,
                timestamp: cached.timestamp,
            });
        }

        // Build prompt
        const prompt = buildSummaryPrompt({ filePath, fileContent, metrics, dependencies, dependents });

        // Call Bedrock
        const aiResponse = await invokeModel(prompt);
        const summary = aiResponse.trim();

        // Cache in DynamoDB
        await cacheSummary(fileHash, filePath, summary);

        console.log(`Generated summary for: ${filePath}`);
        return response(200, {
            summary,
            cached: false,
            timestamp: new Date().toISOString(),
        });

    } catch (err) {
        console.error('Explain error:', err);
        return response(500, { error: 'Failed to generate summary.', details: err.message });
    }
};

// ========================================
// POST /ai/query
// ========================================
module.exports.query = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { query, graphContext, maxResults } = body;

        if (!query) {
            return response(400, { error: 'query is required.' });
        }

        const prompt = buildQueryPrompt({ query, graphContext, maxResults });
        const aiResponse = await invokeModel(prompt);

        // Try to parse structured response
        let result;
        try {
            result = JSON.parse(aiResponse);
        } catch {
            result = {
                answer: aiResponse.trim(),
                references: [],
                suggestedQuestions: [],
                confidence: 0.5,
            };
        }

        console.log(`Processed query: "${query.substring(0, 50)}..."`);
        return response(200, result);

    } catch (err) {
        console.error('Query error:', err);
        return response(500, { error: 'Failed to process query.', details: err.message });
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
        temperature: 0.3,
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
${fileContent.substring(0, 4000)}` : 'File content not provided.'}

${dependencies ? `This file imports: ${JSON.stringify(dependencies)}` : ''}
${dependents ? `This file is imported by: ${JSON.stringify(dependents)}` : ''}

Generate a concise summary (2-3 sentences) explaining:
1. What this file does
2. Why it exists in the codebase
3. Its role in the overall architecture

Return only the summary text, no additional formatting.`;
}

function buildQueryPrompt({ query, graphContext, maxResults }) {
    const relevantFiles = graphContext?.relevantFiles
        ?.slice(0, maxResults || 10)
        ?.map((f) => `- ${f.path}${f.summary ? `: ${f.summary}` : ''} (${f.metrics?.linesOfCode || '?'} LOC, centrality: ${f.metrics?.centralityScore || '?'})`)
        ?.join('\n') || 'No files available.';

    return `You are answering questions about a codebase.

User Query: ${query}

Codebase Context:
Total Files: ${graphContext?.totalFiles || 'unknown'}

Relevant Files:
${relevantFiles}

Answer the user's question with:
1. A clear, concise answer
2. Specific file references with paths
3. Suggested follow-up questions if helpful

Format your response as JSON:
{
  "answer": "Your answer here",
  "references": [
    {
      "path": "src/file.js",
      "lineNumbers": [],
      "snippet": "relevant info"
    }
  ],
  "suggestedQuestions": ["question1", "question2"],
  "confidence": 0.85
}

Return ONLY the JSON object, no markdown formatting.`;
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
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
        body: JSON.stringify(body),
    };
}
