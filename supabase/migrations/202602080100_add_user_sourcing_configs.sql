-- ==========================================================
-- Migration: user_sourcing_configs 테이블 생성
-- 수집 속도/딜레이/수량 등 사용자별 수집 설정 저장
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.user_sourcing_configs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    page_delay_ms INT DEFAULT 300,
    crawl_delay_ms INT DEFAULT 500,
    bulk_max_target INT DEFAULT 3000,
    page_size INT DEFAULT 50,
    auto_convert BOOLEAN DEFAULT true,
    default_margin_rate DECIMAL(5,2) DEFAULT 30.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- RLS
ALTER TABLE public.user_sourcing_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sourcing configs" ON public.user_sourcing_configs;
CREATE POLICY "Users manage own sourcing configs" ON public.user_sourcing_configs
    FOR ALL USING (auth.uid() = user_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_user_sourcing_configs_updated_at ON public.user_sourcing_configs;
CREATE TRIGGER trg_user_sourcing_configs_updated_at
    BEFORE UPDATE ON public.user_sourcing_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
