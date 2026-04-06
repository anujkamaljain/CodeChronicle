# CodeChronicle Pricing, Credits, and Margin Plan

**Version:** 1.0  
**Date:** 2026-04-06  
**Owner:** CodeChronicle

---

## 1) Executive Summary

This document defines a production-ready monetization approach for CodeChronicle with:

- Credit-based usage billing
- Razorpay payment integration
- Cost-safe pricing for current AI model usage
- Margin expectations and risk controls
- Operational guardrails for scale

**Business constraint locked:** keep the current AI model path (Amazon Nova Premier) and avoid loss scenarios.

---

## 2) Current Tech Stack (from codebase)

### Client
- VS Code extension (`extension/`)
- React-based webview UI
- API client in `extension/src/ai/apiClient.js`

### Backend
- AWS API Gateway (HTTP API)
- AWS Lambda (Node.js 20)
- AWS DynamoDB (on-demand)
- AWS SQS + DLQ (async AI query buffering)
- Serverless Framework (`backend/serverless.yml`)

### AI
- Amazon Bedrock `Converse` API
- Configured model: `us.amazon.nova-premier-v1:0`

### Auth
- JWT-based auth (`/auth/login`, `/auth/verify-token`)
- Email verification during signup flow

### Payment (planned)
- Razorpay

---

## 3) Pricing Inputs (Latest Public References)

> Final billing source of truth is AWS/Razorpay invoices and console metrics. Use these as initial planning assumptions.

- **Amazon Bedrock Pricing:** https://aws.amazon.com/bedrock/pricing/
- **API Gateway Pricing:** https://aws.amazon.com/api-gateway/pricing/
- **Lambda Pricing:** https://aws.amazon.com/lambda/pricing/
- **SQS Pricing:** https://aws.amazon.com/sqs/pricing/
- **DynamoDB On-Demand Pricing:** https://aws.amazon.com/dynamodb/pricing/on-demand/
- **Razorpay Pricing:** https://razorpay.com/pricing

### Assumed price points used for calculations

- **Model (Nova Premier):**
  - Input: `$2.50 / 1M tokens`
  - Output: `$12.50 / 1M tokens`
- **FX rate:** `1 USD = ₹93` (planning assumption)
- **Safety multiplier:** `1.20` (infra + retries + variance buffer)
- **Razorpay effective deduction:** `~2.36%` (2% + GST on fee)
- **API Gateway HTTP API:** `~$1.00 / 1M requests`
- **Lambda requests:** `~$0.20 / 1M requests` (+ compute)
- **SQS standard:** `~$0.40 / 1M requests`
- **DynamoDB on-demand (approx):**
  - Writes: `~$0.625 / 1M`
  - Reads: `~$0.125 / 1M`

---

## 4) Credit Consumption Logic (Authoritative)

### Variables

- `Tin` = input tokens used
- `Tout` = output tokens used
- `Cin` = input token price per 1M (USD) = `2.50`
- `Cout` = output token price per 1M (USD) = `12.50`
- `FX` = INR/USD = `93`
- `M` = safety multiplier = `1.20`
- `P` = price per credit in INR (recommended: `₹1`)
- `RZ` = Razorpay net factor = `0.9764`

### Cost per request (INR)

`CostINR = ((Tin/1,000,000)*Cin + (Tout/1,000,000)*Cout) * FX * M`

### Credits to debit (loss-safe)

`CreditsToDebit = ceil(CostINR / (RZ * P))`

### Simplified formula for `P = ₹1`

`CreditsToDebit = ceil(0.000343*Tin + 0.001715*Tout)`

### Business rules

- Minimum debit: `1 credit`
- Debit based on **actual usage** (or estimated + reconciliation)
- If wallet balance insufficient: reject with payment/credits required
- Never bypass debit in sync fallback path

---

## 5) Scenario-Based Credit Consumption (Premier Only)

### Token scenarios

| Scenario | Tin | Tout | Estimated Cost (INR) | Credits Debited (`₹1/credit`) |
|---|---:|---:|---:|---:|
| Light | 3,000 | 500 | ~₹1.53 | 2 |
| Base | 10,000 | 800 | ~₹3.91 | 5 |
| Heavy | 30,000 | 1,200 | ~₹10.04 | 13 |
| Very Heavy | 80,000 | 2,000 | ~₹30.13 | 31 |

---

## 6) Recommended Pricing Plans (Launch)

> With Premier-only strategy, keep credit bonuses minimal to protect margin.

| Plan | Price | Credits | Bonus % |
|---|---:|---:|---:|
| Trial (one-time) | ₹0 | 25 | n/a |
| Starter | ₹19 | 99 | 0% |
| Growth | ₹49 | 305 | ~2% |
| Pro | ₹99 | 1,050 | ~5% |

### Why trial is small

Premier is expensive. Large free credits can create immediate loss and abuse risk.

### First-Time Purchase Bonus (recommended)

Give a one-time first recharge bonus to improve conversion without large margin damage.

#### Offer design

- Applicable only on the **first successful paid transaction** per verified account
- Bonus is credited immediately after payment verification
- Bonus credits do not expire (aligned with current product messaging)
- Bonus is non-refundable and non-transferable

#### Suggested first-purchase bonus slab

| First Purchase Plan | Base Credits | First-Time Bonus | Total Credits |
|---|---:|---:|---:|
| Starter (₹19) | 99 | +20 | 119 |
| Growth (₹49) | 305 | +45 | 350 |
| Pro (₹99) | 1,050 | +120 | 1,170 |

