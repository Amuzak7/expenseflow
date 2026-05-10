-- =====================================================
-- Migration 026: RLS 無限再帰の修正
-- =====================================================
-- 問題:
--   PostgreSQL 15+ では SECURITY DEFINER だけでは RLS をスキップしない。
--   get_user_company_id() が profiles を SELECT → RLS が同関数を呼ぶ → 無限再帰。
--   各ポリシーの EXISTS (SELECT FROM profiles ...) も同様。
--
-- 修正:
--   1. get_user_company_id() に SET row_security = off を追加
--   2. is_admin() ヘルパー関数を作成（SET row_security = off 付き）
--   3. EXISTS (SELECT FROM profiles ...) を is_admin() に置き換え
-- =====================================================

-- ─────────────────────────────────────────────────
-- 1. get_user_company_id() を再作成（row_security = off 追加）
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

-- ─────────────────────────────────────────────────
-- 2. is_admin() ヘルパー関数を作成
--    ポリシー内で profiles を直接参照する代わりに使用する
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- ─────────────────────────────────────────────────
-- 3. companies ポリシーを修正
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "adminが自社情報を更新" ON public.companies;
CREATE POLICY "adminが自社情報を更新"
  ON public.companies FOR UPDATE
  USING (
    id = public.get_user_company_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────
-- 4. profiles ポリシーを修正（最重要：自己参照の直接再帰）
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "adminが同一会社プロファイルを更新" ON public.profiles;
CREATE POLICY "adminが同一会社プロファイルを更新"
  ON public.profiles FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────
-- 5. invitations ポリシーを修正
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "adminが招待を作成" ON public.invitations;
CREATE POLICY "adminが招待を作成"
  ON public.invitations FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "adminが招待を削除" ON public.invitations;
CREATE POLICY "adminが招待を削除"
  ON public.invitations FOR DELETE
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────
-- 6. expense_rules ポリシーを修正
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "adminがルールを管理" ON public.expense_rules;
CREATE POLICY "adminがルールを管理"
  ON public.expense_rules FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "adminがルールを更新" ON public.expense_rules;
CREATE POLICY "adminがルールを更新"
  ON public.expense_rules FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────
-- 7. expense_categories ポリシーを修正
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "adminが科目を追加" ON public.expense_categories;
CREATE POLICY "adminが科目を追加"
  ON public.expense_categories FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "adminが科目を更新" ON public.expense_categories;
CREATE POLICY "adminが科目を更新"
  ON public.expense_categories FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "adminが科目を削除" ON public.expense_categories;
CREATE POLICY "adminが科目を削除"
  ON public.expense_categories FOR DELETE
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );

-- ─────────────────────────────────────────────────
-- 8. user_operation_logs ポリシーを修正（migration 025 で作成）
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin can read own company logs" ON public.user_operation_logs;
CREATE POLICY "admin can read own company logs"
  ON public.user_operation_logs FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id()
    AND public.is_admin()
  );
