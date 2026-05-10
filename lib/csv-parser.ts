/**
 * lib/csv-parser.ts
 * 銀行CSVパーサー
 *
 * 対応フォーマット（自動検出）:
 *   - 三菱UFJ銀行 (MUFG)
 *   - みずほ銀行
 *   - 三井住友銀行 (SMBC)
 *   - 楽天銀行 / PayPay銀行など（汎用フォールバック）
 *
 * TODO: より多くの銀行フォーマットへの対応、Shift-JISデコード対応
 */

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface ParsedBankTransaction {
  /** ISO date string (YYYY-MM-DD) */
  date: string;
  /** 入金額（円）※出金行はスキップ */
  amount: number;
  /** 振込人名義 */
  senderName: string;
  /** 摘要 */
  description?: string;
  /** 口座番号下4桁（CSVに含まれている場合のみ）*/
  accountLast4?: string;
  /** 振込依頼人コード（CSVに含まれている場合のみ）*/
  remittanceCode?: string;
  /** CSV元行データ（デバッグ・監査用） */
  rawRow: Record<string, string>;
}

export interface ParseResult {
  transactions: ParsedBankTransaction[];
  /** パース時の警告メッセージ */
  warnings: string[];
  /** 検出されたフォーマット名 */
  detectedFormat: string;
  /** 読み飛ばした行数 */
  skippedRows: number;
}

// ─────────────────────────────────────────────
// 銀行フォーマット定義
// ─────────────────────────────────────────────

interface BankFormat {
  name: string;
  /** ヘッダー行にこのパターンが含まれていれば検出とみなす */
  detectPattern: RegExp;
  columns: {
    date: string[];         // 日付カラムの候補名
    credit: string[];       // 入金額カラムの候補名
    sender: string[];       // 振込人名義カラムの候補名
    description?: string[]; // 摘要カラムの候補名（省略時は sender と同じ）
    accountLast4?: string[]; // 口座番号カラムの候補名
    remittanceCode?: string[]; // 振込依頼人コードカラムの候補名
  };
}

const BANK_FORMATS: BankFormat[] = [
  {
    name: "三菱UFJ銀行",
    detectPattern: /お引き出し金額|お預け入れ金額/,
    columns: {
      date: ["取引日"],
      credit: ["お預け入れ金額"],
      sender: ["取引内容"],
      description: ["取引内容"],
    },
  },
  {
    name: "みずほ銀行",
    detectPattern: /金額（収入）|金額\(収入\)/,
    columns: {
      date: ["取引日付", "取引日"],
      credit: ["金額（収入）", "金額(収入)"],
      sender: ["摘要"],
      description: ["摘要"],
    },
  },
  {
    name: "三井住友銀行",
    detectPattern: /お預け入れ金額|差引残高/,
    columns: {
      date: ["日付"],
      credit: ["お預け入れ金額"],
      sender: ["摘要"],
      description: ["摘要"],
    },
  },
  {
    name: "楽天銀行",
    detectPattern: /入出金区分|入出金金額/,
    columns: {
      date: ["取引日", "日付"],
      credit: ["入出金金額", "入金金額"],
      sender: ["入出金先内容", "摘要"],
      description: ["取引内容", "摘要"],
    },
  },
  {
    // 汎用フォールバック
    name: "汎用フォーマット",
    detectPattern: /.*/,
    columns: {
      date: ["日付", "取引日", "取引日付", "date", "Date", "DATE", "年月日"],
      credit: [
        "入金額", "入金金額", "入金", "お預け入れ", "credit", "Credit",
        "収入", "入出金金額",
      ],
      sender: [
        "振込人名", "振込人", "相手先", "摘要", "取引内容", "sender",
        "Sender", "名義", "入出金先",
      ],
      description: ["摘要", "内容", "説明", "memo", "備考"],
      accountLast4: [
        "口座番号下4桁", "口座下4桁", "口座番号", "account", "Account",
      ],
      remittanceCode: [
        "振込依頼人コード", "依頼人コード", "振込コード", "依頼人番号",
        "振込人コード", "remittance_code", "remittanceCode", "code", "Code",
      ],
    },
  },
];

