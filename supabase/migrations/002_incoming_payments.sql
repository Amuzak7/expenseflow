-- ============================================================
-- ExpenseFlow 入金確認スキーマ (Migration 002)
-- 001_initial_schema.sql 実行後に実行してください
-- ============================================================

-- bank_transactions: アップロードされた銀行明細
create table public.bank_transactions (
  id                    uuid        primary key default gen_random_uuid(),
  company_id            uuid        not null references public.companies(id),
  transaction_date      date        not null,       -- 取引日
  amount                integer     not null,        -- 入金額（円）
  sender_name           text        not null,        -- 振込人名義（CSVから取得）
  description           text,                        -- 摘要
  account_number_last4  char(4),                    -- 口座番号下4桁（CSVに含まれる場合のみ）
  raw_data              jsonb,                       -- CSV元データ（デバッグ・監査用）
  upload_batch_id       text,                        -- 同じCSVアップロードをグルーピングするID
  status                text        not null default 'unmatched',
  -- 'unmatched': 未マッチ | 'matched': 確認済み | 'ignored': 無視
  created_at            timestamptz not null default now()
);
comment on table public.bank_transactions is '銀行CSVからアップロードされた入金明細。';
comment on column public.bank_transactions.account_number_last4 is 'セキュリティ要件：下4桁のみ保存可。フルの口座番号は保存不可。';
comment on column public.bank_transactions.upload_batch_id is '同一CSVアップロードのバッチIDとして使用。同じCSVを誤って二重登録した場合の識別に活用。';

-- payment_matches: マッチング候補（各明細に対して複数の候補が存在しうる）
create table public.payment_matches (
  id                    uuid        primary key default gen_random_uuid(),
  bank_transaction_id   uuid        not null references public.bank_transactions(id) on delete cascade,
  trading_partner_id    uuid        references public.trading_partners(id) on delete set null,
  score                 integer     not null check (score >= 0 and score <= 100),
  match_reason          jsonb       not null,   -- { reasons: string[], confidence: 'high'|'medium'|'low' }
  is_top_match          boolean     not null default false,
  status                text        not null default 'pending',
  -- 'pending': 確認待ち | 'confirmed': 確定 | 'rejected': 否定
  confirmed_at          timestamptz,
  created_at            timestamptz not null default now()
);
comment on table public.payment_matches is '入金明細と取引先のマッチング候補。スコア順に最大3件まで保存される。';

-- インデックス（検索・並び替えの高速化）
create index idx_bank_transactions_company_id  on public.bank_transactions (company_id);
create index idx_bank_transactions_status      on public.bank_transactions (status);
create index idx_bank_transactions_date        on public.bank_transactions (transaction_date desc);
create index idx_bank_transactions_batch       on public.bank_transactions (upload_batch_id);
create index idx_payment_matches_tx_id         on public.payment_matches (bank_transaction_id);
create index idx_payment_matches_partner_id    on public.payment_matches (trading_partner_id);
create index idx_payment_matches_top           on public.payment_matches (bank_transaction_id, is_top_match);

-- ============================================================
-- RLS（Row Level Security）の有効化
-- ============================================================

alter table public.bank_transactions  enable row level security;
alter table public.payment_matches    enable row level security;

-- bank_transactions: 自社のデータのみCRUD可能
create policy "自社の入金明細を参照"
  on public.bank_transactions for select
  using (company_id = public.get_user_company_id());

create policy "自社の入金明細を登録"
  on public.bank_transactions for insert
  with check (company_id = public.get_user_company_id());

create policy "自社の入金明細を更新"
  on public.bank_transactions for update
  using (company_id = public.get_user_company_id());

create policy "自社の入金明細を削除"
  on public.bank_transactions for delete
  using (company_id = public.get_user_company_id());

-- payment_matches: 親の bank_transactions が自社のものなら操作可能
create policy "自社のマッチングを参照"
  on public.payment_matches for select
  using (
    exists (
      select 1 from public.bank_transactions bt
      where bt.id = bank_transaction_id
        and bt.company_id = public.get_user_company_id()
    )
  );

create policy "自社のマッチングを登録"
  on public.payment_matches for insert
  with check (
    exists (
      select 1 from public.bank_transactions bt
      where bt.id = bank_transaction_id
        and bt.company_id = public.get_user_company_id()
    )
  );

create policy "自社のマッチングを更新"
  on public.payment_matches for update
  using (
    exists (
      select 1 from public.bank_transactions bt
      where bt.id = bank_transaction_id
        and bt.company_id = public.get_user_company_id()
    )
  );