#### Abuse-prevention rules

1. Bonus only once per user (`hasFirstPurchaseBonusClaimed=true`)
2. Require verified email before bonus eligibility
3. Store idempotency key against `razorpayPaymentId` to prevent duplicate grants
4. Block repeated claims by account/device/IP risk checks

#### Margin impact note

This bonus range is intentionally conservative so overall unit economics remain positive for Premier-only mode.

---

## 7) Expected Margins (Premier, `₹1/credit`)

### Net revenue per credit after Razorpay

`NetPerCredit = ₹1 * 0.9764 = ₹0.9764`

### Query-level margin estimates

| Scenario | Credits Charged | Net Revenue | Est. Cost | Profit | Margin (on net) |
|---|---:|---:|---:|---:|---:|
| Light (3k/500) | 2 | ₹1.95 | ₹1.53 | ₹0.42 | ~21.7% |
| Base (10k/800) | 5 | ₹4.88 | ₹3.91 | ₹0.97 | ~19.9% |
| Heavy (30k/1200) | 13 | ₹12.69 | ₹10.04 | ₹2.65 | ~20.9% |
| Very Heavy (80k/2000) | 31 | ₹30.27 | ₹30.13 | ₹0.14 | ~0.5% |

### Interpretation

- Typical usage: around `~20%` margin
- Extreme long prompts/outputs: near break-even
- Keep output caps and guardrails strict for healthy blended margin

---

## 8) Expected Cost and Margin by Plan (if all credits consumed)

> Profitability depends on usage mix; below uses representative scenarios.

### Plan: Starter (`₹19`, 99 credits)

- Net revenue after Razorpay: `₹18.55`
- If consumed at base profile (approx 5 credits/query): ~19 queries
- Expected blended margin target: negative (adoption pricing)

### Plan: Growth (`₹49`, 305 credits)

- Net revenue: `₹47.84`
- Base profile: ~61 queries
- Expected blended margin target: negative (adoption pricing)

### Plan: Pro (`₹99`, 1,050 credits)

- Net revenue: `₹96.66`
- Base profile: ~210 queries
- Expected blended margin target: negative (adoption pricing)

> If users consistently push very-heavy prompts, margins fall sharply. Enforce hard token limits.

---

## 9) Guardrails Already in Backend

Current safeguards implemented:

- SQS queue buffering + DLQ for async AI query
- Queue backlog cap
- Daily per-owner quota (`AI_QUERY_DAILY_LIMIT`)
- Prompt/file/result/output caps
- Worker concurrency bound
- Async kill switch (`AI_ASYNC_ENABLED`)

---

## 10) Must-Have Additions Before Public Launch

1. Wallet + ledger tables
2. Atomic debit transaction before model invocation
3. Razorpay order creation endpoint
4. Razorpay webhook signature verification
5. Credit grant idempotency key (to avoid double-crediting)
6. Chargeback/refund credit reversal logic
7. Admin dashboard for:
   - credits sold
   - credits consumed
   - per-user usage
   - gross margin trend

---

## 11) Suggested Data Model (Minimal)

### `Wallets` table
- `userId` (PK)
- `balanceCredits`
- `updatedAt`

### `CreditLedger` table
- `entryId` (PK)
- `userId`
- `type` (`debit`, `credit`, `refund`, `reversal`)
- `credits`
- `source` (`ai_query`, `razorpay_order`, etc.)
- `sourceId` (idempotency key)
- `metadata` (token usage, request id)
- `createdAt`

### `Payments` table
- `paymentId` (PK)
- `userId`
- `razorpayOrderId`
- `razorpayPaymentId`
- `status`
- `amountINR`
- `creditsGranted`
- `createdAt`

---

## 12) Razorpay Flow (Recommended)

1. Client requests pack purchase
2. Backend creates Razorpay order
3. Client completes checkout
4. Razorpay webhook hits backend
5. Backend verifies signature
6. Backend checks idempotency (`sourceId`)
7. Backend credits wallet + writes ledger entry
8. Backend acknowledges success

---

## 12.1) Coupon Credits Flow

1. Admin creates a coupon code with fixed credits and claim limit.
2. User redeems coupon from billing dashboard.
3. Backend atomically:
   - credits wallet balance
   - writes `coupon_redeem` ledger entry
   - increments coupon claim count
4. Duplicate claim by the same account for the same code is blocked.
5. Redeemed credits become part of normal wallet balance and are consumed through standard AI usage debit flow.

---

## 13) Monitoring and Budget Controls

### CloudWatch alarms
- API 5xx rate
- Lambda errors and throttles
- SQS queue depth and age of oldest message
- DLQ message count

### Budget alarms
- Daily and monthly Bedrock spend
- Daily and monthly total AWS spend

### Operational thresholds
- If queue depth above threshold -> disable async (`AI_ASYNC_ENABLED=false`) or raise wait/backpressure
- If margin drops below floor -> auto-increase credit debit multiplier

---

## 14) Final Lock Recommendations

For current model strategy:

1. Keep `Nova Premier`
2. Set `1 credit = ₹1`
3. Use dynamic debit formula in Section 4
4. Keep trial very small (`~25 credits`)
5. Keep pack bonus low (`0–5%`)
6. Enforce hard prompt/output limits

This combination is the safest way to avoid losses while maintaining predictable pricing.

---

## 15) Change Log

- `v1.0` initial comprehensive pricing and credit plan for Premier-only monetization.

