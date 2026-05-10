import client from "@/lib/anthropic";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface ReceiptAnalysis {
  date: string | null;           // YYYY-MM-DD
  amount: number | null;         // 税込合計金額（円）
  taxAmount: number | null;      // 消費税額（円）
  vendor: string | null;         // 取引先・店舗名
  category: string | null;       // 経費カテゴリ
  description: string | null;    // 摘要・品目
  receiptNumber: string | null;  // 領収書番号
  paymentMethod: string | null;  // 支払方法
  confidence: "high" | "medium" | "low";
  rawText: string;
}

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// ─────────────────────────────────────────────
// プロンプト
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `あなたは日本語の領収書・レシートから構造化データを抽出する専門AIです。
画像またはPDFから領収書の内容を正確に読み取り、指定されたJSON形式のみを返してください。
説明文・マークダウン・コードブロックは一切不要です。JSONのみを返してください。`;

const USER_PROMPT = `この領収書・レシートから以下のフィールドを抽出し、JSON形式で返してください。
見つからないフィールドは null を設定してください。

{
  "date": "日付（YYYY-MM-DD形式。例: 2024-03-15）",
  "amount": "税込合計金額（整数・円単位。例: 1500）",
  "taxAmount": "消費税額（整数・円単位。例: 136）",
  "vendor": "店舗名・取引先名（例: 株式会社サンプル）",
  "category": "経費カテゴリ（交通費/食費/宿泊費/接待費/消耗品費/通信費/その他 のいずれか）",
  "description": "品目・摘要の概要（例: 東京-大阪間 新幹線代）",
  "receiptNumber": "領収書番号・レシート番号",
  "paymentMethod": "支払方法（現金/クレジットカード/電子マネー/銀行振込/その他 のいずれか）",
  "confidence": "解析の確信度（high: ほぼすべての主要フィールドが確認できた / medium: 一部のみ確認できた / low: ほとんど確認できなかった）",
  "rawText": "領収書に記載されている全テキスト内容"
}

JSONのみを返してください。`;

// ─────────────────────────────────────────────
// JSON パース（マークダウンコードブロック除去）
// ─────────────────────────────────────────────

function parseAnalysisJson(text: string): ReceiptAnalysis {
  const cleaned = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  return {
    date: (parsed.date as string | null) ?? null,
    amount: typeof parsed.amount === "number" ? parsed.amount : null,
    taxAmount: typeof parsed.taxAmount === "number" ? parsed.taxAmount : null,
    vendor: (parsed.vendor as string | null) ?? null,
    category: (parsed.category as string | null) ?? null,
    description: (parsed.description as string | null) ?? null,
    receiptNumber: (parsed.receiptNumber as string | null) ?? null,
    paymentMethod: (parsed.paymentMethod as string | null) ?? null,
    confidence: (["high", "medium", "low"].includes(parsed.confidence as string)
      ? parsed.confidence
      : "low") as ReceiptAnalysis["confidence"],
    rawText: typeof parsed.rawText === "string" ? parsed.rawText : "",
  };
}

// ─────────────────────────────────────────────
// メイン: 領収書解析
// ─────────────────────────────────────────────

export async function analyzeReceiptImage(
  base64: string,
  mediaType: string
): Promise<ReceiptAnalysis> {
  const isPdf = mediaType === "application/pdf";

  let responseText: string;

  if (isPdf) {
    const response = await client.beta.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      betas: ["pdfs-2024-09-25"],
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type from Claude");
    responseText = block.text;
  } else {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as ImageMediaType,
                data: base64,
              },
            },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    });

    const block = response.content[0];
    if (block.type !== "text") throw new Error("Unexpected response type from Claude");
    responseText = block.text;
  }

  return parseAnalysisJson(responseText);
}
