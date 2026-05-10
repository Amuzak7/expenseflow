-- ============================================================
-- Migration 020: 却下理由カラム追加
-- expenses テーブルに rejection_reason カラムを追加する
-- ============================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejection_reason text;
