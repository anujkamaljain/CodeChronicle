const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SUMMARIES_TABLE = process.env.SUMMARIES_TABLE;
const RISKS_TABLE = process.env.RISKS_TABLE;
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ========================================
// GET /cache/{hash}
// ========================================
module.exports.get = async (event) => {
    try {
        const hash = event.pathParameters?.hash;
        const filePath = event.queryStringParameters?.filePath;

        if (!hash) {
            return response(400, { error: 'hash parameter is required.' });
        }

        const results = {};

        // Check summaries table
        if (filePath) {
            const summaryResult = await dynamoClient.send(new GetCommand({
                TableName: SUMMARIES_TABLE,
                Key: { fileHash: hash, filePath },
            }));
            if (summaryResult.Item) {
                results.summary = {
                    summary: summaryResult.Item.summary,
                    timestamp: summaryResult.Item.timestamp,
                    cached: true,
                };
            }

            // Check risks table
            const riskResult = await dynamoClient.send(new GetCommand({
                TableName: RISKS_TABLE,
                Key: { fileHash: hash, filePath },
            }));
            if (riskResult.Item) {
                results.risk = {
                    riskFactor: riskResult.Item.riskFactor,
                    timestamp: riskResult.Item.timestamp,
                    cached: true,
                };
            }
        }

        if (Object.keys(results).length === 0) {
            return response(404, { error: 'No cached data found.' });
        }

        return response(200, results);

    } catch (err) {
        console.error('Cache get error:', err);
        return response(500, { error: 'Failed to retrieve cache.', details: err.message });
    }
};

// ========================================
// POST /cache
// ========================================
module.exports.put = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { fileHash, filePath, type, data } = body;

        if (!fileHash || !filePath || !type || !data) {
            return response(400, { error: 'fileHash, filePath, type, and data are required.' });
        }

        const table = type === 'summary' ? SUMMARIES_TABLE : RISKS_TABLE;
        const item = {
            fileHash,
            filePath,
            ...data,
            timestamp: new Date().toISOString(),
            ttl: Math.floor(Date.now() / 1000) + CACHE_TTL_SECONDS,
        };

        await dynamoClient.send(new PutCommand({
            TableName: table,
            Item: item,
        }));

        console.log(`Cached ${type} for ${filePath}`);
        return response(200, { success: true, type, filePath });

    } catch (err) {
        console.error('Cache put error:', err);
        return response(500, { error: 'Failed to store cache.', details: err.message });
    }
};

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
