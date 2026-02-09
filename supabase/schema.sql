-- ==========================================================
-- VibeCoding ERP - Unified Database Schema (Idempotent)
-- Source: REPORT_02 (Canon) + MASTER_SDD + SDD_Phase2 + TEST_PROTOCOL
-- Execute: Supabase SQL Editor → New Query → Paste & Run
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE
-- ==========================================================

-- ==========================================
-- 0. Extensions & Types
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE market_code AS ENUM ('smartstore', 'coupang', '11st', 'esm');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==========================================
-- 1. Tables (DDL)
-- ==========================================

CREATE TABLE IF NOT EXISTS public.user_market_configs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    market_code VARCHAR(20) NOT NULL,
    vendor_id TEXT,
    api_key TEXT,
    secret_key TEXT,
    default_delivery_fee INT DEFAULT 0,
    default_return_fee INT DEFAULT 3000,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.collection_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    site_id VARCHAR(50) NOT NULL,
    search_url TEXT NOT NULL,
    display_name TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    options JSONB DEFAULT '{}'::jsonb,
    total_target INT DEFAULT 0,
    total_collected INT DEFAULT 0,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.raw_products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    job_id UUID REFERENCES public.collection_jobs(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    external_id VARCHAR(255),
    site_id VARCHAR(50) DEFAULT 'aliexpress',
    url TEXT,
    title_origin TEXT,
    price_origin DECIMAL(10, 2),
    currency VARCHAR(10) DEFAULT 'USD',
    images_json JSONB,
    options_json JSONB,
    detail_html TEXT,
    status VARCHAR(50) DEFAULT 'collected',
    raw_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ── Policies (Product management rules) ──
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.policy_margin_tiers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    policy_id UUID REFERENCES public.product_policies(id) ON DELETE CASCADE NOT NULL,
    min_price INT NOT NULL,
    max_price INT NOT NULL,
    margin_rate DECIMAL(5,2) NOT NULL,
    margin_amount INT DEFAULT 0,
    sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.detail_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    header_html TEXT DEFAULT '',
    footer_html TEXT DEFAULT '',
    css_style TEXT DEFAULT '',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    raw_id UUID REFERENCES public.raw_products(id) ON DELETE SET NULL,
    product_code VARCHAR(50),
    name TEXT NOT NULL,
    description_html TEXT,
    cost_price DECIMAL(15, 2),
    exchange_rate DECIMAL(10, 2),
    margin_rate DECIMAL(5, 2) DEFAULT 30.0,
    shipping_fee INT DEFAULT 0,
    sale_price INT,
    stock_quantity INT DEFAULT 999,
    main_image_url TEXT,
    sub_images_url JSONB,
    keywords TEXT[],
    category_id INT,
    is_translated BOOLEAN DEFAULT false,
    is_deleted BOOLEAN DEFAULT false,
    policy_id UUID REFERENCES public.product_policies(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_products_policy ON public.products(policy_id);

CREATE TABLE IF NOT EXISTS public.market_publish_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE CASCADE,
    market_product_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    market_status VARCHAR(50),
    buyer_name TEXT,
    buyer_phone TEXT,
    personal_customs_code TEXT,
    shipping_address TEXT,
    total_price INT,
    order_date TIMESTAMP WITH TIME ZONE,
    tracking_number VARCHAR(100),
    courier_code VARCHAR(50),
    internal_status VARCHAR(50) DEFAULT 'collected',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    UNIQUE(user_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    market_product_name TEXT,
    market_option_name TEXT,
    quantity INT,
    unit_price INT
);

CREATE TABLE IF NOT EXISTS public.cs_inquiries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    market_config_id UUID REFERENCES public.user_market_configs(id) ON DELETE SET NULL,
    inquiry_id VARCHAR(100),
    writer_id VARCHAR(100),
    title TEXT,
    content TEXT,
    reply_content TEXT,
    is_answered BOOLEAN DEFAULT false,
    inquiry_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.cs_templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    shortcut_key VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.user_sourcing_configs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    page_delay_ms INT DEFAULT 300,
    crawl_delay_ms INT DEFAULT 500,
    bulk_max_target INT DEFAULT 3000,
    page_size INT DEFAULT 50,
    auto_convert BOOLEAN DEFAULT true,
    default_margin_rate DECIMAL(5,2) DEFAULT 30.0,
    market_fee_rates JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

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

-- ==========================================
-- 2. Add missing columns (if tables existed before)
-- ==========================================
DO $$ BEGIN
  ALTER TABLE public.collection_jobs ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
  ALTER TABLE public.collection_jobs ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;
  ALTER TABLE public.collection_jobs ADD COLUMN IF NOT EXISTS display_name TEXT;
  ALTER TABLE public.raw_products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
  ALTER TABLE public.raw_products ADD COLUMN IF NOT EXISTS site_id VARCHAR(50) DEFAULT 'aliexpress';
  ALTER TABLE public.raw_products ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'collected';
  ALTER TABLE public.raw_products ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10, 2);
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INT DEFAULT 999;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS keywords TEXT[];
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id INT;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_translated BOOLEAN DEFAULT false;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS shipping_fee INT DEFAULT 0;
  ALTER TABLE public.user_sourcing_configs ADD COLUMN IF NOT EXISTS market_fee_rates JSONB DEFAULT '{}'::jsonb;
END $$;

-- ==========================================
-- 3. Indexes
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_products_user ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_code ON public.products(product_code);
CREATE UNIQUE INDEX IF NOT EXISTS raw_products_user_site_external
    ON public.raw_products(user_id, site_id, external_id);
CREATE INDEX IF NOT EXISTS idx_product_policies_user ON public.product_policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policy_margin_tiers_policy ON public.policy_margin_tiers(policy_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_detail_templates_user ON public.detail_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(internal_status);
CREATE INDEX IF NOT EXISTS idx_collection_jobs_status ON public.collection_jobs(status);
CREATE INDEX IF NOT EXISTS idx_cs_inquiries_answered ON public.cs_inquiries(is_answered);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cs_inquiries_unique_market_inquiry
    ON public.cs_inquiries(user_id, market_config_id, inquiry_id);
CREATE INDEX IF NOT EXISTS idx_cs_templates_user_created ON public.cs_templates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_sync_logs_user_created ON public.order_sync_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_sync_logs_user_created ON public.cs_sync_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_push_logs_user_created ON public.tracking_push_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_push_logs_order_number ON public.tracking_push_logs(order_number);

-- ==========================================
-- 4. Row Level Security (RLS)
-- ==========================================
ALTER TABLE public.user_market_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_publish_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_margin_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detail_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cs_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_push_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sourcing_configs ENABLE ROW LEVEL SECURITY;

-- Policies (DROP IF EXISTS + CREATE to ensure correct definition)
DROP POLICY IF EXISTS "Users manage own configs" ON public.user_market_configs;
CREATE POLICY "Users manage own configs" ON public.user_market_configs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own jobs" ON public.collection_jobs;
CREATE POLICY "Users manage own jobs" ON public.collection_jobs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage raw products via job" ON public.raw_products;
DROP POLICY IF EXISTS "Users manage own raw_products" ON public.raw_products;
CREATE POLICY "Users manage own raw_products" ON public.raw_products
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own products" ON public.products;
CREATE POLICY "Users manage own products" ON public.products
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own publish logs" ON public.market_publish_logs;
CREATE POLICY "Users view own publish logs" ON public.market_publish_logs
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = market_publish_logs.product_id AND p.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users manage own orders" ON public.orders;
CREATE POLICY "Users manage own orders" ON public.orders
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own order items" ON public.order_items;
CREATE POLICY "Users manage own order items" ON public.order_items
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    ));

