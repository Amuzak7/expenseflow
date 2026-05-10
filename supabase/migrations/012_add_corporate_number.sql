-- trading_partners に法人番号・最終更新者カラムを追加
-- （updated_at は 001_initial_schema.sql のトリガーで既に管理済み）
ALTER TABLE public.trading_partners
  ADD COLUMN IF NOT EXISTS corporate_number  text,
  ADD COLUMN IF NOT EXISTS updated_by        uuid REFERENCES auth.users(id);
