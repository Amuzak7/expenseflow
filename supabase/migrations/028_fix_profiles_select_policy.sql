-- =====================================================
-- Migration 028: profiles SELECT ポリシーの再帰を根本解決
-- =====================================================
-- 問題:
--   "同一会社のプロファイルを参照" ポリシーが get_user_company_id() を呼び
--   get_user_company_id() が profiles を SELECT → 無限再帰
--
-- 解決策:
--   profiles の SELECT ポリシーを「自分のプロファイルのみ」に簡略化
--   他ユーザーのプロファイルは server actions で createAdminClient() 経由で取得
--   （サービスロールキーはサーバーサイドのみで安全に使用）
-- =====================================================

-- 再帰を引き起こす SELECT ポリシーを削除
DROP POLICY IF EXISTS "同一会社のプロファイルを参照" ON public.profiles;

-- シンプルな非再帰ポリシー: 自分のプロファイルのみ参照可能
-- 他社ユーザー列挙を防ぎつつ再帰を完全排除
DROP POLICY IF EXISTS "自分のプロファイルを参照" ON public.profiles;
CREATE POLICY "自分のプロファイルを参照"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());
