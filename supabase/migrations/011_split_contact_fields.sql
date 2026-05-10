-- 連絡先フィールドを電話番号・メール・部署に分割
ALTER TABLE public.trading_partners
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS email      text;

-- contact_info は phone/email に分割したため削除
ALTER TABLE public.trading_partners
  DROP COLUMN IF EXISTS contact_info;
