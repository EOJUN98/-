-- ==========================================================
-- Migration: 배송대행지(포워더) 마스터 + 사용자 기본 설정 (Phase 7-3)
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.forwarder_companies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  homepage_url TEXT,
  api_type VARCHAR(30),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_forwarder_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_forwarder_code VARCHAR(30) REFERENCES public.forwarder_companies(code),
  market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE CASCADE,
  forwarder_code VARCHAR(30) REFERENCES public.forwarder_companies(code),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ufs_user ON public.user_forwarder_settings(user_id);

ALTER TABLE public.user_forwarder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own forwarder settings" ON public.user_forwarder_settings;
CREATE POLICY "Users manage own forwarder settings" ON public.user_forwarder_settings
  FOR ALL USING (auth.uid() = user_id);

-- 초기 포워더 데이터 (운영에서 자주 쓰는 기본 항목)
INSERT INTO public.forwarder_companies (code, name, homepage_url, api_type, is_active)
VALUES
  ('basic', '기본배송대행지', NULL, NULL, true),
  ('buysell', '바이셀스탠다드', 'https://www.buysellstandards.com', NULL, true),
  ('foryou', '포유', NULL, NULL, true),
  ('pandalogis', '판다로지스', NULL, NULL, true),
  ('shipgo', '쉽고', NULL, NULL, true),
  ('malltail', '몰테일', 'https://post.malltail.com', NULL, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  homepage_url = EXCLUDED.homepage_url,
  api_type = EXCLUDED.api_type,
  is_active = EXCLUDED.is_active;

