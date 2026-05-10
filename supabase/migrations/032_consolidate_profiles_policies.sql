-- =====================================================
-- Migration 032: profiles RLS ポリシーを最終整理
-- =====================================================
-- SELECT: 3つ → 1つに集約（JWT ベース、再帰なし）
-- UPDATE: public ロール → authenticated ロールに修正
--         重複ポリシーを統合
-- =====================================================

-- ─────────────────────────────────────────────────
-- SELECT ポリシーをすべて削除して1つに統合
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own profile"                 ON public.profiles;
DROP POLICY IF EXISTS "admin can view all company profiles"        ON public.profiles;
DROP POLICY IF EXISTS "company members can view company profiles"  ON public.profiles;

-- 唯一の SELECT ポリシー（JWT ベース、再帰なし）
CREATE POLICY "company members can view company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- JWT の app_metadata.company_id と一致する会社のプロファイルを参照可能
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    -- JWT に company_id がない古いセッション向けの安全弁
    OR id = auth.uid()
  );

-- ─────────────────────────────────────────────────
-- UPDATE ポリシーを整理
-- public ロール → authenticated ロールに変更
-- 重複する admin ポリシーを1つに統合
-- ─────────────────────────────────────────────────

-- 既存の UPDATE ポリシーを全削除
DROP POLICY IF EXISTS "自分のプロファイルを更新"         ON public.profiles;
DROP POLICY IF EXISTS "adminが同一会社プロファイルを更新" ON public.profiles;
DROP POLICY IF EXISTS "admin can update company profiles"  ON public.profiles;

-- ① 自分のプロファイルを更新（authenticated ロール）
CREATE POLICY "自分のプロファイルを更新"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ② admin が同一会社のプロファイルを更新（authenticated ロール、JWT ベース）
CREATE POLICY "admin can update company profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
  );
