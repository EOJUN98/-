-- Audit log tables for order sync and tracking push

CREATE TABLE IF NOT EXISTS public.order_sync_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE SET NULL,
    market_code VARCHAR(20) NOT NULL,
    fetched_count INT DEFAULT 0,
    upserted_count INT DEFAULT 0,
    upserted_item_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    warning_messages JSONB DEFAULT '[]'::jsonb,
    triggered_by VARCHAR(20) DEFAULT 'cron',
    run_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.tracking_push_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    market_code VARCHAR(20),
    status VARCHAR(20) NOT NULL,
    failure_category VARCHAR(20),
    status_code INT,
    attempts INT,
    message TEXT,
    source VARCHAR(20) DEFAULT 'upload',
    batch_id UUID,
    file_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_order_sync_logs_user_created
    ON public.order_sync_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_push_logs_user_created
    ON public.tracking_push_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tracking_push_logs_order_number
    ON public.tracking_push_logs(order_number);

ALTER TABLE public.order_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_push_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own order sync logs" ON public.order_sync_logs;
CREATE POLICY "Users manage own order sync logs" ON public.order_sync_logs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own tracking push logs" ON public.tracking_push_logs;
CREATE POLICY "Users manage own tracking push logs" ON public.tracking_push_logs
    FOR ALL USING (auth.uid() = user_id);
