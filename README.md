# InvoStock

A billing and inventory management system for small and mid-size retail or wholesale businesses. Built with a real invoice lifecycle in mind: stock is decremented atomically when an invoice is created, restored automatically if the invoice is voided, and every stock change is logged for auditing.

## Features

- **Invoicing** -- create multi-item invoices with discount/tax, partial payments, auto-generated invoice numbers (`INV-<year>-<sequence>`), and status tracking (unpaid / partial / paid / void).
- **Inventory** -- per-product stock levels with reorder thresholds, manual stock adjustments (purchases, corrections, returns), and a full movement log.
- **Customers** -- simple customer directory with per-customer invoice history.
- **Reports** -- daily dashboard (today's sales, outstanding balance, low-stock alerts), profit & loss by date range, top-selling products.
- **Role-based access** -- admin (full access, including voiding invoices) and staff (day-to-day billing) roles.

## Tech stack

Node.js + Express, PostgreSQL (tested against both plain Postgres and Supabase), vanilla JS/CSS frontend (no framework, no build step).

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL -- a Supabase connection string works as-is
npm run db:seed         # demo data: 2 users, 4 categories, 8 products
npm start
```

Visit `http://localhost:4100`. Demo logins: `admin` / `admin123` (full access) and `staff` / `staff123` (billing only).

## Using Supabase as the database

1. Create a Supabase project.
2. Grab the connection string from **Project Settings -> Database -> Connection string** (the "Transaction" pooler string is recommended for serverless hosting).
3. Set `DATABASE_URL` to that string in `.env`.
4. Run `npm run db:seed` once to create the demo users and products.

## Deploying

The app is a standard Express server (`server.js`, `app.listen`), so it deploys cleanly to any Node host (Render, Railway, Fly.io, a VPS). It also runs on Vercel's serverless functions, though a long-running host is a better architectural fit given the server-side session store.

## Project structure

```
database/   schema.sql, connection pool, seed script
routes/     auth, products, customers, invoices, reports, settings
public/     static frontend (single-page dashboard, vanilla JS)
server.js   Express app entry point
```
