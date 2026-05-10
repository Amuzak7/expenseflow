-- bank_transactions に振込依頼人コードカラムを追加
-- CSVから読み込んだ振込依頼人コードを保存し、取引先マスタの remittance_code と照合する
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS remittance_code text;

COMMENT ON COLUMN public.bank_transactions.remittance_code IS 'CSVから取得した振込依頼人コード（取引先マスタの remittance_code と完全一致でマッチング精度向上）';
