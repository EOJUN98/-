-- 상품 테이블에 정책 연결 컬럼 추가
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS policy_id UUID REFERENCES public.product_policies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_policy ON public.products(policy_id);