// ─────────────────────────────────────────────
// 日付パース
// ─────────────────────────────────────────────

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/\s/g, "");
  if (!s) return null;

  // YYYY/MM/DD or YYYY-MM-DD
  const m1 = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;

  // YYYYMMDD
  const m2 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  // MM/DD/YYYY
  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m3) return `${m3[3]}-${m3[1].padStart(2, "0")}-${m3[2].padStart(2, "0")}`;

  // YY/MM/DD (2桁年)
  const m4 = s.match(/^(\d{2})[/\-](\d{1,2})[/\-](\d{1,2})$/);
  if (m4) return `20${m4[1]}-${m4[2].padStart(2, "0")}-${m4[3].padStart(2, "0")}`;

  // 和暦（例: R06.01.15 = 令和6年1月15日）
  const m5 = s.match(/^[Rr](\d{1,2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m5) {
    const year = 2018 + parseInt(m5[1]); // 令和元年 = 2019
    return `${year}-${m5[2].padStart(2, "0")}-${m5[3].padStart(2, "0")}`;
  }

  return null;
}

// ─────────────────────────────────────────────
// 金額パース
// ─────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw.trim()) return null;
  // カンマ・円記号・スペースを除去して数値に変換
  const cleaned = raw.replace(/[,，¥￥\s]/g, "").replace(/円$/, "");
  const num = parseInt(cleaned, 10);
  return isNaN(num) || num <= 0 ? null : num;
}

// ─────────────────────────────────────────────
// CSV行パーサー（ダブルクォート対応）
// ─────────────────────────────────────────────

export function parseCSVLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        // エスケープされたダブルクォート
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === "，") && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

