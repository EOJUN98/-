-- Add market_fee_rates JSONB column to user_sourcing_configs
-- Stores per-market fee rates as {"coupang": 10.8, "smartstore": 5.5, ...}

ALTER TABLE public.user_sourcing_configs
  ADD COLUMN IF NOT EXISTS market_fee_rates JSONB DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.user_sourcing_configs.market_fee_rates IS 'Per-market platform fee rates (%) as JSON object';
