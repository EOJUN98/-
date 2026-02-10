-- Expand orders.internal_status to support Phase 7 order flow statuses.
-- NOTE: orders.internal_status is currently a VARCHAR, so this migration adds a CHECK constraint only.
-- It is added as NOT VALID to avoid blocking existing data; validate later when safe.

ALTER TABLE public.orders
  ALTER COLUMN internal_status SET DEFAULT 'collected';

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_internal_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_internal_status_check
  CHECK (
    internal_status IN (
      'collected',
      'ordered',
      'overseas_shipping',
      'domestic_arrived',
      'shipped',
      'delivered',
      'confirmed',
      'cancelled',
      'returned',
      'exchanged'
    )
  )
  NOT VALID;

