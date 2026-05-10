-- ============================================================
-- ExpenseFlow 入金予定マッチングスキーマ (Migration 016)
-- ============================================================

-- ── 1. incoming_plans.status に 'partial'（一部入金済み）を追加 ──

ALTER TABLE public.incoming_plans
  DROP CONSTRAINT IF EXISTS incoming_plans_status_check;

ALTER TABLE public.incoming_plans
  ADD CONSTRAINT incoming_plans_status_check
  CHECK (status IN ('pending', 'received', 'cancelled', 'partial'));

COMMENT ON COLUMN public.incoming_plans.status IS
  'pending:未入金 | received:入金済み | cancelled:キャンセル | partial:一部入金済み。遅延はUI側でpending/partial+past date として判定。';

-- ── 2. 入金予定と実際の入金明細の紐づけテーブル ──────────────────

CREATE TABLE public.incoming_plan_matches (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid        NOT NULL REFERENCES public.companies(id),
  incoming_plan_id     uuid        NOT NULL REFERENCES public.incoming_plans(id)  ON DELETE CASCADE,
  bank_transaction_id  uuid        NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  -- この入金で充当した金額（= bank_transaction.amount）
  matched_amount       integer     NOT NULL CHECK (matched_amount > 0),
  -- auto:自動マッチング | manual:手動マッチング
  match_type           text        NOT NULL DEFAULT 'auto'
                                   CHECK (match_type IN ('auto', 'manual')),
  match_reason         text,       -- 一致した理由（例: "金額完全一致", "金額近似(2.3%差)"）
  created_by           uuid        REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- 同一明細は同一入金予定に1回しか紐づかない
  UNIQUE (bank_transaction_id, incoming_plan_id)
);

COMMENT ON TABLE  public.incoming_plan_matches IS
  '入金予定と実際の入金明細の紐づけ。1予定に対して複数の入金を紐づけ可能（分割入金対応）。';
COMMENT ON COLUMN public.incoming_plan_matches.match_type IS
  'auto:システムによる自動マッチング | manual:ユーザーによる手動マッチング';
COMMENT ON COLUMN public.incoming_plan_matches.matched_amount IS
  'この bank_transaction で充当した金額。通常は bank_transaction.amount と同値。';

-- インデックス
CREATE INDEX idx_ipm_plan_id ON public.incoming_plan_matches (incoming_plan_id);
CREATE INDEX idx_ipm_tx_id   ON public.incoming_plan_matches (bank_transaction_id);

-- ── 3. RLS ───────────────────────────────────────────────────────

ALTER TABLE public.incoming_plan_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自社の入金予定マッチを参照" ON public.incoming_plan_matches FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定マッチを登録" ON public.incoming_plan_matches FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定マッチを更新" ON public.incoming_plan_matches FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定マッチを削除" ON public.incoming_plan_matches FOR DELETE
  USING (company_id = public.get_user_company_id());
