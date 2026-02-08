-- ==========================================================
-- Migration: 정책 관리 테이블 생성
-- product_policies, policy_margin_tiers, detail_templates
-- ==========================================================

-- 정책 마스터
CREATE TABLE IF NOT EXISTS public.product_policies (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT false,
    base_margin_rate DECIMAL(5,2) DEFAULT 30.0,
    base_margin_amount INT DEFAULT 0,
    use_tiered_margin BOOLEAN DEFAULT false,
    international_shipping_fee INT DEFAULT 2500,
    shipping_weight_unit VARCHAR(5) DEFAULT 'KG',
    shipping_weight DECIMAL(10,2),
    domestic_shipping_fee INT DEFAULT 0,
    free_shipping_threshold INT DEFAULT 0,
    free_shipping_amount INT DEFAULT 0,
    base_currency VARCHAR(10) DEFAULT 'KRW',
    exchange_rate DECIMAL(10,2) DEFAULT 1,
    target_markets JSONB DEFAULT '[]'::jsonb,
    detail_template_id UUID,
    translation_enabled BOOLEAN DEFAULT false,
    translation_source_lang VARCHAR(10) DEFAULT 'ko',
    translation_target_lang VARCHAR(10) DEFAULT 'ko',
    watermark_enabled BOOLEAN DEFAULT false,
    watermark_image_url TEXT,
    watermark_position VARCHAR(20) DEFAULT 'bottom-right',
    watermark_opacity DECIMAL(3,2) DEFAULT 0.5,
    platform_fee_rate DECIMAL(5,2) DEFAULT 0,
    product_name_prefix TEXT DEFAULT '',
    product_name_suffix TEXT DEFAULT '',
    option_name_prefix TEXT DEFAULT '',
    option_name_suffix TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 가격범위별 차등 마진
CREATE TABLE IF NOT EXISTS public.policy_margin_tiers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    policy_id UUID REFERENCES public.product_policies(id) ON DELETE CASCADE NOT NULL,
    min_price INT NOT NULL,
    max_price INT NOT NULL,
    margin_rate DECIMAL(5,2) NOT NULL,
    margin_amount INT DEFAULT 0,
    sort_order INT DEFAULT 0
);

-- 상세페이지 템플릿
CREATE TABLE IF NOT EXISTS public.detail_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    header_html TEXT DEFAULT '',
    footer_html TEXT DEFAULT '',
    css_style TEXT DEFAULT '',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_policies_user ON public.product_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_margin_tiers_policy ON public.policy_margin_tiers(policy_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_detail_templates_user ON public.detail_templates(user_id);

-- RLS
ALTER TABLE public.product_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_margin_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own policies" ON public.product_policies;
CREATE POLICY "Users manage own policies" ON public.product_policies
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own margin tiers" ON public.policy_margin_tiers;
CREATE POLICY "Users manage own margin tiers" ON public.policy_margin_tiers
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.product_policies p
        WHERE p.id = policy_margin_tiers.policy_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users manage own templates" ON public.detail_templates;
CREATE POLICY "Users manage own templates" ON public.detail_templates
    FOR ALL USING (auth.uid() = user_id);

-- Triggers
DROP TRIGGER IF EXISTS trg_product_policies_updated_at ON public.product_policies;
CREATE TRIGGER trg_product_policies_updated_at
    BEFORE UPDATE ON public.product_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_detail_templates_updated_at ON public.detail_templates;
CREATE TRIGGER trg_detail_templates_updated_at
    BEFORE UPDATE ON public.detail_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
