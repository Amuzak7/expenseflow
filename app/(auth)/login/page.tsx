import type { Metadata } from "next";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* ロゴ・タイトル */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-teal flex items-center justify-center">
              <span className="text-white font-bold text-sm">E</span>
            </div>
            <span className="text-xl font-bold text-foreground">
              ExpenseFlow
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            ログイン
          </h1>
          <p className="text-sm text-muted-foreground">
            メールアドレスとパスワードでサインインしてください
          </p>
        </div>

        {/* ログインフォーム（Client Component） */}
        <LoginForm />

        <p className="text-center text-xs text-muted-foreground">
          ログインに問題がある場合は管理者にお問い合わせください
        </p>
      </div>
    </div>
  );
}
