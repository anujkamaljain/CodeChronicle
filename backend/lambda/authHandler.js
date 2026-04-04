'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    GetCommand,
    PutCommand,
    UpdateCommand,
    QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ─── Configuration ───────────────────────────────────────────────
const USERS_TABLE = process.env.USERS_TABLE;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || 'noreply@codechronicle.dev';
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'CodeChronicle';
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;
const BCRYPT_SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

// ─── DynamoDB Client ─────────────────────────────────────────────
const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
});

// ─── CORS Headers ────────────────────────────────────────────────
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Content-Type': 'application/json',
};

// ─── Utility Functions ───────────────────────────────────────────

/**
 * Build a standardised HTTP response.
 */
function respond(statusCode, body) {
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
    };
}

/**
 * Validate email format with a production-grade regex.
 */
function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(email) && email.length <= 254;
}

/**
 * Validate password strength.
 * Requires: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
 */
function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, message: 'Password is required.' };
    }
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters.' };
    }
    if (password.length > 128) {
        return { valid: false, message: 'Password must be at most 128 characters.' };
    }
    if (!/[A-Z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-z]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[0-9]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one digit.' };
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
        return { valid: false, message: 'Password must contain at least one special character.' };
    }
    return { valid: true };
}

/**
 * Generate a cryptographically secure 6-digit verification code.
 */
function generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
}

/**
 * Sign a JWT token.
 */
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

/**
 * Verify and decode a JWT token.
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

/**
 * Send verification email via Brevo Transactional API (REST, no SDK needed).
 */
async function sendVerificationEmail(email, code, name) {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#050a14;font-family:'Segoe UI',system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#050a14;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:rgba(15,23,42,0.95);border:1px solid rgba(148,163,184,0.12);border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 20px;text-align:center;background:linear-gradient(135deg,rgba(0,240,255,0.08),rgba(168,85,247,0.08));">
              <div style="font-size:28px;font-weight:700;background:linear-gradient(135deg,#00f0ff,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:4px;">
                CodeChronicle
              </div>
              <div style="color:#94a3b8;font-size:13px;letter-spacing:0.05em;">Email Verification</div>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="color:#f1f5f9;font-size:15px;margin:0 0 16px;">Hello${name ? ` ${name}` : ''},</p>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
                Please use the verification code below to confirm your email address. This code expires in <strong style="color:#f1f5f9;">${VERIFICATION_CODE_EXPIRY_MINUTES} minutes</strong>.
              </p>
              <!-- Code Box -->
              <div style="text-align:center;margin:0 0 24px;">
                <div style="display:inline-block;padding:16px 40px;background:rgba(0,240,255,0.06);border:2px solid rgba(0,240,255,0.3);border-radius:12px;letter-spacing:0.35em;font-size:32px;font-weight:700;color:#00f0ff;font-family:'Courier New',monospace;">
                  ${code}
                </div>
              </div>
              <p style="color:#64748b;font-size:12px;line-height:1.5;margin:0;">
                If you did not create an account with CodeChronicle, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid rgba(148,163,184,0.08);text-align:center;">
              <p style="color:#475569;font-size:11px;margin:0;">
                &copy; ${new Date().getFullYear()} CodeChronicle &mdash; AI-Powered Codebase Analysis
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
            to: [{ email, name: name || email }],
            subject: `${code} — Verify your CodeChronicle account`,
            htmlContent,
        }),
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error('Brevo API error:', response.status, errBody);
        throw new Error(`Email delivery failed (${response.status})`);
    }

    return true;
}

// ─── Lambda Handlers ─────────────────────────────────────────────

/**
 * POST /auth/register
 * Creates a new user, hashes the password, sends a verification code via Brevo.
 */
