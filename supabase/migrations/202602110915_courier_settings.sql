-- ==========================================================
-- Migration: 배송사 설정 (Phase 6-8)
-- - courier_companies: 내부 택배사 코드 + 마켓별 코드 매핑
-- - user_courier_settings: 사용자 기본 택배사(및 향후 마켓별 override) 저장
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.courier_companies (
  id SERIAL PRIMARY KEY,
  code VARCHAR(20) NOT NULL UNIQUE,             -- 'cj', 'lotte', 'hanjin', 'post', ...
  name VARCHAR(50) NOT NULL,                    -- 'CJ대한통운', '롯데택배', ...
  -- 마켓별 코드 매핑
  coupang_code VARCHAR(50),
  smartstore_code VARCHAR(50),
  eleventh_code VARCHAR(50),
  gmarket_code VARCHAR(50),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_courier_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_courier_code VARCHAR(20) REFERENCES public.courier_companies(code),
  market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE CASCADE,
  courier_code VARCHAR(20) REFERENCES public.courier_companies(code),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ucs_user ON public.user_courier_settings(user_id);

ALTER TABLE public.user_courier_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own courier settings" ON public.user_courier_settings;
CREATE POLICY "Users manage own courier settings" ON public.user_courier_settings
  FOR ALL USING (auth.uid() = user_id);

-- 초기 데이터 (주요 택배사)
INSERT INTO public.courier_companies (code, name, coupang_code, smartstore_code, eleventh_code, gmarket_code, is_active)
VALUES
  ('cj', 'CJ대한통운', 'CJGLS', 'CJGLS', NULL, NULL, true),
  ('lotte', '롯데택배', 'LOTTE', 'LOTTE', NULL, NULL, true),
  ('hanjin', '한진택배', 'HANJIN', 'HANJIN', NULL, NULL, true),
  ('post', '우체국택배', 'EPOST', 'EPOST', NULL, NULL, true),
  ('logen', '로젠택배', 'LOGEN', 'LOGEN', NULL, NULL, true),
  ('cu', 'CU편의점택배', 'CUPOST', 'CUPOST', NULL, NULL, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  coupang_code = EXCLUDED.coupang_code,
  smartstore_code = EXCLUDED.smartstore_code,
  eleventh_code = EXCLUDED.eleventh_code,
  gmarket_code = EXCLUDED.gmarket_code,
  is_active = EXCLUDED.is_active;

