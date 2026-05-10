-- ============================================================
-- Migration 018: 経費精算に「目的・用途」フィールドと添付ファイル機能を追加
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. expenses テーブルに purpose（目的・用途）列を追加
--    既存レコードとの互換性のため nullable とし、アプリ層で必須入力を強制する
-- ─────────────────────────────────────────────
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS purpose text;

COMMENT ON COLUMN public.expenses.purpose IS '支出の目的・用途（例: A社との商談、社内会議用）';

-- ─────────────────────────────────────────────
-- 2. expense_attachments テーブル
--    1つの経費申請に複数の添付ファイル（請求書・名簿・議事録等）を紐付ける
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id),
  expense_id   uuid        NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_path    text        NOT NULL,   -- Storage 内のパス
  file_name    text        NOT NULL,   -- 元のファイル名
  file_size    integer,                -- バイト数
  mime_type    text,                   -- MIMEタイプ
  uploaded_by  uuid        REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.expense_attachments IS '経費申請への添付ファイル（請求書・名簿・議事録など）';

-- ─────────────────────────────────────────────
-- 3. RLS ポリシー
-- ─────────────────────────────────────────────
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;

-- 同社のみ参照可能
CREATE POLICY "自社の添付ファイルを参照"
  ON public.expense_attachments FOR SELECT
  USING (company_id = public.get_user_company_id());

-- 自分の経費申請にのみ添付可能
CREATE POLICY "自分の経費に添付ファイルを追加"
  ON public.expense_attachments FOR INSERT
  WITH CHECK (
    company_id  = public.get_user_company_id()
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.expenses e
      WHERE e.id = expense_id
        AND e.user_id = auth.uid()
    )
  );

-- 自分がアップロードしたファイルのみ削除可能
CREATE POLICY "自分の添付ファイルを削除"
  ON public.expense_attachments FOR DELETE
  USING (
    uploaded_by = auth.uid()
    AND company_id = public.get_user_company_id()
  );

-- ─────────────────────────────────────────────
-- 4. Storage バケット: expense-attachments
--    対応形式: PDF・画像・Word・Excel・CSV（最大 20MB）
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-attachments',
  'expense-attachments',
  false,
  20971520, -- 20MB
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "expense-attachments: アップロード許可"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'expense-attachments'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "expense-attachments: 参照許可"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'expense-attachments'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "expense-attachments: 削除許可"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'expense-attachments'
    AND auth.uid() IS NOT NULL
  );
