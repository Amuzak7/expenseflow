import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase 管理者クライアント（Service Role Key使用）
 *
 * ⚠️ このクライアントは RLS をバイパスします。
 * サーバーサイド専用。絶対にクライアントに公開しないこと。
 *
 * 用途:
 *  - auth.users からユーザーのメールアドレスを取得
 *  - バックグラウンドジョブなど RLS が不要な処理
 */
export function createAdminClient() {
  const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const roleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !roleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません。"
    );
  }

  return createSupabaseClient(url, roleKey, {
    auth: {
      autoRefreshToken:  false,
      persistSession:    false,
      detectSessionInUrl: false,
    },
  });
}
