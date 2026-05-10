import { createBrowserClient } from "@supabase/ssr";

/**
 * ブラウザ（クライアントコンポーネント）用 Supabaseクライアント
 * "use client" のコンポーネントから呼び出すこと
 *
 * TODO: Supabaseプロジェクト作成後、以下で型安全に切り替える:
 *   import type { Database } from "@/types/database";
 *   return createBrowserClient<Database>(...)
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
