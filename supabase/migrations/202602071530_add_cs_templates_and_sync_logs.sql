-- ==========================================================
-- CS Templates + CS Sync Logs + cs_inquiries upsert index
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.cs_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    shortcut_key VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.cs_sync_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE SET NULL,
    market_code VARCHAR(20) NOT NULL,
    fetched_count INT DEFAULT 0,
    upserted_count INT DEFAULT 0,
    warning_count INT DEFAULT 0,
    warning_messages JSONB DEFAULT '[]'::jsonb,
    triggered_by VARCHAR(20) DEFAULT 'cron',
    run_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_inquiries_unique_market_inquiry
    ON public.cs_inquiries(user_id, market_config_id, inquiry_id);
CREATE INDEX IF NOT EXISTS idx_cs_templates_user_created ON public.cs_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_sync_logs_user_created ON public.cs_sync_logs(user_id, created_at DESC);

ALTER TABLE public.cs_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own cs templates" ON public.cs_templates;
CREATE POLICY "Users manage own cs templates" ON public.cs_templates
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cs sync logs" ON public.cs_sync_logs;
CREATE POLICY "Users manage own cs sync logs" ON public.cs_sync_logs
    FOR ALL USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cs_templates_updated_at ON public.cs_templates;
CREATE TRIGGER trg_cs_templates_updated_at
    BEFORE UPDATE ON public.cs_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
