# ParchiFlow — Universal SME Ledger Intelligence OS

## Overview

Full-stack mobile-first web app for Indian SMEs. Provides manual parchi entry, party ledger, Excel/CSV/bank statement import, reconciliation engine, payment matching, WhatsApp click-to-chat reminders, collection CRM, Tally/BUSY/Marg mock connectors, GST invoicing, item master with stock tracking, P&L reports, sales/purchase registers, monthly trends, and audit trail.

## Artifacts

- **ParchiFlow** (`artifacts/parchi-flow`) — React + Vite frontend at `/`
- **API Server** (`artifacts/api-server`) — Express.js backend at `/api`
- **Mockup Sandbox** (`artifacts/mockup-sandbox`) — Canvas component previews

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **Frontend**: React 19 + Vite + Wouter (routing) + TanStack Query + shadcn/ui + Recharts
- **Backend**: Express 5 + TypeScript
- **Database**: PostgreSQL + Drizzle ORM (schema in `lib/db/src/schema/`)
- **Auth**: JWT with mock OTP (always 123456)
- **Validation**: Zod v4
- **Theme**: Deep indigo + saffron accent (Indian SME branding)

## Auth Flow

1. `POST /api/auth/send-otp` — sends OTP (always 123456 in demo)
2. `POST /api/auth/verify-otp` — returns JWT token
3. Token stored in localStorage as `parchiflow_token`
4. `GET /api/auth/me` — validates session, returns user object
5. After login: redirect to `/onboarding` if no business, else `/` (dashboard)

## API Routes (all under `/api`)

### Auth
- `POST /api/auth/send-otp` — send OTP
- `POST /api/auth/verify-otp` — verify OTP, returns JWT
- `GET /api/auth/me` — get current user
- `POST /api/auth/logout` — logout

### Business
- `GET /api/business` — returns `{business, businesses[]}` for multi-business
- `POST /api/business` — create or update first business
- `POST /api/business/new` — always create a NEW business entity (multi-business)
- `PUT /api/business` — update specific business by `businessId` in body

### Parties
- `GET/POST /api/parties` — list/create parties
- `GET/PUT/DELETE /api/parties/:id` — get/update/delete party
- `GET /api/parties/:id/ledger` — party ledger + summary

### Items (Item Master)
- `GET /api/items` — list items (with lowStockCount)
- `POST /api/items` — create item (HSN, GST rate, stock, reorder level)
- `PUT /api/items/:id` — update item
- `DELETE /api/items/:id` — delete item
- `POST /api/items/:id/adjust-stock` — adjust stock (+/-)

### Invoices (GST-aware)
- `GET /api/invoices` — list invoices (with filters: type, status, party, search)
- `POST /api/invoices` — create invoice/quotation (auto-numbers INV/PUR/CN/DN/QUO, auto-creates ledger+outstanding, adjusts stock; quotations skip ledger/stock)
- `GET /api/invoices/:id` — invoice detail with line items
- `PUT /api/invoices/:id/mark-paid` — mark invoice as paid
- `DELETE /api/invoices/:id` — cancel invoice
- `POST /api/invoices/:id/convert` — convert quotation → sales invoice (creates ledger, adjusts stock)

### Parchi (Money Events)
- `POST /api/parchi/parse` — parse Hinglish/Hindi/English text
- `POST /api/parchi/save` — save parsed parchi as money event + ledger entry
- `GET /api/parchi/recent` — recent parchi entries

### Ledger
- `GET/POST /api/ledger` — ledger entries
- `GET/POST /api/money-events` — money events (raw transactions)

### Outstandings
- `GET/POST /api/outstandings` — list/create outstandings
- `GET /api/outstandings/aging` — aging analysis
- `PUT /api/outstandings/:id/status` — update status

### Payments
- `GET/POST /api/payments` — payments
- `POST /api/payments/:id/allocate` — allocate payment to outstanding

### Reconciliation
- `GET /api/reconciliation` — pending recon items
- `GET /api/reconciliation/summary` — recon summary
- `POST /api/reconciliation/:id/{confirm,merge,assign-party,mark-dispute,ignore,keep-separate}` — actions

### Follow-ups / Collection CRM
- `GET/POST /api/follow-ups` — follow-ups
- `PUT /api/follow-ups/:id` — update
- `POST /api/follow-ups/generate-reminder` — generate WhatsApp message
- `POST /api/follow-ups/log-reminder` — log reminder sent

