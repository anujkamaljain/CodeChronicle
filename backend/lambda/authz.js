'use strict';

const jwt = require('jsonwebtoken');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const USERS_TABLE = process.env.USERS_TABLE;
const JWT_SECRET = process.env.JWT_SECRET;

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
});

function getBearerToken(event) {
    const headers = event?.headers || {};
    const normalized = {};
    for (const [k, v] of Object.entries(headers)) {
        normalized[String(k).toLowerCase()] = v;
    }
    const auth = normalized.authorization;
    if (!auth || typeof auth !== 'string') return null;
    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
}

function verifyJwt(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

async function authenticateRequest(event) {
    const token = getBearerToken(event);
    if (!token) {
        return { ok: false, statusCode: 401, body: { error: 'Authorization token is required.' } };
    }

    const decoded = verifyJwt(token);
    if (!decoded?.email) {
        return { ok: false, statusCode: 401, body: { error: 'Invalid or expired token.' } };
    }

    const result = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { email: decoded.email },
    }));

    if (!result.Item || !result.Item.emailVerified) {
        return { ok: false, statusCode: 401, body: { error: 'Account is not valid.' } };
    }

    return {
        ok: true,
        user: {
            email: decoded.email,
            name: result.Item.name || null,
        },
    };
}

module.exports = { authenticateRequest };
