-- ─────────────────────────────────────────────────────────────────────
-- 024_phase2_settings.sql
-- 経費ルール / 通知設定 / セキュリティ設定
-- ─────────────────────────────────────────────────────────────────────

-- 1. 経費ルール（会社単位） ────────────────────────────────────────────
CREATE TABLE public.expense_rules (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- NULL = 全件承認必要（閾値なし）、N = N円以上で承認必要
  approval_required_amount  integer,
  -- NULL = 不要、N = N円以上で領収書必須
  receipt_required_amount   integer,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

CREATE TRIGGER expense_rules_updated_at
  BEFORE UPDATE ON public.expense_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.expense_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自社ルールを参照"
  ON public.expense_rules FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "adminがルールを管理"
  ON public.expense_rules FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "adminがルールを更新"
  ON public.expense_rules FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 2. 経費科目マスタ（会社単位） ─────────────────────────────────────────
CREATE TABLE public.expense_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自社科目を参照"
  ON public.expense_categories FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "adminが科目を追加"
  ON public.expense_categories FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "adminが科目を更新"
  ON public.expense_categories FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "adminが科目を削除"
  ON public.expense_categories FOR DELETE
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. 通知設定（ユーザー単位） ──────────────────────────────────────────
CREATE TABLE public.notification_settings (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id                uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- メール通知
  email_on_approved         boolean     NOT NULL DEFAULT true,
  email_on_rejected         boolean     NOT NULL DEFAULT true,
  email_on_returned         boolean     NOT NULL DEFAULT true,
  email_on_payment_delayed  boolean     NOT NULL DEFAULT true,
  email_on_new_request      boolean     NOT NULL DEFAULT true,
  -- アプリ内通知
  app_on_approved           boolean     NOT NULL DEFAULT true,
  app_on_rejected           boolean     NOT NULL DEFAULT true,
  app_on_returned           boolean     NOT NULL DEFAULT true,
  app_on_payment_delayed    boolean     NOT NULL DEFAULT true,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TRIGGER notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "自分の通知設定を参照"
  ON public.notification_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "自分の通知設定を作成"
  ON public.notification_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "自分の通知設定を更新"
  ON public.notification_settings FOR UPDATE
  USING (user_id = auth.uid());

-- 4. profiles にセッションタイムアウト設定を追加 ────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS session_timeout_minutes integer NOT NULL DEFAULT 0;
-- 0 = タイムアウトなし, 30, 60, 240
