/**
 * lib/email.ts
 * Resend を使ったメール送信ユーティリティ
 *
 * 必要な環境変数:
 *   RESEND_API_KEY      — Resend ダッシュボードから取得
 *   RESEND_FROM_EMAIL   — 送信元アドレス（例: noreply@expenseflow.example.com）
 *                         Resend で検証済みドメインのアドレスを使用すること
 */

import { Resend } from "resend";

// Resend クライアント（遅延初期化）
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY が設定されていません。");
    }
    _resend = new Resend(key);
  }
  return _resend;
}

// ─────────────────────────────────────────────
// 送信関数
// ─────────────────────────────────────────────

export interface SendEmailParams {
  to:      string;   // 受信者メールアドレス
  subject: string;
  html:    string;
}

/**
 * メールを送信する。
 * 失敗しても呼び出し元には影響を与えない（サイレント失敗）。
 */
export async function sendEmail(params: SendEmailParams): Promise<void> {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    console.warn("[sendEmail] RESEND_FROM_EMAIL が未設定です。メール送信をスキップします。");
    return;
  }

  try {
    const resend = getResend();
    const { error } = await resend.emails.send({
      from,
      to:      params.to,
      subject: params.subject,
      html:    params.html,
    });

    if (error) {
      console.error("[sendEmail] Resend error:", error);
    }
  } catch (err) {
    console.error("[sendEmail] Unexpected error:", err);
  }
}
