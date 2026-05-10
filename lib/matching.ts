/**
 * lib/matching.ts
 * 入金マッチングロジック
 *
 * スコアリング基準（合計 100 点満点）:
 *   優先順位 1 — 振込依頼人コードマッチ（最優先）
 *     - remittance_code が両方に登録されており完全一致: +50 点
 *       かつ confidence を強制的に "high" に昇格（単独マッチでも高信頼度）
 *
 *   優先順位 2 — 振込名義マッチ（エイリアス含む）: 最大 75 点
 *     - 正規化後の完全一致: 75 点
 *     - どちらかが他方を含む（部分一致）: 50 点
 *     - 類似度 ≥ 80%: 35 点
 *     - 類似度 ≥ 60%: 20 点
 *
 *   優先順位 3 — 口座番号下4桁マッチ: +20 点
 *
 *   将来追加予定: 金額一致（+10 点）
 *
 * 信頼度レベル（コードマッチなし）:
 *   - high   (高): score ≥ 70 — 自動確定を提案
 *   - medium (中): score ≥ 40 — 確認推奨
 *   - low    (低): score ≥ 1  — 参考候補
 *
 * 信頼度レベル（コードマッチあり）:
 *   - score が 70 未満であっても "high" に強制昇格
 *   - 理由: 振込依頼人コードは金融機関が付与する一意の識別子であり、
 *           名義の類似度が低い（表記ゆれ・略称）場合でも高精度
 */

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export type MatchConfidence = "high" | "medium" | "low";

export interface MatchCandidate {
  tradingPartnerId: string;
  tradingPartnerName: string;
  /** 0–100 のスコア */
  score: number;
  confidence: MatchConfidence;
  /** マッチングの根拠（UI表示用） */
  reasons: string[];
  /** マッチした振込名義エイリアス（エイリアスがマッチした場合に設定） */
  matchedAlias?: string;
  /**
   * 振込依頼人コードが完全一致した場合 true
   * UI でバッジ表示・自動確定ロジックに使用
   */
  remittanceCodeMatched?: boolean;
}

export interface TransactionInput {
  senderName: string;
  amount: number;
  accountLast4?: string;
  /** CSVから取得した振込依頼人コード */
  remittanceCode?: string;
}

export interface TradingPartnerForMatching {
  id: string;
  name: string;
  account_number_last4: string | null;
  /** 取引先マスタに登録された振込依頼人コード */
  remittance_code: string | null;
  trading_partner_aliases: { alias_name: string }[];
}

// ─────────────────────────────────────────────
// 半角カタカナ → 全角カタカナ変換
// ─────────────────────────────────────────────

/** 半角カタカナの基本文字 → 全角カタカナ対応表 */
const HANKAKU_BASE: Record<string, string> = {
  ｦ: "ヲ", ｧ: "ァ", ｨ: "ィ", ｩ: "ゥ", ｪ: "ェ", ｫ: "ォ",
  ｬ: "ャ", ｭ: "ュ", ｮ: "ョ", ｯ: "ッ", ｰ: "ー",
  ｱ: "ア", ｲ: "イ", ｳ: "ウ", ｴ: "エ", ｵ: "オ",
  ｶ: "カ", ｷ: "キ", ｸ: "ク", ｹ: "ケ", ｺ: "コ",
  ｻ: "サ", ｼ: "シ", ｽ: "ス", ｾ: "セ", ｿ: "ソ",
  ﾀ: "タ", ﾁ: "チ", ﾂ: "ツ", ﾃ: "テ", ﾄ: "ト",
  ﾅ: "ナ", ﾆ: "ニ", ﾇ: "ヌ", ﾈ: "ネ", ﾉ: "ノ",
  ﾊ: "ハ", ﾋ: "ヒ", ﾌ: "フ", ﾍ: "ヘ", ﾎ: "ホ",
  ﾏ: "マ", ﾐ: "ミ", ﾑ: "ム", ﾒ: "メ", ﾓ: "モ",
  ﾔ: "ヤ", ﾕ: "ユ", ﾖ: "ヨ",
  ﾗ: "ラ", ﾘ: "リ", ﾙ: "ル", ﾚ: "レ", ﾛ: "ロ",
  ﾜ: "ワ", ﾝ: "ン",
};

/** 全角カタカナ + 濁点 → 濁音対応表 */
const DAKUTEN_MAP: Record<string, string> = {
  カ: "ガ", キ: "ギ", ク: "グ", ケ: "ゲ", コ: "ゴ",
  サ: "ザ", シ: "ジ", ス: "ズ", セ: "ゼ", ソ: "ゾ",
  タ: "ダ", チ: "ヂ", ツ: "ヅ", テ: "デ", ト: "ド",
  ハ: "バ", ヒ: "ビ", フ: "ブ", ヘ: "ベ", ホ: "ボ",
  ウ: "ヴ",
};

