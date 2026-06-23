# Zentory

React + NestJS + PostgreSQL SaaS MVP for inventory, POS, stock movements, reports, staff roles, subscription limits, and Zentory admin.

## Quick Start

```bash
cp .env.example .env
npm install
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run dev:api
npm run dev:web
```

Web: `http://localhost:5173`  
API: `http://localhost:4000/api/v1`

## Payment Automation API

Create an account-bound payment request from a logged-in account:

```http
POST /api/v1/payments/checkout
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "planCode": "PROFESSIONAL",
  "billingCycle": "monthly",
  "checkoutMode": "subscription",
  "provider": "stripe"
}
```

Payment providers or automation services confirm money-in by calling:

```http
POST /api/v1/payments/webhook
x-zentory-payment-secret: <PAYMENT_WEBHOOK_SECRET>
Content-Type: application/json

{
  "reference": "ZT-...",
  "status": "PAID",
  "amount": 899,
  "currency": "THB",
  "provider": "bank-transfer",
  "providerPaymentId": "txn_123"
}
```

## Production Deploy Notes

Use `npm run db:migrate:deploy` for production/staging migrations. Do not run `prisma migrate dev` against a live database.

Required production env is documented in `.env.production.example`. The API rejects `NODE_ENV=production` boots when required secrets still use placeholder or localhost values.

Health checks can call `GET /api/v1/health`.

## MVP Boundaries

v1 supports paid Starter, Professional, and Multi-Branch accounts with subscription limits. FIFO, lots, expiry, offline mode, marketplace sync, and advanced barcode printing are intentionally out of scope.
