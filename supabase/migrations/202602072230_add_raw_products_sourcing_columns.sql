-- raw_products 테이블에 11번가/지마켓 소싱을 위한 컬럼 추가
-- user_id: 사용자 식별 (RLS 용)
-- site_id: 소싱 사이트 (11st, gmarket, aliexpress, taobao)
-- status: 수집 상태 (collected, detail_crawled, converted)
-- raw_data: 크롤링된 상세 데이터 (카테고리, 옵션, 판매자 등)

ALTER TABLE public.raw_products
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS site_id VARCHAR(50) DEFAULT 'aliexpress',
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'collected',
  ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}';

-- user_id + site_id + external_id 유니크 인덱스 (upsert 지원)
CREATE UNIQUE INDEX IF NOT EXISTS raw_products_user_site_external
  ON public.raw_products(user_id, site_id, external_id);

-- 기존 RLS 정책 제거 후 user_id 기반 정책 추가
DROP POLICY IF EXISTS "Users manage raw products via job" ON public.raw_products;
DROP POLICY IF EXISTS "Users manage own raw_products" ON public.raw_products;

CREATE POLICY "Users manage own raw_products" ON public.raw_products
  FOR ALL USING (auth.uid() = user_id);
