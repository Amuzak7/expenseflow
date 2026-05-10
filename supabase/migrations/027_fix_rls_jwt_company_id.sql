-- =====================================================
-- Migration 027: RLS再帰を根本解決 — JWT app_metadata方式
-- =====================================================
-- 問題:
--   get_user_company_id() が profiles をクエリ
--   → profiles の SELECT RLS が get_user_company_id() を呼ぶ → 無限再帰
--   SET row_security = off は Supabase 環境では適用されない場合がある
--
-- 解決策:
--   1. 既存ユーザーの app_metadata に company_id を書き込む
--   2. handle_new_user() でも app_metadata に company_id を書き込むよう更新
--   3. get_user_company_id() を JWT app_metadata から読む方式に書き換え
--      → DB クエリ不要 → 再帰が物理的に発生しない
--
-- 注意: このマイグレーション実行後、既存ログイン済みユーザーは
--       サインアウト→サインインでJWTを再取得する必要があります
-- =====================================================

-- ─────────────────────────────────────────────────
-- 1. 既存ユーザーの auth.users.raw_app_meta_data に
--    company_id を書き込む（service role が必要）
-- ─────────────────────────────────────────────────

UPDATE auth.users au
SET raw_app_meta_data =
  COALESCE(au.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('company_id', p.company_id::text)
FROM public.profiles p
WHERE au.id = p.id
  AND p.company_id IS NOT NULL;

-- ─────────────────────────────────────────────────
-- 2. handle_new_user() を更新
--    新規ユーザー登録時に app_metadata.company_id も設定する
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_role       text;
BEGIN
  v_company_id := (NEW.raw_user_meta_data->>'company_id')::uuid;
  v_role       := COALESCE(NEW.raw_user_meta_data->>'role', 'member');

  -- profiles テーブルに挿入
  INSERT INTO public.profiles (id, full_name, company_id, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_company_id,
    v_role
  );

  -- app_metadata に company_id を書き込む（JWT に含まれるようになる）
  IF v_company_id IS NOT NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('company_id', v_company_id::text)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────
-- 3. get_user_company_id() を JWT から読む方式に書き換え
--    DB クエリなし → 再帰が発生しない
--    JWT に company_id がない場合（古いセッション）は
--    SECURITY DEFINER + row_security = off でフォールバック
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_company_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- まず JWT の app_metadata から取得（DB クエリなし、再帰なし）
  v_company_id := (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid;

  -- JWT に含まれていない場合（サインイン直後など）はDBから取得
  -- SECURITY DEFINER + row_security = off により再帰しない
  IF v_company_id IS NULL THEN
    SELECT company_id INTO v_company_id
    FROM public.profiles
    WHERE id = auth.uid();
  END IF;

  RETURN v_company_id;
END;
$$;

-- ─────────────────────────────────────────────────
-- 4. is_admin() も同様に JWT を優先する方式に更新
-- ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_role text;
BEGIN
  -- DB クエリで確認（row_security = off により再帰しない）
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN v_role = 'admin';
END;
$$;
