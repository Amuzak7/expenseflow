-- ─────────────────────────────────────────────────────────────────────
-- 023_settings.sql
-- 設定画面向けのスキーマ拡張
-- ─────────────────────────────────────────────────────────────────────

-- 1. companies テーブルに会社情報カラムを追加 ──────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS postal_code          text,
  ADD COLUMN IF NOT EXISTS address              text,
  ADD COLUMN IF NOT EXISTS phone                text,
  ADD COLUMN IF NOT EXISTS representative_name  text,
  ADD COLUMN IF NOT EXISTS logo_url             text,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz NOT NULL DEFAULT now();

-- updated_at 自動更新トリガー（update_updated_at 関数は 001 で定義済み）
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- companies: admin のみ自社情報を更新可能
CREATE POLICY "adminが自社情報を更新"
  ON public.companies FOR UPDATE
  USING (
    id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. profiles に is_active カラムを追加 ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- profiles: admin が同一会社ユーザーのロール・is_active を更新可能
-- （既存の "自分のプロファイルを更新" ポリシーとの併用）
CREATE POLICY "adminが同一会社プロファイルを更新"
  ON public.profiles FOR UPDATE
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles AS admin_p
      WHERE admin_p.id = auth.uid() AND admin_p.role = 'admin'
    )
  );

-- 3. invitations テーブル ──────────────────────────────────────────
CREATE TABLE public.invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL DEFAULT 'member',
  invited_by  uuid        NOT NULL REFERENCES auth.users(id),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adminが招待を作成"
  ON public.invitations FOR INSERT
  WITH CHECK (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "同一会社の招待を参照"
  ON public.invitations FOR SELECT
  USING (company_id = public.get_user_company_id());

CREATE POLICY "adminが招待を削除"
  ON public.invitations FOR DELETE
  USING (
    company_id = public.get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 4. handle_new_user トリガー更新 ──────────────────────────────────
-- 招待経由のユーザー登録時に company_id・role をメタデータから引き継ぐ
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, company_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    CASE
      WHEN NEW.raw_user_meta_data->>'company_id' IS NOT NULL
        THEN (NEW.raw_user_meta_data->>'company_id')::uuid
      ELSE NULL
    END,
    COALESCE(NEW.raw_user_meta_data->>'role', 'member')
  );
  RETURN NEW;
END;
$$;

-- 5. Storage: company-logos バケット ──────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-logos',
  'company-logos',
  true,
  2097152,   -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "会社ロゴを誰でも参照可能"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'company-logos');

CREATE POLICY "認証済みユーザーがロゴをアップロード"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'company-logos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "認証済みユーザーがロゴを更新"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'company-logos'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "認証済みユーザーがロゴを削除"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'company-logos'
    AND auth.uid() IS NOT NULL
  );