module.exports.register = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { email, password, name } = body;

        // Validate inputs
        if (!email || !password) {
            return respond(400, { error: 'Email and password are required.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        if (!isValidEmail(sanitizedEmail)) {
            return respond(400, { error: 'Invalid email format.' });
        }

        const pwdCheck = validatePassword(password);
        if (!pwdCheck.valid) {
            return respond(400, { error: pwdCheck.message });
        }

        if (name && (typeof name !== 'string' || name.length > 100)) {
            return respond(400, { error: 'Name must be a string under 100 characters.' });
        }

        // Check if user already exists
        const existing = await docClient.send(
            new GetCommand({ TableName: USERS_TABLE, Key: { email: sanitizedEmail } })
        );

        if (existing.Item) {
            // If user exists but is not verified, allow re-registration
            if (!existing.Item.emailVerified) {
                // Update with new password and resend code
                const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
                const code = generateVerificationCode();
                const codeExpiry = Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000;

                await docClient.send(
                    new UpdateCommand({
                        TableName: USERS_TABLE,
                        Key: { email: sanitizedEmail },
                        UpdateExpression:
                            'SET #pwd = :pwd, #name = :name, verificationCode = :code, codeExpiry = :exp, updatedAt = :now',
                        ExpressionAttributeNames: { '#pwd': 'password', '#name': 'name' },
                        ExpressionAttributeValues: {
                            ':pwd': hashedPassword,
                            ':name': (name || '').trim() || null,
                            ':code': code,
                            ':exp': codeExpiry,
                            ':now': new Date().toISOString(),
                        },
                    })
                );

                await sendVerificationEmail(sanitizedEmail, code, name);

                return respond(200, {
                    message: 'Verification code resent. Please check your email.',
                    emailSent: true,
                });
            }

            return respond(409, { error: 'An account with this email already exists.' });
        }

        // Hash password + generate verification code
        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        const code = generateVerificationCode();
        const codeExpiry = Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000;

        // Store user
        await docClient.send(
            new PutCommand({
                TableName: USERS_TABLE,
                Item: {
                    email: sanitizedEmail,
                    password: hashedPassword,
                    name: (name || '').trim() || null,
                    emailVerified: false,
                    verificationCode: code,
                    codeExpiry,
                    loginAttempts: 0,
                    lockoutUntil: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        );

        // Send verification email
        await sendVerificationEmail(sanitizedEmail, code, name);

        return respond(201, {
            message: 'Account created. Please verify your email.',
            emailSent: true,
        });
    } catch (err) {
        console.error('Register error:', err);
        return respond(500, { error: 'Internal server error. Please try again.' });
    }
};

/**
 * POST /auth/verify-email
 * Verifies the 6-digit code and activates the account.
 */
module.exports.verifyEmail = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { email, code } = body;

        if (!email || !code) {
            return respond(400, { error: 'Email and verification code are required.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        const result = await docClient.send(
            new GetCommand({ TableName: USERS_TABLE, Key: { email: sanitizedEmail } })
        );

        if (!result.Item) {
            return respond(404, { error: 'Account not found.' });
        }

        const user = result.Item;

        if (user.emailVerified) {
            return respond(200, { message: 'Email already verified.', alreadyVerified: true });
        }

        // Check code expiry
        if (Date.now() > user.codeExpiry) {
            return respond(410, { error: 'Verification code has expired. Please register again.' });
        }

        // Validate code (timing-safe comparison)
        const codeStr = code.toString().trim();
        if (codeStr.length !== 6 || !timingSafeEqual(codeStr, user.verificationCode)) {
            return respond(401, { error: 'Invalid verification code.' });
        }

        // Mark email as verified and clear the code
        await docClient.send(
            new UpdateCommand({
                TableName: USERS_TABLE,
                Key: { email: sanitizedEmail },
                UpdateExpression:
                    'SET emailVerified = :v, verificationCode = :null, codeExpiry = :zero, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':v': true,
                    ':null': null,
                    ':zero': 0,
                    ':now': new Date().toISOString(),
                },
            })
        );

        // Issue JWT
        const token = signToken({ email: sanitizedEmail, name: user.name || null });

        return respond(200, {
            message: 'Email verified successfully.',
            token,
            user: { email: sanitizedEmail, name: user.name || null },
        });
    } catch (err) {
        console.error('Verify email error:', err);
        return respond(500, { error: 'Internal server error. Please try again.' });
    }
};

/**
 * POST /auth/login
 * Authenticates a verified user and returns a JWT.
 */
module.exports.login = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { email, password } = body;

        if (!email || !password) {
            return respond(400, { error: 'Email and password are required.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        const result = await docClient.send(
            new GetCommand({ TableName: USERS_TABLE, Key: { email: sanitizedEmail } })
        );

        // Use a generic message to prevent user enumeration
        if (!result.Item) {
            return respond(401, { error: 'Invalid email or password.' });
        }

        const user = result.Item;

        // Check lockout
        if (user.lockoutUntil && Date.now() < user.lockoutUntil) {
            const remainingMinutes = Math.ceil((user.lockoutUntil - Date.now()) / 60000);
            return respond(429, {
                error: `Account temporarily locked. Try again in ${remainingMinutes} minute(s).`,
                lockedUntil: user.lockoutUntil,
            });
        }

        // Check email verification
        if (!user.emailVerified) {
            return respond(403, {
                error: 'Email not verified. Please check your inbox for the verification code.',
                needsVerification: true,
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            const newAttempts = (user.loginAttempts || 0) + 1;
            const updates = {
                ':a': newAttempts,
                ':now': new Date().toISOString(),
            };
            let updateExpr = 'SET loginAttempts = :a, updatedAt = :now';

            // Lock account after MAX_LOGIN_ATTEMPTS
            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                updates[':lock'] = Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000;
                updateExpr += ', lockoutUntil = :lock';
            }

            await docClient.send(
                new UpdateCommand({
                    TableName: USERS_TABLE,
                    Key: { email: sanitizedEmail },
                    UpdateExpression: updateExpr,
                    ExpressionAttributeValues: updates,
                })
            );

            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                return respond(429, {
                    error: `Too many failed attempts. Account locked for ${LOCKOUT_DURATION_MINUTES} minutes.`,
                });
            }

            return respond(401, { error: 'Invalid email or password.' });
        }

        // Successful login — reset attempts
        await docClient.send(
            new UpdateCommand({
                TableName: USERS_TABLE,
                Key: { email: sanitizedEmail },
                UpdateExpression: 'SET loginAttempts = :zero, lockoutUntil = :zero, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':zero': 0,
                    ':now': new Date().toISOString(),
                },
            })
        );

        const token = signToken({ email: sanitizedEmail, name: user.name || null });

        return respond(200, {
            message: 'Login successful.',
            token,
            user: { email: sanitizedEmail, name: user.name || null },
        });
    } catch (err) {
        console.error('Login error:', err);
        return respond(500, { error: 'Internal server error. Please try again.' });
    }
};

/**
 * POST /auth/resend-code
 * Resends a new verification code to an unverified account.
 */
module.exports.resendCode = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { email } = body;

        if (!email) {
            return respond(400, { error: 'Email is required.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        const result = await docClient.send(
            new GetCommand({ TableName: USERS_TABLE, Key: { email: sanitizedEmail } })
        );

        // Don't reveal whether the account exists
        if (!result.Item || result.Item.emailVerified) {
            return respond(200, { message: 'If the account exists, a new code has been sent.' });
        }

        const user = result.Item;
        const code = generateVerificationCode();
        const codeExpiry = Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000;

        await docClient.send(
            new UpdateCommand({
                TableName: USERS_TABLE,
                Key: { email: sanitizedEmail },
                UpdateExpression: 'SET verificationCode = :code, codeExpiry = :exp, updatedAt = :now',
                ExpressionAttributeValues: {
                    ':code': code,
                    ':exp': codeExpiry,
                    ':now': new Date().toISOString(),
                },
            })
        );

        await sendVerificationEmail(sanitizedEmail, code, user.name);

        return respond(200, { message: 'If the account exists, a new code has been sent.' });
    } catch (err) {
        console.error('Resend code error:', err);
        return respond(500, { error: 'Internal server error. Please try again.' });
    }
};

/**
 * POST /auth/verify-token
 * Validates a JWT and returns the user profile.
 */
module.exports.verifyTokenHandler = async (event) => {
    try {
        const body = JSON.parse(event.body || '{}');
        const { token } = body;

        if (!token) {
            return respond(400, { error: 'Token is required.' });
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return respond(401, { error: 'Invalid or expired token.' });
        }

        // Verify user still exists and is active
        const result = await docClient.send(
            new GetCommand({ TableName: USERS_TABLE, Key: { email: decoded.email } })
        );

        if (!result.Item || !result.Item.emailVerified) {
            return respond(401, { error: 'Account no longer valid.' });
        }

        return respond(200, {
            valid: true,
            user: { email: decoded.email, name: result.Item.name || null },
        });
    } catch (err) {
        console.error('Verify token error:', err);
        return respond(500, { error: 'Internal server error. Please try again.' });
    }
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Timing-safe string comparison to prevent timing attacks on verification codes.
 */
function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    return crypto.timingSafeEqual(bufA, bufB);
}
