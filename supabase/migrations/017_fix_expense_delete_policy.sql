-- ============================================================
-- Migration 017: 経費削除 RLS ポリシーを修正
-- submitted（承認待ち）も本人が削除できるよう変更
-- ============================================================

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "下書き経費を削除" ON public.expenses;

-- 新ポリシー: draft + submitted（承認待ち）を本人が削除可能
CREATE POLICY "本人の未処理経費を削除"
  ON public.expenses FOR DELETE
  USING (
    user_id = auth.uid()
    AND status IN ('draft', 'submitted')
    AND company_id = public.get_user_company_id()
  );