### Data Sources / Import
- `GET/POST /api/data-sources` — data sources
- `PUT /api/data-sources/:id` — update
- `POST /api/data-sources/:id/test` — test connection
- `POST /api/data-sources/:id/sync` — sync
- `POST /api/import/upload` — upload CSV/Excel
- `POST /api/import/map` — set column mapping
- `POST /api/import/confirm` — execute import
- `GET /api/import/jobs` — import history
- `POST /api/import/jobs/:id/rollback` — rollback import

### Connectors (Mock)
- `POST /api/connectors/tally/test` + `/sync` — Tally Prime mock
- `POST /api/connectors/busy/test` + `/sync` — BUSY 21 mock
- `POST /api/connectors/marg/test` + `/sync` — Marg ERP mock
- `POST /api/connectors/payment-gateway/webhook` — payment gateway webhook

### Dashboard & Reports
- `GET /api/dashboard` — full dashboard data + insights cards
- `GET /api/reports/receivables` — receivables report
- `GET /api/reports/payables` — payables report
- `GET /api/reports/aging` — aging breakdown
- `GET /api/reports/collections` — collections (30d)
- `GET /api/reports/follow-ups` — follow-up report
- `GET /api/reports/reconciliation` — recon report
- `GET /api/reports/source-sync` — data source sync report
- `GET /api/reports/party-statement/:partyId` — party statement
- `GET /api/reports/pl` — P&L statement (revenue, costs, gross/net profit, margin)
- `GET /api/reports/sales-register` — GST sales register
- `GET /api/reports/purchase-register` — GST purchase register
- `GET /api/reports/monthly-trends` — 6-month inflow/outflow/net trends

### Audit
- `GET /api/audit` — audit trail (filterable by entity_type, limit)

## Frontend Pages

- `/login` — OTP login (mobile + 123456)
- `/onboarding` — business setup (name, type, city, GST, UPI)
- `/` — Dashboard (KPIs, 6-month bar chart, insights cards, low-stock alert, aging chart, top debtors, recent activity)
- `/parchi` — Parchi Entry (text parser + manual form, localStorage draft saving)
- `/parties` — Party list + add party dialog
- `/parties/:id` — Party detail + ledger statement
- `/outstandings` — Outstandings list + aging chart
- `/collections` — Collection CRM + WhatsApp reminder generator
- `/reconciliation` — Reconciliation queue with actions
- `/import` — CSV import + mock connector sync
- `/invoices` — GST Invoice builder (line items, CGST/SGST/IGST, print view, draft saving)
- `/items` — Item Master (HSN, GST rate, stock, reorder level, low-stock alerts, stock adjust)
- `/reports` — Reports (P&L, Trends, Sales Register, Purchase Register, Aging, Receivables, Ops) with CSV export

## Database Schema (in `lib/db/src/schema/`)

- `users` — user accounts (mobile-based)
- `sessions` — JWT sessions
- `businesses` — business profiles
- `parties` — customers/vendors
- `money_events` — raw financial events from all sources
- `ledger_entries` — normalized double-entry ledger
- `outstandings` — receivables/payables with aging
- `payments` — received/made payments
- `reconciliation_queue` — pending reconciliation items
- `follow_ups` + `reminder_logs` — collection CRM
- `data_sources` + `import_jobs` + `sync_logs` — import tracking
- `items` — item master (HSN, GST rate, stock qty, reorder level, unit)
- `invoices` — GST invoices (sale/purchase/credit-note/debit-note, CGST/SGST/IGST, inter-state)
- `invoice_items` — line items per invoice (qty, rate, discount, tax)
- `audit_logs` — audit trail (action, entity, before/after, description)

## Invoice Auto-numbering
- Sales: `INV/YY/0001`, `INV/YY/0002`, ...
- Purchases: `PUR/YY/0001`, ...
- Credit Notes: `CN/YY/0001`, ...
- Debit Notes: `DN/YY/0001`, ...

## Key Commands

```bash
cd lib/db && pnpm run push               # Push schema to DB (run from lib/db dir)
pnpm --filter @workspace/api-server run build  # Build API server
pnpm run typecheck                        # Full type check
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — JWT signing secret
- `PORT` — server port (injected by Replit per artifact)

## Notes

- Invoice draft saving uses localStorage key `parchiflow_invoice_draft`
- Demo credentials: mobile `9876543210`, OTP `123456`
- `auditLogsTable` is defined in `lib/db/src/schema/audit_logs.ts` only (removed duplicate from datasources.ts)
