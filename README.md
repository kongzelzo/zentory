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

## MVP Boundaries

v1 supports one active branch per business while keeping the `Branch` model ready for expansion. FIFO, lots, expiry, offline mode, payment gateway, marketplace sync, and advanced barcode printing are intentionally out of scope.
