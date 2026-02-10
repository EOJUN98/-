-- Phase 7-2: Overseas order/tracking + internal memo fields for orders.
-- Idempotent: safe to re-run.

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS overseas_order_number TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS overseas_tracking_number TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS forwarder_id TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS internal_memo TEXT;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS memo_updated_at TIMESTAMPTZ;