DROP POLICY IF EXISTS "Users manage own cs inquiries" ON public.cs_inquiries;
CREATE POLICY "Users manage own cs inquiries" ON public.cs_inquiries
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cs templates" ON public.cs_templates;
CREATE POLICY "Users manage own cs templates" ON public.cs_templates
    FOR ALL USING (auth.uid() = user_id);

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

DROP POLICY IF EXISTS "Users manage own order sync logs" ON public.order_sync_logs;
CREATE POLICY "Users manage own order sync logs" ON public.order_sync_logs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own cs sync logs" ON public.cs_sync_logs;
CREATE POLICY "Users manage own cs sync logs" ON public.cs_sync_logs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own tracking push logs" ON public.tracking_push_logs;
CREATE POLICY "Users manage own tracking push logs" ON public.tracking_push_logs
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own sourcing configs" ON public.user_sourcing_configs;
CREATE POLICY "Users manage own sourcing configs" ON public.user_sourcing_configs
    FOR ALL USING (auth.uid() = user_id);

-- ==========================================
-- 5. Realtime
-- ==========================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.collection_jobs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ==========================================
-- 6. Storage
-- ==========================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public image access" ON storage.objects;
CREATE POLICY "Public image access" ON storage.objects
    FOR SELECT USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated image upload" ON storage.objects;
CREATE POLICY "Authenticated image upload" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'product-images' AND auth.role() = 'authenticated'
    );

-- ==========================================
-- 7. Triggers (updated_at auto-refresh)
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 7.1 RPC Functions
-- ==========================================
-- Atomic default-policy setter to avoid race conditions under concurrent requests.
-- If the policy does not belong to the current user, nothing is updated.
CREATE OR REPLACE FUNCTION public.set_default_product_policy(p_policy_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
    WITH target AS (
        SELECT 1 AS ok
        FROM public.product_policies
        WHERE id = p_policy_id
          AND user_id = auth.uid()
        LIMIT 1
    ),
    upd AS (
        UPDATE public.product_policies
        SET is_default = (id = p_policy_id)
        WHERE user_id = auth.uid()
          AND EXISTS (SELECT 1 FROM target)
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd);
$$;

GRANT EXECUTE ON FUNCTION public.set_default_product_policy(UUID) TO authenticated;

DROP TRIGGER IF EXISTS trg_user_market_configs_updated_at ON public.user_market_configs;
CREATE TRIGGER trg_user_market_configs_updated_at
    BEFORE UPDATE ON public.user_market_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_collection_jobs_updated_at ON public.collection_jobs;
CREATE TRIGGER trg_collection_jobs_updated_at
    BEFORE UPDATE ON public.collection_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cs_templates_updated_at ON public.cs_templates;
CREATE TRIGGER trg_cs_templates_updated_at
    BEFORE UPDATE ON public.cs_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_user_sourcing_configs_updated_at ON public.user_sourcing_configs;
CREATE TRIGGER trg_user_sourcing_configs_updated_at
    BEFORE UPDATE ON public.user_sourcing_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_product_policies_updated_at ON public.product_policies;
CREATE TRIGGER trg_product_policies_updated_at
    BEFORE UPDATE ON public.product_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_detail_templates_updated_at ON public.detail_templates;
CREATE TRIGGER trg_detail_templates_updated_at
    BEFORE UPDATE ON public.detail_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
