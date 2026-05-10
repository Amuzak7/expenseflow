import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

/**
 * Supabase Auth コールバックルート
 *
 * 用途:
 *  1. メールリンク認証・招待リンク（PKCE code）のセッション交換
 *  2. 招待承認後に invitations テーブルから該当レコードを削除
 *     → /dashboard へリダイレクト
 *
 * Supabase inviteUserByEmail のリダイレクト先として設定:
 *   redirectTo: `${APP_URL}/auth/callback`
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // code が無い場合はログインページへ（直接アクセス等）
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const supabase = await createClient();

    // PKCE code をセッションに交換
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[auth/callback] code exchange error:", exchangeError.message);
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent("招待リンクが無効または期限切れです")}`
      );
    }

    // セッション確立後にユーザー情報を取得
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.email) {
      // invitations テーブルから該当メールアドレスのレコードを削除
      // 新規ユーザーはまだ admin ロールを持たないため、admin クライアントで RLS をバイパスして削除
      const admin = createAdminClient();
      const { error: deleteError } = await admin
        .from("invitations")
        .delete()
        .eq("email", user.email.toLowerCase());

      if (deleteError) {
        // 削除失敗はログのみ（ログイン継続）
        console.warn("[auth/callback] invitation delete error:", deleteError.message);
      } else {
        console.log(`[auth/callback] invitation deleted for: ${user.email}`);
        // 設定画面のキャッシュを無効化し、管理者が次回アクセス時に招待中リストを最新化する
        revalidatePath("/settings");
      }
    }

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    console.error("[auth/callback] unexpected error:", err);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("認証処理中にエラーが発生しました")}`
    );
  }
}