/** 全角カタカナ + 半濁点 → 半濁音対応表 */
const HANDAKUTEN_MAP: Record<string, string> = {
  ハ: "パ", ヒ: "ピ", フ: "プ", ヘ: "ペ", ホ: "ポ",
};

/**
 * 半角カタカナ文字列を全角カタカナに変換する。
 * ﾞ（U+FF9E）と ﾟ（U+FF9F）を直前の文字と合成して濁音・半濁音にする。
 */
function hankakuToZenkakuKana(str: string): string {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];
    const zenkaku = HANKAKU_BASE[ch];
    if (zenkaku) {
      if (next === "ﾞ" && DAKUTEN_MAP[zenkaku]) {
        result += DAKUTEN_MAP[zenkaku];
        i++;
      } else if (next === "ﾟ" && HANDAKUTEN_MAP[zenkaku]) {
        result += HANDAKUTEN_MAP[zenkaku];
        i++;
      } else {
        result += zenkaku;
      }
    } else {
      result += ch;
    }
  }
  return result;
}

// ─────────────────────────────────────────────
// 日本語名前正規化
// ─────────────────────────────────────────────

/**
 * 振込名義を比較しやすい形に正規化する。
 */
export function normalizeJapaneseName(name: string): string {
  return (
    hankakuToZenkakuKana(name)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) - 0xfee0)
      )
      .replace(/[ぁ-ゖ]/g, (c) =>
        String.fromCharCode(c.charCodeAt(0) + 0x60)
      )
      .toUpperCase()
      .replace(/[\s　・]/g, "")
      .replace(
        /カブシキカイシヤ|カブシキカイシャ|（カ）|\(カ\)|（株）|\(株\)|カ\)|カ）/g,
        "カ）"
      )
      .replace(
        /ユウゲンカイシヤ|ユウゲンカイシャ|（ユ）|\(ユ\)|（有）|\(有\)|ユ\)|ユ）/g,
        "ユ）"
      )
      .replace(/（資）|\(資\)|シ\)|シ）/g, "シ）")
      .replace(/^(フリコミ|振込|テイキ|定期)/, "")
  );
}

// ─────────────────────────────────────────────
// 振込依頼人コード正規化
// ─────────────────────────────────────────────

/**
 * 振込依頼人コードを正規化して比較しやすい形にする。
 * 前後の空白・ハイフン・スラッシュを除去して大文字化。
 */
function normalizeRemittanceCode(code: string): string {
  return code.trim().replace(/[\s\-\/]/g, "").toUpperCase();
}

// ─────────────────────────────────────────────
// レーベンシュタイン距離による類似度計算
// ─────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

/**
 * 文字列類似度を 0.0 〜 1.0 で返す
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

// ─────────────────────────────────────────────
// 振込依頼人コードスコア計算
// ─────────────────────────────────────────────

const REMITTANCE_CODE_SCORE = 50 as const;

interface RemittanceCodeScoreResult {
  score: number;
  matched: boolean;
  reason: string;
}

/**
 * 振込依頼人コードの一致スコアを計算する。
 *
 * 判定条件:
 *   - 両方（CSV側・取引先マスタ側）にコードが登録されていること
 *   - 正規化後に完全一致すること
 *
 * スコア: +50（単独では medium だが、confidence を "high" に昇格する）
 */
function computeRemittanceCodeScore(
  transactionCode: string | undefined,
  partnerCode: string | null
): RemittanceCodeScoreResult {
  if (!transactionCode || !partnerCode) {
    return { score: 0, matched: false, reason: "" };
  }

  const normalizedTx = normalizeRemittanceCode(transactionCode);
  const normalizedPartner = normalizeRemittanceCode(partnerCode);

  if (normalizedTx && normalizedPartner && normalizedTx === normalizedPartner) {
    return {
      score: REMITTANCE_CODE_SCORE,
      matched: true,
      reason: `振込依頼人コードが完全一致: "${partnerCode}"`,
    };
  }

  return { score: 0, matched: false, reason: "" };
}

// ─────────────────────────────────────────────
// 名前スコア計算
// ─────────────────────────────────────────────

interface NameScoreResult {
  score: number;
  reason: string;
  matchedAlias?: string;
}

