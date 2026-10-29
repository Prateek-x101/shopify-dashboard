# Orders Dashboard

Multi-store operations dashboard: Shopify orders + Shiprocket shipping + WhatsApp (Web QR or Meta Cloud API) + email in one place, with abandoned-cart (Shopify + Fastrr) recovery and automations.

## Run & Operate

- Everything on one port (5173): double-click `start-dashboard.bat` (`start-dashboard.bat build` after UI changes). The API serves the built dashboard.
- API server alone: `cd artifacts/api-server && node ./build.mjs && node ./dist/index.mjs` (env `PORT`, optional `DATABASE_URL`, `DATA_DIR`)
- Dashboard dev server with hot reload (port 5180): `cd artifacts/shopify-dashboard && PORT=5180 BASE_PATH=/ node node_modules/vite/bin/vite.js` (proxies `/api` to `API_PORT`, default 5000)
- Production: build the dashboard (`vite build`); the API server serves `artifacts/shopify-dashboard/dist/public` itself.
- `pnpm run typecheck`: full typecheck. pnpm is not installed globally on the dev PC: use `npx -y pnpm@11.22.0 …`.
- DB schema change: edit `lib/db/src/schema/*`, then `pnpm --filter @workspace/db run generate` (writes `lib/db/drizzle/*.sql`). Migrations apply automatically when the API starts.

## Stack

- pnpm workspaces, Node 24, TypeScript 5.9, Express 5, React 19 + Vite + Tailwind + shadcn/ui, TanStack Query, wouter
- DB: Drizzle ORM on PostgreSQL. Without `DATABASE_URL` it uses embedded PGlite in `data/pglite` (real Postgres, no install)
- WhatsApp Web: Baileys (multi-device websocket, no browser). Meta: Graph API v21 directly
- Email: nodemailer (SMTP) + imapflow/mailparser (IMAP replies)

## Where things live

- `lib/db/src/schema/`: accounts (stores, shiprocket/whatsapp/email accounts, app_settings), commerce (orders, checkouts, messages), automation (rules + dedupe log)
- `artifacts/api-server/src/integrations/`: one file per provider (shopify, shiprocket, whatsapp-meta, whatsapp-web, email)
- `artifacts/api-server/src/services/`: messaging (send + inbound linking), automation, scheduler (sync loops), fastrr (cart webhook parser), sheets (Google Sheet copy)
- `artifacts/api-server/src/routes/`: REST API; `webhooks.ts` is the only public (no login) router
- `artifacts/shopify-dashboard/src/pages/`: orders, checkouts (abandoned), inbox, automations, settings

## Architecture decisions

- Data is synced into our DB (Shopify every 3m by `updated_at`, Shiprocket statuses every 5m, IMAP every 2m); the UI never calls providers directly, so lists, search and filters are instant and multi-store.
- Conversations are keyed by contact (phone digits with country code, or lower-case email). Inbound replies are linked to the customer's latest order/cart.
- Automations claim `(rule, entity)` in `automation_log` before sending, so nothing is sent twice. Rules are skipped while no account on their channel is connected.
- Dashboard login (single password, scrypt + HMAC cookie) because webhooks need the server exposed through a tunnel.
- Google Sheet is a one-way reporting copy (service account), not storage.

## Gotchas

- Shiprocket needs an API user (Settings → API), not the panel login. Orders match by order name without `#`.
- Meta numbers can only send free text within 24h of the customer's last message; otherwise use approved templates.
- Fastrr webhook URLs and Shiprocket webhook URLs carry a `?key=`; Shopify/Meta webhooks are verified with their app secrets when configured.
- `data/` holds the local DB and WhatsApp sessions: back it up, never commit it.