// ─────────────────────────────────────────────
// カラムインデックスの検出
// ─────────────────────────────────────────────

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.includes(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─────────────────────────────────────────────
// 振込人名義の抽出
// 摘要欄から「振込 カブシキカイシャXX」のような形式を解析
// ─────────────────────────────────────────────

function extractSenderName(raw: string): string {
  if (!raw) return "";
  // 「振込 ○○」「振込　○○」の形式
  const transferMatch = raw.match(/^振込[　\s]+(.+)$/);
  if (transferMatch) return transferMatch[1].trim();

  // 「フリコミ ○○」の形式（半角カナ）
  const furikomiMatch = raw.match(/^フリコミ[　\s]+(.+)$/);
  if (furikomiMatch) return furikomiMatch[1].trim();

  return raw.trim();
}

// ─────────────────────────────────────────────
// メインパース関数
// ─────────────────────────────────────────────

/**
 * CSVテキストをパースして入金明細のリストに変換する
 *
 * @param csvText CSVファイルの内容（UTF-8テキスト）
 * @returns ParseResult パース結果
 */
export function parseCSV(csvText: string): ParseResult {
  const warnings: string[] = [];
  let skippedRows = 0;

  // BOM除去 + 改行正規化
  const normalized = csvText.replace(/^﻿/, "").trim();
  const lines = normalized.split(/\r?\n/);

  if (lines.length < 2) {
    return {
      transactions: [],
      warnings: ["CSVデータが空か、ヘッダー行のみです"],
      detectedFormat: "unknown",
      skippedRows: 0,
    };
  }

  // ─── ヘッダー行の検出 ───────────────────────
  // 先頭の空行・コメント行（#）を読み飛ばす
  let headerLineIndex = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith("#")) {
      headerLineIndex = i;
      break;
    }
  }

  const headerLine = lines[headerLineIndex];
  const headers = parseCSVLine(headerLine);

  // ─── フォーマット検出 ─────────────────────────
  let detectedFormat = BANK_FORMATS[BANK_FORMATS.length - 1]; // デフォルトは汎用
  for (const format of BANK_FORMATS) {
    if (format.detectPattern.test(headerLine)) {
      detectedFormat = format;
      break;
    }
  }

  // ─── カラムインデックスのマッピング ──────────
  const dateIdx    = findColumnIndex(headers, detectedFormat.columns.date);
  const creditIdx  = findColumnIndex(headers, detectedFormat.columns.credit);
  const senderIdx  = findColumnIndex(headers, detectedFormat.columns.sender);
  const descIdx    = detectedFormat.columns.description
    ? findColumnIndex(headers, detectedFormat.columns.description)
    : senderIdx;
  const acctIdx    = detectedFormat.columns.accountLast4
    ? findColumnIndex(headers, detectedFormat.columns.accountLast4)
    : -1;
  const remitIdx   = detectedFormat.columns.remittanceCode
    ? findColumnIndex(headers, detectedFormat.columns.remittanceCode)
    : -1;

  if (dateIdx === -1)   warnings.push("日付カラムを自動検出できませんでした");
  if (creditIdx === -1) warnings.push("入金額カラムを自動検出できませんでした");
  if (senderIdx === -1) warnings.push("振込人名義カラムを自動検出できませんでした");

  // 必須カラムが見つからない場合は早期リターン
  if (dateIdx === -1 || creditIdx === -1) {
    return {
      transactions: [],
      warnings: [
        ...warnings,
        "必須カラム（日付・入金額）が見つかりません。CSVフォーマットを確認してください。",
      ],
      detectedFormat: detectedFormat.name,
      skippedRows: lines.length - headerLineIndex - 1,
    };
  }

  // ─── データ行のパース ────────────────────────
  const transactions: ParsedBankTransaction[] = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { skippedRows++; continue; }

    const cells = parseCSVLine(line);

    // rawRowを生成
    const rawRow: Record<string, string> = {};
    headers.forEach((h, idx) => { rawRow[h] = cells[idx] ?? ""; });

    // 日付パース
    const dateRaw  = cells[dateIdx] ?? "";
    const parsedDate = parseDate(dateRaw);
    if (!parsedDate) {
      skippedRows++;
      if (dateRaw) warnings.push(`行${i + 1}: 日付「${dateRaw}」をパースできずスキップ`);
      continue;
    }

    // 入金額パース（0 or 空 = 出金行としてスキップ）
    const creditRaw  = cells[creditIdx] ?? "";
    const parsedAmount = parseAmount(creditRaw);
    if (!parsedAmount) {
      skippedRows++; // 出金行は正常スキップ（警告不要）
      continue;
    }

    // 振込人名義
    const senderRaw = senderIdx !== -1 ? (cells[senderIdx] ?? "") : "";
    const senderName = extractSenderName(senderRaw) || `振込人不明 (行${i + 1})`;

    // 摘要（senderと別カラムの場合）
    const description = descIdx !== -1 && descIdx !== senderIdx
      ? (cells[descIdx] ?? "")
      : undefined;

    // 口座番号下4桁（あれば）
    let accountLast4: string | undefined;
    if (acctIdx !== -1) {
      const acctRaw = cells[acctIdx] ?? "";
      const last4 = acctRaw.replace(/\D/g, "").slice(-4);
      if (last4.length === 4) accountLast4 = last4;
    }

    // 振込依頼人コード（あれば）
    let remittanceCode: string | undefined;
    if (remitIdx !== -1) {
      const remitRaw = (cells[remitIdx] ?? "").trim();
      if (remitRaw) remittanceCode = remitRaw;
    }

    transactions.push({
      date: parsedDate,
      amount: parsedAmount,
      senderName,
      description: description || undefined,
      accountLast4,
      remittanceCode,
      rawRow,
    });
  }

  return {
    transactions,
    warnings,
    detectedFormat: detectedFormat.name,
    skippedRows,
  };
}