function computeNameScore(
  normalizedSender: string,
  partner: TradingPartnerForMatching
): NameScoreResult {
  const candidates: { name: string; isAlias: boolean }[] = [
    { name: partner.name, isAlias: false },
    ...partner.trading_partner_aliases.map((a) => ({
      name: a.alias_name,
      isAlias: true,
    })),
  ];

  let bestScore = 0;
  let bestReason = "";
  let bestMatchedAlias: string | undefined;

  for (const { name, isAlias } of candidates) {
    const normalizedName = normalizeJapaneseName(name);
    if (!normalizedName) continue;

    let score = 0;
    let reason = "";

    if (normalizedSender === normalizedName) {
      score = 75;
      reason = `振込名義が完全一致: "${name}"`;
    } else if (
      normalizedSender.includes(normalizedName) ||
      normalizedName.includes(normalizedSender)
    ) {
      score = 50;
      reason = `振込名義が部分一致: "${name}"`;
    } else {
      const sim = stringSimilarity(normalizedSender, normalizedName);
      if (sim >= 0.8) {
        score = 35;
        reason = `振込名義が高類似度マッチ: "${name}" (${Math.round(sim * 100)}%)`;
      } else if (sim >= 0.6) {
        score = 20;
        reason = `振込名義が類似: "${name}" (${Math.round(sim * 100)}%)`;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestReason = reason;
      bestMatchedAlias = isAlias ? name : undefined;
    }
  }

  return { score: bestScore, reason: bestReason, matchedAlias: bestMatchedAlias };
}

// ─────────────────────────────────────────────
// メインのマッチング関数
// ─────────────────────────────────────────────

/**
 * 1件の入金明細に対して取引先マスタ全体とマッチングし、
 * スコア降順の候補リストを返す。
 *
 * スコアリング優先順位:
 *   1. 振込依頼人コードの完全一致（+50点 + confidence 強制 "high" 昇格）
 *   2. 振込名義の類似度（最大 +75点）
 *   3. 口座番号下4桁の一致（+20点）
 *
 * 振込依頼人コードが未登録の場合は従来通り名義中心マッチングが機能する。
 */
export function computeMatches(
  transaction: TransactionInput,
  partners: TradingPartnerForMatching[]
): MatchCandidate[] {
  const normalizedSender = normalizeJapaneseName(transaction.senderName);
  const results: MatchCandidate[] = [];

  for (const partner of partners) {
    const reasons: string[] = [];
    let totalScore = 0;
    let codeMatched = false;

    // ── 1. 振込依頼人コードマッチ（最優先、+50点） ──
    const codeScore = computeRemittanceCodeScore(
      transaction.remittanceCode,
      partner.remittance_code
    );
    if (codeScore.matched) {
      totalScore += codeScore.score;
      reasons.push(codeScore.reason);
      codeMatched = true;
    }

    // ── 2. 振込名義スコア（最大 75点） ──────────────
    const nameScore = computeNameScore(normalizedSender, partner);
    if (nameScore.score > 0) {
      totalScore += nameScore.score;
      reasons.push(nameScore.reason);
    }

    // ── 3. 口座番号下4桁マッチ（+20点） ─────────────
    if (transaction.accountLast4 && partner.account_number_last4) {
      if (transaction.accountLast4 === partner.account_number_last4) {
        totalScore += 20;
        reasons.push(`口座番号下4桁が一致: ****${transaction.accountLast4}`);
      }
    }

    // ── 4. 将来: 金額マッチ（+10点）── TODO ──────────
    // 請求書テーブル実装後に追加予定

    if (totalScore > 0) {
      const cappedScore = Math.min(totalScore, 100);

      // 振込依頼人コードが一致した場合は confidence を "high" に強制昇格
      // （名義の表記ゆれで名義スコアが低くても優先的にマッチングするため）
      const confidence: MatchConfidence = codeMatched
        ? "high"
        : cappedScore >= 70
        ? "high"
        : cappedScore >= 40
        ? "medium"
        : "low";

      results.push({
        tradingPartnerId: partner.id,
        tradingPartnerName: partner.name,
        score: cappedScore,
        confidence,
        reasons,
        matchedAlias: nameScore.matchedAlias,
        remittanceCodeMatched: codeMatched || undefined,
      });
    }
  }

  // スコア降順でソート。同スコアの場合はコード一致を優先
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 同スコアならコードマッチを上位に
    if (a.remittanceCodeMatched && !b.remittanceCodeMatched) return -1;
    if (!a.remittanceCodeMatched && b.remittanceCodeMatched) return 1;
    return 0;
  });
}

// ─────────────────────────────────────────────
// ユーティリティ: 信頼度ラベル・カラー
// ─────────────────────────────────────────────

export const CONFIDENCE_LABEL: Record<MatchConfidence, string> = {
  high:   "高信頼度",
  medium: "中信頼度",
  low:    "低信頼度",
};

export const CONFIDENCE_COLOR: Record<MatchConfidence, string> = {
  high:   "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low:    "bg-slate-100 text-slate-600 border-slate-200",
};
