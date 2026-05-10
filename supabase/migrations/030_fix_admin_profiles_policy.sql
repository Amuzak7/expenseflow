-- =====================================================
-- Migration 030: admin profiles SELECT ポリシーの再帰修正
-- =====================================================
-- "admin can view all company profiles" が profiles を
-- subquery で参照しており無限再帰が発生していたため
-- JWT の app_metadata.company_id を使う方式に置き換える
-- =====================================================

DROP POLICY IF EXISTS "admin can view all company profiles" ON public.profiles;

CREATE POLICY "admin can view all company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    AND role = 'admin'
  );
