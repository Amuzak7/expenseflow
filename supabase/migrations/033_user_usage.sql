-- =====================================================
-- Migration 033: user_usage テーブル作成（冪等）
-- Claude Vision 等の1日あたり利用回数を追跡
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           date        NOT NULL DEFAULT CURRENT_DATE,
  analysis_count integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

-- updated_at 自動更新
CREATE OR REPLACE FUNCTION public.set_user_usage_updated_at()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_usage_updated_at ON public.user_usage;
CREATE TRIGGER trg_user_usage_updated_at
  BEFORE UPDATE ON public.user_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_user_usage_updated_at();

-- RLS 有効化（自分の行のみ参照・更新可能）
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage"   ON public.user_usage;
DROP POLICY IF EXISTS "Users can upsert own usage" ON public.user_usage;

CREATE POLICY "Users can view own usage"
  ON public.user_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own usage"
  ON public.user_usage FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own usage"
  ON public.user_usage FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
