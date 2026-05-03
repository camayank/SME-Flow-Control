# ParchiFlow — Universal SME Ledger Intelligence OS

## Overview

Full-stack mobile-first web app for Indian SMEs. Provides manual parchi entry, party ledger, Excel/CSV/bank statement import, reconciliation engine, payment matching, WhatsApp click-to-chat reminders, collection CRM, Tally/BUSY/Marg mock connectors, and dashboard.

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
- `GET/POST/PUT /api/business` — CRUD business profile

### Parties
- `GET/POST /api/parties` — list/create parties
- `GET/PUT/DELETE /api/parties/:id` — get/update/delete party
- `GET /api/parties/:id/ledger` — party ledger + summary

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
- `GET /api/dashboard` — full dashboard data
- `GET /api/reports/receivables` — receivables report
- `GET /api/reports/payables` — payables report
- `GET /api/reports/aging` — aging breakdown
- `GET /api/reports/collections` — collections (30d)
- `GET /api/reports/follow-ups` — follow-up report
- `GET /api/reports/reconciliation` — recon report
- `GET /api/reports/source-sync` — data source sync report
- `GET /api/reports/party-statement/:partyId` — party statement

## Frontend Pages

- `/login` — OTP login (mobile + 123456)
- `/onboarding` — business setup (name, type, city, GST, UPI)
- `/` — Dashboard (KPIs, aging chart, top debtors, recent activity)
- `/parchi` — Parchi Entry (text parser + manual form)
- `/parties` — Party list + add party dialog
- `/parties/:id` — Party detail + ledger statement
- `/outstandings` — Outstandings list + aging chart
- `/collections` — Collection CRM + WhatsApp reminder generator
- `/reconciliation` — Reconciliation queue with actions
- `/import` — CSV import + mock connector sync
- `/reports` — Reports (aging, receivables, collections)

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

## Key Commands

```bash
pnpm --filter @workspace/db run push          # Push schema to DB
pnpm --filter @workspace/api-server run build # Build API server
pnpm run typecheck                             # Full type check
```

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — JWT signing secret
- `PORT` — server port (injected by Replit per artifact)
