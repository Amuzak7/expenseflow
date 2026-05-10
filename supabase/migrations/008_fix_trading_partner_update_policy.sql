-- trading_partners UPDATE ポリシーを修正
--
-- 【原因】
-- PostgreSQL の RLS では SELECT ポリシーの USING 式が
-- UPDATE の新行チェック（WITH CHECK）にも適用される。
-- 007 で SELECT ポリシーに deleted_at IS NULL を追加したため、
-- ソフトデリート（deleted_at をセットする UPDATE）が新行チェックで弾かれていた。
--
-- 【修正】
-- UPDATE ポリシーに明示的な WITH CHECK を追加する。
-- ・USING  : 削除済みのレコードは更新不可（二重削除防止）
-- ・WITH CHECK : 新行は company_id の一致のみ要求（deleted_at のセットを許可）

DROP POLICY IF EXISTS "自社の取引先を更新" ON public.trading_partners;

CREATE POLICY "自社の取引先を更新"
  ON public.trading_partners FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    company_id = public.get_user_company_id()
  );
