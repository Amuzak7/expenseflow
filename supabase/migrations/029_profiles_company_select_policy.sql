-- =====================================================
-- Migration 029: profiles の会社メンバー参照ポリシーを正しく再作成
-- =====================================================
-- 背景:
--   Migration 028 で再帰を起こす "同一会社のプロファイルを参照" を削除し
--   "自分のプロファイルを参照"（id = auth.uid()）のみにしたため
--   同一会社の他メンバーが参照できなくなった。
--
-- 修正方針:
--   subquery 方式は再帰するため使用不可。
--   Migration 027 で全ユーザーの app_metadata に company_id を書き込んだ。
--   JWT の app_metadata から company_id を読む方式はDB クエリなし → 再帰なし。
--
-- ⚠️ 注意:
--   このポリシーは Migration 027 の app_metadata 設定に依存する。
--   ログアウト→ログインし直してJWTを更新しないと company_id が取れない。
-- =====================================================

-- ─────────────────────────────────────────────────
-- 1. Migration 028 で作成した「自分のみ」ポリシーを削除
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "自分のプロファイルを参照" ON public.profiles;

-- ─────────────────────────────────────────────────
-- 2. 再帰しない会社メンバー参照ポリシーを作成
--    JWT の app_metadata.company_id を利用（DB クエリ不要）
-- ─────────────────────────────────────────────────

-- subquery 方式（再帰するため NG）は使用しない:
-- ❌ company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
--
-- JWT 方式（再帰しない）を使用する:
-- ✅ company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid

DROP POLICY IF EXISTS "company members can view company profiles" ON public.profiles;
CREATE POLICY "company members can view company profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- JWT の app_metadata から company_id を取得（再帰なし）
    company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
    -- 自分自身は常に参照可能（JWT に company_id がない古いセッションの安全弁）
    OR id = auth.uid()
  );

-- ─────────────────────────────────────────────────
-- 3. 旧 public ロールの再帰ポリシーを念のため削除
-- ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "同一会社のプロファイルを参照" ON public.profiles;
