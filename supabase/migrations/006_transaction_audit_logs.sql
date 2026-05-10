-- ============================================================
-- 006_transaction_audit_logs.sql
-- 入金明細の操作履歴を記録する監査ログテーブル
-- 005_payment_audit.sql 実行後に実行してください
-- ============================================================

create table if not exists public.transaction_audit_logs (
  id                   uuid        primary key default gen_random_uuid(),
  company_id           uuid        not null references public.companies(id),
  bank_transaction_id  uuid        not null references public.bank_transactions(id) on delete cascade,
  -- 操作種別: confirmed/ignored/reverted/manual_matched/batch_confirmed
  action               text        not null,
  trading_partner_name text,        -- 確定時の取引先名（参照用スナップショット）
  performed_by         uuid        references auth.users(id),
  performed_at         timestamptz not null default now()
);

comment on table public.transaction_audit_logs is '入金明細に対する操作（確定・無視・取り消し等）の完全な操作履歴。';

create index if not exists idx_audit_logs_tx_id     on public.transaction_audit_logs (bank_transaction_id);
create index if not exists idx_audit_logs_company   on public.transaction_audit_logs (company_id);
create index if not exists idx_audit_logs_performed on public.transaction_audit_logs (performed_at desc);

alter table public.transaction_audit_logs enable row level security;

create policy "自社の操作ログを参照"
  on public.transaction_audit_logs for select
  using (company_id = public.get_user_company_id());

create policy "自社の操作ログを登録"
  on public.transaction_audit_logs for insert
  with check (company_id = public.get_user_company_id());
