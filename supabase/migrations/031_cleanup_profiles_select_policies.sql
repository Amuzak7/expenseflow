-- =====================================================
-- Migration 031: profiles の SELECT ポリシーを完全整理
-- =====================================================
-- 再帰を起こす古い SELECT ポリシーをすべて削除し
-- JWT ベースの正しい2つのみ残す
-- =====================================================

-- ─────────────────────────────────────────────────
-- 既存の SELECT ポリシーをすべて削除（名前の揺れに対応）
-- ─────────────────────────────────────────────────

-- migration 001 の元ポリシー
DROP POLICY IF EXISTS "同一会社のプロファイルを参照"         ON public.profiles;

-- migration 023 以前に作られた可能性があるもの
DROP POLICY IF EXISTS "Users can view own profile"            ON public.profiles;
DROP POLICY IF EXISTS "users can view own profile"            ON public.profiles;

-- migration 028 で作成したもの
DROP POLICY IF EXISTS "自分のプロファイルを参照"             ON public.profiles;

-- migration 029 / 030 で作成したもの（一旦削除して再作成）
DROP POLICY IF EXISTS "company members can view company profiles" ON public.profiles;
DROP POLICY IF EXISTS "admin can view all company profiles"       ON public.profiles;

-- ─────────────────────────────────────────────────
-- SELECT ポリシーを2つだけ正しく作成
-- どちらも JWT app_metadata から company_id を読む（再帰なし）
-- ─────────────────────────────────────────────────

-- ① 同一会社の全メンバーが互いのプロファイルを参照可能
--    OR id = auth.uid() は JWT に company_id がない古いセッションの安全弁
CREATE POLICY "company members can view company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    OR id = auth.uid()
  );

-- ② admin は自社の全プロファイルを参照可能（① と重複するが明示的に残す）
CREATE POLICY "admin can view all company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
