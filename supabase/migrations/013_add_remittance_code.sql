-- 振込依頼人コードカラムを取引先テーブルに追加
ALTER TABLE public.trading_partners
  ADD COLUMN IF NOT EXISTS remittance_code text;

COMMENT ON COLUMN public.trading_partners.remittance_code IS '振込依頼人コード（任意）';
