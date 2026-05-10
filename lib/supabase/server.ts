import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * サーバーコンポーネント・Server Actions・Route Handlers用 Supabaseクライアント
 * Next.js 15以降では cookies() は async なので await が必要
 *
 * TODO: Supabaseプロジェクト作成後、以下で型安全に切り替える:
 *   import type { Database } from "@/types/database";
 *   return createServerClient<Database>(...)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Componentから呼ばれた場合はcookieのsetが不可なので無視
            // middleware側でセッション更新するため問題なし
          }
        },
      },
    }
  );
}
