// ─────────────────────────────────────────────────────────────────────
// メールテンプレート（HTML）
// 承認 / 却下 / 差し戻し の3種類
// ─────────────────────────────────────────────────────────────────────

interface BaseParams {
  recipientName: string;   // 受信者の氏名
  vendor:        string;   // 取引先
  amount:        number;   // 金額
  date:          string;   // 申請日（YYYY-MM-DD）
  appUrl:        string;   // アプリのベースURL
}

// ─── 共通レイアウト ─────────────────────────────────────────────────

function layout(content: string, subject: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;width:100%;">

          <!-- ヘッダー -->
          <tr>
            <td style="background-color:#0f172a;border-radius:12px 12px 0 0;padding:20px 32px;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="width:32px;height:32px;background-color:#0ea5e9;border-radius:8px;
                             text-align:center;vertical-align:middle;">
                    <span style="color:#ffffff;font-weight:700;font-size:16px;line-height:32px;">E</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="color:#ffffff;font-weight:700;font-size:16px;">ExpenseFlow</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- 本文 -->
          <tr>
            <td style="background-color:#ffffff;padding:32px;border-radius:0 0 12px 12px;">
              ${content}

              <!-- フッター -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:20px;">
                <tr>
                  <td style="font-size:12px;color:#94a3b8;line-height:1.6;">
                    このメールは ExpenseFlow から自動送信されています。<br />
                    心当たりのない場合は、このメールを無視してください。
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 申請サマリー行（共通パーツ）────────────────────────────────────

function expenseSummaryTable(vendor: string, amount: number, date: string): string {
  return `
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                margin:20px 0;overflow:hidden;">
    <tr>
      <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="font-size:12px;color:#64748b;">取引先</td>
            <td align="right" style="font-size:14px;font-weight:600;color:#0f172a;">${escHtml(vendor)}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 20px;border-bottom:1px solid #e2e8f0;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="font-size:12px;color:#64748b;">金額</td>
            <td align="right" style="font-size:18px;font-weight:700;color:#0f172a;">
              ¥${amount.toLocaleString()}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
          <tr>
            <td style="font-size:12px;color:#64748b;">申請日</td>
            <td align="right" style="font-size:14px;color:#0f172a;">${escHtml(date)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

// ─── CTA ボタン ──────────────────────────────────────────────────────

function ctaButton(url: string, label: string, color: string): string {
  return `
  <table cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0;">
    <tr>
      <td style="border-radius:8px;background-color:${color};">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;
                  color:#ffffff;text-decoration:none;letter-spacing:0.01em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

// ─── XSS 対策 ────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─────────────────────────────────────────────────────────────────────
// 承認メール
// ─────────────────────────────────────────────────────────────────────

export interface ApprovedEmailParams extends BaseParams {}

export function buildApprovedEmail(p: ApprovedEmailParams): {
  subject: string;
  html:    string;
} {
  const subject = `【承認】経費申請が承認されました — ${p.vendor}`;

  const content = `
    <!-- バッジ -->
    <div style="display:inline-block;background-color:#dcfce7;color:#16a34a;
                border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;
                margin-bottom:16px;">
      ✓ 承認済み
    </div>

    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;line-height:1.3;">
      経費申請が承認されました
    </h1>
    <p style="margin:0 0 4px;font-size:14px;color:#475569;">
      ${escHtml(p.recipientName)} さん、以下の経費申請が承認されました。
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">
      支払いが完了次第、改めてお知らせします。
    </p>

    ${expenseSummaryTable(p.vendor, p.amount, p.date)}

    ${ctaButton(`${p.appUrl}/expenses`, "申請一覧を確認する", "#16a34a")}
  `;

  return { subject, html: layout(content, subject) };
}

// ─────────────────────────────────────────────────────────────────────
// 却下メール
// ─────────────────────────────────────────────────────────────────────

export interface RejectedEmailParams extends BaseParams {
  reason: string;
}

export function buildRejectedEmail(p: RejectedEmailParams): {
  subject: string;
  html:    string;
} {
  const subject = `【却下】経費申請が却下されました — ${p.vendor}`;

  const content = `
    <!-- バッジ -->
    <div style="display:inline-block;background-color:#fee2e2;color:#dc2626;
                border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;
                margin-bottom:16px;">
      ✗ 却下
    </div>

    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;line-height:1.3;">
      経費申請が却下されました
    </h1>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">
      ${escHtml(p.recipientName)} さん、以下の経費申請が却下されました。
    </p>

    ${expenseSummaryTable(p.vendor, p.amount, p.date)}

    <!-- 却下理由 -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;
                  border-radius:0 8px 8px 0;margin:0 0 24px;overflow:hidden;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#dc2626;">却下理由</p>
          <p style="margin:0;font-size:14px;color:#7f1d1d;line-height:1.6;">${escHtml(p.reason)}</p>
        </td>
      </tr>
    </table>

    ${ctaButton(`${p.appUrl}/expenses`, "申請一覧を確認する", "#dc2626")}
  `;

  return { subject, html: layout(content, subject) };
}

// ─────────────────────────────────────────────────────────────────────
// 差し戻しメール
// ─────────────────────────────────────────────────────────────────────

export interface ReturnedEmailParams extends BaseParams {
  reason: string;
}

export function buildReturnedEmail(p: ReturnedEmailParams): {
  subject: string;
  html:    string;
} {
  const subject = `【差し戻し】経費申請が差し戻されました — ${p.vendor}`;

  const content = `
    <!-- バッジ -->
    <div style="display:inline-block;background-color:#fff7ed;color:#ea580c;
                border-radius:999px;padding:4px 12px;font-size:12px;font-weight:600;
                margin-bottom:16px;">
      ↩ 差し戻し
    </div>

    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;line-height:1.3;">
      経費申請が差し戻されました
    </h1>
    <p style="margin:0 0 4px;font-size:14px;color:#475569;">
      ${escHtml(p.recipientName)} さん、以下の経費申請が差し戻されました。
    </p>
    <p style="margin:0 0 20px;font-size:14px;color:#475569;">
      内容を修正して再申請してください。
    </p>

    ${expenseSummaryTable(p.vendor, p.amount, p.date)}

    <!-- 差し戻し理由 -->
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
           style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;
                  border-radius:0 8px 8px 0;margin:0 0 24px;overflow:hidden;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#ea580c;">差し戻し理由</p>
          <p style="margin:0;font-size:14px;color:#7c2d12;line-height:1.6;">${escHtml(p.reason)}</p>
        </td>
      </tr>
    </table>

    ${ctaButton(`${p.appUrl}/expenses`, "申請内容を修正して再申請する", "#ea580c")}
  `;

  return { subject, html: layout(content, subject) };
}
