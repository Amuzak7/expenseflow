-- ─────────────────────────────────────────────────────────────────────
-- 021_notifications.sql
-- アプリ内通知テーブルと RLS ポリシー
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE public.notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  type        text        NOT NULL,   -- 'approved' | 'rejected' | 'returned'
  title       text        NOT NULL,
  body        text        NOT NULL,
  expense_id  uuid        REFERENCES public.expenses(id)           ON DELETE CASCADE,
  is_read     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- インデックス（未読件数取得 / 一覧取得を高速化）
CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id, is_read, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 自分宛ての通知のみ SELECT 可
CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- 同一 company_id ユーザーなら INSERT 可（承認者 → 申請者への通知作成）
CREATE POLICY "notifications_insert_same_company"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- 自分宛ての通知のみ UPDATE 可（既読化）
CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid());

-- 自分宛ての通知のみ DELETE 可
CREATE POLICY "notifications_delete_own"
  ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());
