-- ============================================================
-- ExpenseFlow 経費精算スキーマ (Migration 003)
-- 001_initial_schema.sql 実行後に実行してください
-- ============================================================

-- ============================================================
-- expenses: 経費申請レコード
-- ============================================================

create table public.expenses (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references public.companies(id),
  user_id         uuid        not null references auth.users(id),

  -- 領収書ファイル
  receipt_path    text,                        -- Supabase Storage パス

  -- 金額情報
  amount          integer,                     -- 税込合計金額（円）
  tax_amount      integer,                     -- 消費税額（円）

  -- 領収書情報
  date            date,                        -- 領収書日付
  vendor          text,                        -- 取引先・店舗名
  category        text,                        -- 経費カテゴリ（交通費/食費 等）
  description     text,                        -- 摘要・品目
  receipt_number  text,                        -- 領収書番号
  payment_method  text,                        -- 支払方法

  -- Claude Vision 解析結果（生データ保存）
  analysis        jsonb,

  -- ワークフロー
  status          text        not null default 'draft',
  -- 'draft': 下書き | 'submitted': 申請中 | 'approved': 承認済 | 'rejected': 却下

  notes           text,                        -- 申請者メモ

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.expenses is '経費精算申請テーブル。Claude Vision で領収書を解析して作成される。';
comment on column public.expenses.receipt_path is 'Supabase Storage の expense-receipts バケット内パス。';
comment on column public.expenses.analysis is 'Claude Vision の生解析結果 JSON。デバッグ・監査用。';

-- updated_at 自動更新（関数は 001 で定義済み）
create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.update_updated_at();

-- ============================================================
-- RLS
-- ============================================================

alter table public.expenses enable row level security;

-- 同一会社の経費のみ参照可能
create policy "自社の経費を参照"
  on public.expenses for select
  using (company_id = public.get_user_company_id());

-- 自分の経費のみ登録可能
create policy "自分の経費を登録"
  on public.expenses for insert
  with check (
    company_id = public.get_user_company_id()
    and user_id = auth.uid()
  );

-- 自分の経費 or 同社の管理者・承認者が更新可能
create policy "経費を更新"
  on public.expenses for update
  using (
    company_id = public.get_user_company_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'approver')
      )
    )
  );

-- 下書きのみ本人が削除可能
create policy "下書き経費を削除"
  on public.expenses for delete
  using (
    user_id = auth.uid()
    and status = 'draft'
    and company_id = public.get_user_company_id()
  );

-- ============================================================
-- Supabase Storage バケット: expense-receipts
-- ============================================================
-- NOTE: Supabase ダッシュボードの Storage タブ、または以下の SQL で作成してください。
-- プロジェクトによっては storage スキーマへのアクセス権限が必要です。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-receipts',
  'expense-receipts',
  false,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

-- Storage RLS: 認証済みユーザーが自社のフォルダにのみアップロード可能
create policy "自社フォルダへのアップロード"
  on storage.objects for insert
  with check (
    bucket_id = 'expense-receipts'
    and auth.uid() is not null
  );

-- Storage RLS: 認証済みユーザーが参照可能
create policy "認証済みユーザーが参照可能"
  on storage.objects for select
  using (
    bucket_id = 'expense-receipts'
    and auth.uid() is not null
  );

-- Storage RLS: 本人のファイルのみ削除可能（パスの先頭が自分のUUID）
create policy "本人のファイルを削除"
  on storage.objects for delete
  using (
    bucket_id = 'expense-receipts'
    and auth.uid() is not null
  );
