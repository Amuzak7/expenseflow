-- ============================================================
-- ExpenseFlow 初期スキーマ
-- Supabase SQL Editorにコピーして実行してください
-- ============================================================

-- UUID拡張が有効であることを確認（Supabaseでは通常デフォルトで有効）
create extension if not exists "uuid-ossp";

-- ============================================================
-- テーブル定義
-- ============================================================

-- companies: テナント単位（1社 = 1テナント）
create table public.companies (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  created_at  timestamptz not null default now()
);
comment on table public.companies is '会社（テナント）テーブル。RLSで他社データを完全隔離する。';

-- profiles: auth.usersと1:1対応。会社への帰属・ロール管理
create table public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  company_id  uuid        references public.companies(id),
  full_name   text,
  role        text        not null default 'member', -- 'admin' | 'member' | 'approver'
  created_at  timestamptz not null default now()
);
comment on table public.profiles is 'ユーザープロファイル。auth.usersと1対1で紐づく。';

-- trading_partners: 取引先マスタ（入金マッチングの基盤）
create table public.trading_partners (
  id                    uuid        primary key default gen_random_uuid(),
  company_id            uuid        not null references public.companies(id),
  name                  text        not null,              -- 会社名
  bank_name             text,                              -- 銀行名
  branch_name           text,                             -- 支店名
  account_type          text,                              -- 普通 | 当座
  account_number_last4  char(4),                          -- 口座番号下4桁のみ（セキュリティ要件）
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.trading_partners is '取引先マスタ。口座番号は下4桁のみ保存（フル番号は保存不可）。';
comment on column public.trading_partners.account_number_last4 is 'セキュリティ要件：口座番号の下4桁のみ保存。フルの口座番号は絶対に保存しないこと。';

-- trading_partner_aliases: 振込名義（1取引先に複数登録可）
create table public.trading_partner_aliases (
  id                  uuid        primary key default gen_random_uuid(),
  trading_partner_id  uuid        not null references public.trading_partners(id) on delete cascade,
  alias_name          text        not null,  -- 振込名義（入金マッチングに使用）
  is_primary          boolean     not null default false,
  created_at          timestamptz not null default now()
);
comment on table public.trading_partner_aliases is '振込名義エイリアス。1取引先に対して複数の振込名義を管理できる。';

-- ============================================================
-- updated_at 自動更新トリガー
-- ============================================================

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trading_partners_updated_at
  before update on public.trading_partners
  for each row execute function public.update_updated_at();

-- ============================================================
-- 新規ユーザー登録時にプロファイルを自動作成するトリガー
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS（Row Level Security）の有効化
-- ============================================================

alter table public.companies              enable row level security;
alter table public.profiles               enable row level security;
alter table public.trading_partners       enable row level security;
alter table public.trading_partner_aliases enable row level security;

-- ============================================================
-- ヘルパー関数: ログインユーザーのcompany_idを返す
-- RLSポリシーから呼び出す（security definerで安全に使用）
-- ============================================================

create or replace function public.get_user_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- ============================================================
-- RLSポリシー定義
-- ============================================================

-- companies: 自社のみ参照可能
create policy "自社のみ参照"
  on public.companies for select
  using (id = public.get_user_company_id());

-- profiles: 同一会社のプロファイルを参照可能
create policy "同一会社のプロファイルを参照"
  on public.profiles for select
  using (company_id = public.get_user_company_id());

create policy "自分のプロファイルを更新"
  on public.profiles for update
  using (id = auth.uid());

-- trading_partners: 自社の取引先のみCRUD可能
create policy "自社の取引先を参照"
  on public.trading_partners for select
  using (company_id = public.get_user_company_id());

create policy "自社の取引先を登録"
  on public.trading_partners for insert
  with check (company_id = public.get_user_company_id());

create policy "自社の取引先を更新"
  on public.trading_partners for update
  using (company_id = public.get_user_company_id());

create policy "自社の取引先を削除"
  on public.trading_partners for delete
  using (company_id = public.get_user_company_id());

-- trading_partner_aliases: 親の取引先が自社のものであれば操作可能
create policy "自社の取引先の振込名義を参照"
  on public.trading_partner_aliases for select
  using (
    exists (
      select 1 from public.trading_partners tp
      where tp.id = trading_partner_id
        and tp.company_id = public.get_user_company_id()
    )
  );

create policy "自社の取引先に振込名義を登録"
  on public.trading_partner_aliases for insert
  with check (
    exists (
      select 1 from public.trading_partners tp
      where tp.id = trading_partner_id
        and tp.company_id = public.get_user_company_id()
    )
  );

create policy "自社の取引先の振込名義を更新"
  on public.trading_partner_aliases for update
  using (
    exists (
      select 1 from public.trading_partners tp
      where tp.id = trading_partner_id
        and tp.company_id = public.get_user_company_id()
    )
  );

create policy "自社の取引先の振込名義を削除"
  on public.trading_partner_aliases for delete
  using (
    exists (
      select 1 from public.trading_partners tp
      where tp.id = trading_partner_id
        and tp.company_id = public.get_user_company_id()
    )
  );

-- ============================================================
-- 初期セットアップ用ヘルパー関数
-- ユーザー登録後に会社を作成して紐づける場合に使用
-- ============================================================

create or replace function public.setup_company_for_user(
  p_company_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  -- 会社を作成
  insert into public.companies (name)
  values (p_company_name)
  returning id into v_company_id;

  -- プロファイルに会社を紐づけ、adminロールを付与
  update public.profiles
  set company_id = v_company_id,
      role = 'admin'
  where id = auth.uid();

  return v_company_id;
end;
$$;

comment on function public.setup_company_for_user is
  '初回ログイン時に会社を作成してユーザーに紐づける。
   使用例: SELECT setup_company_for_user(''株式会社サンプル'');';
