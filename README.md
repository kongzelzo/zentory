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
  "planCode": "PRO",
  "billingCycle": "monthly",
  "provider": "manual"
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
  "amount": 590,
  "currency": "THB",
  "provider": "bank-transfer",
  "providerPaymentId": "txn_123"
}
```

## MVP Boundaries

v1 supports one active branch per business while keeping the `Branch` model ready for expansion. FIFO, lots, expiry, offline mode, direct payment-gateway SDK integration, marketplace sync, and advanced barcode printing are intentionally out of scope.
