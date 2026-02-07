# VibeCoding ERP

Initial scaffold for the Web Dashboard (Next.js 14 App Router).

## Run

```bash
npm install
npm run dev
```

## Required env

Copy `.env.example` to `.env.local` and set Supabase values.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (for cron/order sync)
- `ENCRYPTION_KEY` (64-char hex)
- `CRON_SECRET` (for `/api/cron/orders`, `/api/cron/cs` authorization)
- `ORDER_SYNC_MOCK_ENABLED` (`true` to generate mock orders in cron)
- `ORDER_SYNC_LOOKBACK_MINUTES` (market order lookback window, max 1440)
- `CS_SYNC_MOCK_ENABLED` (`true` to generate mock inquiries in cron)
- `CS_SYNC_LOOKBACK_DAYS` (market inquiry lookback window, max 90)
- `MARKET_TRACKING_PUSH_ENABLED` (`false` to disable tracking push to marketplaces)
- `MARKET_TRACKING_MOCK_ENABLED` (`true` to mock tracking push success)
- `MARKET_TRACKING_MAX_RETRIES` (retry count on temporary failures like `429/5xx`)
- `MARKET_TRACKING_RETRY_BASE_MS` (exponential backoff base milliseconds)
- `MARKET_CS_REPLY_ENABLED` (`false` to disable CS reply push to marketplaces)
- `MARKET_CS_REPLY_MOCK_ENABLED` (`true` to mock CS reply push success)
- `MARKET_CS_REPLY_MAX_RETRIES` (retry count on temporary failures like `429/5xx`)
- `MARKET_CS_REPLY_RETRY_BASE_MS` (exponential backoff base milliseconds)
- `OPS_SECRET` (optional auth secret for `/api/ops/tracking-push-smoke`, fallback: `CRON_SECRET`)
- `COUPANG_TRACKING_API_URL_TEMPLATE` (optional)
- `SMARTSTORE_TRACKING_API_URL_TEMPLATE` (optional)
- `COUPANG_CS_INQUIRIES_API_URL_TEMPLATE` (optional)
- `SMARTSTORE_CS_INQUIRIES_API_URL_TEMPLATE` (optional)
- `COUPANG_CS_REPLY_API_URL_TEMPLATE` (optional)
- `SMARTSTORE_CS_REPLY_API_URL_TEMPLATE` (optional)
