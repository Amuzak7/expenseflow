-- payment_matches: 確定担当者を追加
ALTER TABLE public.payment_matches
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES auth.users(id);

-- bank_transactions: 無視日時・無視担当者を追加
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS ignored_at  timestamptz,
  ADD COLUMN IF NOT EXISTS ignored_by  uuid REFERENCES auth.users(id);
