-- trading_partners に担当者名・連絡先カラムを追加
ALTER TABLE public.trading_partners
  ADD COLUMN IF NOT EXISTS contact_person text,
  ADD COLUMN IF NOT EXISTS contact_info   text;
