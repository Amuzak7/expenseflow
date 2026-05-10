-- ============================================================
-- Migration 019: 差し戻し機能
-- expenses テーブルに return_reason カラムを追加し、
-- DELETE RLS ポリシーを 'returned' ステータスにも対応させる
-- ============================================================

-- 1. return_reason カラムを追加（差し戻し理由）
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS return_reason text;

-- 2. DELETE RLS ポリシーを更新（'returned' も取り消し可能に）
--    migration 017 で作成した "本人の未処理経費を削除" を置き換える
DROP POLICY IF EXISTS "本人の未処理経費を削除" ON public.expenses;

CREATE POLICY "本人の未処理経費を削除"
  ON public.expenses FOR DELETE
  USING (
    user_id = auth.uid()
    AND status IN ('draft', 'submitted', 'returned')
    AND company_id = public.get_user_company_id()
  );
