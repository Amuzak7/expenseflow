-- trading_partners ソフトデリート対応
-- deleted_at / deleted_by カラムを追加し、
-- SELECT ポリシーを「削除済みを除外」に更新する

ALTER TABLE public.trading_partners
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by  uuid REFERENCES auth.users(id);

-- 既存の SELECT ポリシーを削除済み除外版に差し替え
DROP POLICY IF EXISTS "自社の取引先を参照" ON public.trading_partners;

CREATE POLICY "自社の取引先を参照"
  ON public.trading_partners FOR SELECT
  USING (
    company_id = public.get_user_company_id()
    AND deleted_at IS NULL
  );
