-- ============================================================
-- ExpenseFlow 入金予定スキーマ (Migration 015)
-- ============================================================

CREATE TABLE public.incoming_plans (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id),
  -- 取引先との紐づけは任意
  trading_partner_id  uuid        REFERENCES public.trading_partners(id) ON DELETE SET NULL,
  -- 取引先を選択しなかった場合の自由入力。trading_partner_id がある場合は取引先名を優先表示
  company_name        text,
  alias_name          text,       -- 振込名義（任意）
  amount              integer     NOT NULL CHECK (amount > 0),
  planned_date        date        NOT NULL,
  memo                text,
  -- pending:未入金 | received:入金済み | cancelled:キャンセル
  -- 「遅延」は UI 側で計算（pending かつ planned_date < today）
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending', 'received', 'cancelled')),
  created_by          uuid        REFERENCES auth.users(id),
  updated_by          uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.incoming_plans IS '入金予定管理。取引先との紐づけは任意。';
COMMENT ON COLUMN public.incoming_plans.status IS 'pending:未入金 | received:入金済み | cancelled:キャンセル。遅延はUI側でpending+past date として判定。';

-- インデックス
CREATE INDEX idx_incoming_plans_company_id  ON public.incoming_plans (company_id);
CREATE INDEX idx_incoming_plans_date        ON public.incoming_plans (planned_date);
CREATE INDEX idx_incoming_plans_status      ON public.incoming_plans (status);
CREATE INDEX idx_incoming_plans_partner     ON public.incoming_plans (trading_partner_id);

-- RLS
ALTER TABLE public.incoming_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自社の入金予定を参照" ON public.incoming_plans FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定を登録" ON public.incoming_plans FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定を更新" ON public.incoming_plans FOR UPDATE
  USING (company_id = public.get_user_company_id());

CREATE POLICY "自社の入金予定を削除" ON public.incoming_plans FOR DELETE
  USING (company_id = public.get_user_company_id());
