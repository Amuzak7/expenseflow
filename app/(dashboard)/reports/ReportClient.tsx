"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Banknote,
  Receipt,
  AlertTriangle,
  Clock,
  CheckCircle2,
  FileDown,
  CalendarDays,
  ArrowRightLeft,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import type { MonthlyReportData } from "./actions";
import { DatePicker } from "@/components/ui/date-picker";

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

const yen = (n: number) =>
  "¥" + n.toLocaleString("ja-JP");

const pct = (n: number) =>
  n.toFixed(1) + "%";

function formatMonth(year: number, month: number) {
  return `${year}年${month}月`;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ReportClientProps {
  year:  number;
  month: number;
  data:  MonthlyReportData | null;
}

// ─────────────────────────────────────────────
// サブコンポーネント：サマリーカード
// ─────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
  valueColor,
}: {
  label:      string;
  value:      string;
  sub?:       string;
  icon:       React.ComponentType<{ className?: string }>;
  iconBg:     string;
  iconColor:  string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 print:border print:shadow-none print:rounded-lg">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </div>
      <p className={cn("text-2xl font-bold tabular-nums", valueColor ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// サブコンポーネント：セクションタイトル
// ─────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
      {children}
    </h2>
  );
}

// ─────────────────────────────────────────────
// サブコンポーネント：テーブル行
// ─────────────────────────────────────────────

function DataRow({
  label,
  count,
  amount,
  highlight,
}: {
  label:      string;
  count:      number;
  amount:     number;
  highlight?: "green" | "red" | "amber";
}) {
  const cls = {
    green: "text-green-600 dark:text-green-400",
    red:   "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className={cn("py-2.5 px-4 text-sm", highlight ? cls[highlight] : "text-foreground")}>
        {label}
      </td>
      <td className={cn("py-2.5 px-4 text-sm text-right tabular-nums", highlight ? cls[highlight] : "text-muted-foreground")}>
        {count.toLocaleString()}件
      </td>
      <td className={cn("py-2.5 px-4 text-sm text-right tabular-nums font-medium", highlight ? cls[highlight] : "text-foreground")}>
        {yen(amount)}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────
// エクスポートセクション
// ─────────────────────────────────────────────

type ExportType   = "incoming-plans" | "bank-transactions" | "expenses";
type ExportFormat = "csv" | "xlsx";

function ExportSection({ year, month }: { year: number; month: number }) {
  const mm = String(month).padStart(2, "0");
  const defaultFrom = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const defaultTo = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`;

  const [exportType,   setExportType]   = useState<ExportType>("incoming-plans");
  const [format,       setFormat]       = useState<ExportFormat>("xlsx");
  const [dateFrom,     setDateFrom]     = useState(defaultFrom);
  const [dateTo,       setDateTo]       = useState(defaultTo);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading,      setLoading]      = useState(false);

  const STATUS_OPTIONS: Record<ExportType, Array<{ value: string; label: string }>> = {
    "incoming-plans": [
      { value: "all",      label: "すべて" },
      { value: "pending",  label: "未入金" },
      { value: "delayed",  label: "遅延" },
      { value: "received", label: "入金済み" },
      { value: "cancelled",label: "キャンセル" },
    ],
    "bank-transactions": [
      { value: "all",      label: "すべて" },
      { value: "unmatched",label: "未確認" },
      { value: "matched",  label: "確認済み" },
      { value: "ignored",  label: "無視" },
    ],
    "expenses": [
      { value: "all",       label: "すべて" },
      { value: "submitted", label: "承認待ち" },
      { value: "approved",  label: "承認済み" },
      { value: "paid",      label: "支払済み" },
      { value: "rejected",  label: "却下" },
      { value: "returned",  label: "差し戻し" },
    ],
  };

  const TYPE_LABELS: Record<ExportType, string> = {
    "incoming-plans":    "入金予定データ",
    "bank-transactions": "入金確認データ（実績）",
    "expenses":          "経費精算データ",
  };

  const handleDownload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type:   exportType,
        format,
        dateFrom,
        dateTo,
        ...(statusFilter !== "all" && { status: statusFilter }),
      });
      const res  = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "エラーが発生しました" }));
        alert(err.error ?? "ダウンロードに失敗しました");
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${TYPE_LABELS[exportType]}_${dateFrom}_${dateTo}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  };

  const SELECT_CLS =
    "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-ring/30 transition-colors";

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4 print:hidden">
      <div className="flex items-center gap-2">
        <FileDown className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">データエクスポート</h2>
      </div>

      {/* ── Row 1: 対象 / 開始日 / 終了日 / ステータス ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* エクスポート対象 */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">エクスポート対象</label>
          <select
            value={exportType}
            onChange={(e) => {
              setExportType(e.target.value as ExportType);
              setStatusFilter("all");
            }}
            className={SELECT_CLS}
          >
            <option value="incoming-plans">入金予定データ</option>
            <option value="bank-transactions">入金確認データ（実績）</option>
            <option value="expenses">経費精算データ</option>
          </select>
        </div>

        {/* 開始日 */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">開始日</label>
          <DatePicker
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="開始日を選択"
            disabled={loading}
          />
        </div>

        {/* 終了日 */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">終了日</label>
          <DatePicker
            value={dateTo}
            onChange={setDateTo}
            placeholder="終了日を選択"
            disabled={loading}
          />
        </div>

        {/* ステータス */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">ステータス</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={SELECT_CLS}
          >
            {STATUS_OPTIONS[exportType].map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Row 2: 出力形式 + ダウンロード ──────── */}
      <div className="flex items-end justify-between gap-3">
        {/* 出力形式トグル */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">出力形式</label>
          <div className="flex rounded-md border border-input overflow-hidden">
            {(["xlsx", "csv"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={cn(
                  "px-4 py-1.5 text-xs font-medium transition-colors",
                  format === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ダウンロードボタン */}
        <button
          type="button"
          onClick={handleDownload}
          disabled={loading || !dateFrom || !dateTo}
          className={cn(
            "flex items-center gap-2 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Download className="h-3.5 w-3.5" />
          {loading ? "ダウンロード中..." : "ダウンロード"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function ReportClient({ year, month, data }: ReportClientProps) {
  const router   = useRouter();
  const now      = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;
  const isFuture =
    year > now.getFullYear() ||
    (year === now.getFullYear() && month > now.getMonth() + 1);

  const goToMonth = (y: number, m: number) => {
    router.push(`/reports?year=${y}&month=${m}`);
  };
  const goPrev = () => {
    const d = new Date(year, month - 2);
    goToMonth(d.getFullYear(), d.getMonth() + 1);
  };
  const goNext = () => {
    const d = new Date(year, month);
    goToMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const d = data;

  // 差額計算
  const gap = d ? d.incoming.receivedAmount - d.incoming.totalAmount : 0;
  const GapIcon = gap >= 0 ? TrendingUp : TrendingDown;
  const gapColor = gap >= 0 ? "text-green-600" : "text-red-600";

  return (
    <>
      {/* ── 印刷ヘッダー（画面では非表示） ─────── */}
      <div className="hidden print:block mb-6">
        <div className="flex items-start justify-between border-b pb-4 mb-1">
          <div>
            <p className="text-xl font-bold text-foreground">月次レポート</p>
            <p className="text-base font-semibold text-muted-foreground mt-0.5">
              {formatMonth(year, month)} — {d?.companyName}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>ExpenseFlow</p>
            <p>作成日: {new Date().toLocaleDateString("ja-JP")}</p>
          </div>
        </div>
      </div>

      {/* ── 操作バー（印刷では非表示） ──────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        {/* 月選択 */}
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            aria-label="前月"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-md border border-border bg-card min-w-[140px] justify-center">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              {formatMonth(year, month)}
            </span>
          </div>
          <button
            onClick={goNext}
            disabled={isCurrentMonth || isFuture}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="翌月"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => goToMonth(now.getFullYear(), now.getMonth() + 1)}
              className="ml-2 text-xs text-primary hover:underline"
            >
              今月に戻る
            </button>
          )}
        </div>

        {/* 操作ボタン */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            印刷 / PDF
          </button>
        </div>
      </div>

      {/* ── データなし ───────────────────────────── */}
      {!d && (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center rounded-xl border border-dashed border-border">
          <CalendarDays className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            {formatMonth(year, month)} のデータを取得できませんでした
          </p>
        </div>
      )}

      {d && (
        <>
          {/* ── KPI サマリーカード ────────────────── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard
              label="入金予定額"
              value={yen(d.incoming.totalAmount)}
              sub={`${d.incoming.totalCount}件`}
              icon={Banknote}
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
            />
            <SummaryCard
              label="入金実績額"
              value={yen(d.incoming.receivedAmount)}
              sub={`入金率 ${pct(d.incoming.receiveRate)}`}
              icon={CheckCircle2}
              iconBg="bg-green-100 dark:bg-green-900/30"
              iconColor="text-green-600 dark:text-green-400"
              valueColor="text-green-600 dark:text-green-400"
            />
            <SummaryCard
              label="差額（実績−予定）"
              value={yen(Math.abs(gap))}
              sub={gap >= 0 ? "予定を上回っています" : "未入金分があります"}
              icon={gap === 0 ? Minus : GapIcon}
              iconBg={gap < 0 ? "bg-red-100 dark:bg-red-900/30" : "bg-green-100 dark:bg-green-900/30"}
              iconColor={gap < 0 ? "text-red-600" : "text-green-600"}
              valueColor={gap < 0 ? "text-red-600 dark:text-red-400" : undefined}
            />
            <SummaryCard
              label="経費合計（承認済み）"
              value={yen(d.expenses.approvedAmount)}
              sub={`${d.expenses.approvedCount}件`}
              icon={Receipt}
              iconBg="bg-purple-100 dark:bg-purple-900/30"
              iconColor="text-purple-600 dark:text-purple-400"
            />
          </div>

          {/* ── 2カラム：入金状況 + 経費内訳 ──────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* 入金状況 */}
            <div className="rounded-xl border border-border bg-card overflow-hidden print:border print:shadow-none">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <SectionTitle>
                  <Banknote className="h-3.5 w-3.5" />
                  入金状況
                </SectionTitle>
                <p className="text-xs text-muted-foreground -mt-1">
                  {formatMonth(year, month)} の入金予定ベース
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30">
                    <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">ステータス</th>
                    <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">件数</th>
                    <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">金額</th>
                  </tr>
                </thead>
                <tbody>
                  <DataRow label="入金済み"   count={d.incoming.receivedCount} amount={d.incoming.receivedAmount} highlight="green" />
                  <DataRow label="未入金（期日前）" count={d.incoming.pendingCount}  amount={d.incoming.pendingAmount} />
                  <DataRow label="遅延（督促が必要）" count={d.incoming.delayedCount}  amount={d.incoming.delayedAmount}  highlight="red" />
                  <tr className="bg-muted/20">
                    <td className="py-2.5 px-4 text-sm font-semibold text-foreground">合計（キャンセル除く）</td>
                    <td className="py-2.5 px-4 text-sm text-right tabular-nums font-semibold text-foreground">{d.incoming.totalCount.toLocaleString()}件</td>
                    <td className="py-2.5 px-4 text-sm text-right tabular-nums font-bold text-foreground">{yen(d.incoming.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>

              {/* 入金率バー */}
              <div className="px-4 py-3 border-t border-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">入金率</span>
                  <span className={cn(
                    "text-xs font-bold",
                    d.incoming.receiveRate >= 80 ? "text-green-600" :
                    d.incoming.receiveRate >= 50 ? "text-amber-600" : "text-red-600"
                  )}>
                    {pct(d.incoming.receiveRate)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      d.incoming.receiveRate >= 80 ? "bg-green-500" :
                      d.incoming.receiveRate >= 50 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${Math.min(100, d.incoming.receiveRate)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 経費内訳 */}
            <div className="rounded-xl border border-border bg-card overflow-hidden print:border print:shadow-none">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <SectionTitle>
                  <Receipt className="h-3.5 w-3.5" />
                  経費内訳（科目別）
                </SectionTitle>
                <p className="text-xs text-muted-foreground -mt-1">
                  {formatMonth(year, month)} の承認済み・支払済み経費
                </p>
              </div>

              {d.expenses.categoryBreakdown.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Receipt className="h-8 w-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">この月の承認済み経費はありません</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30">
                      <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">科目</th>
                      <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">件数</th>
                      <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.expenses.categoryBreakdown.map(({ category, count, amount }) => (
                      <DataRow key={category} label={category} count={count} amount={amount} />
                    ))}
                    <tr className="bg-muted/20">
                      <td className="py-2.5 px-4 text-sm font-semibold text-foreground">合計</td>
                      <td className="py-2.5 px-4 text-sm text-right tabular-nums font-semibold text-foreground">{d.expenses.approvedCount.toLocaleString()}件</td>
                      <td className="py-2.5 px-4 text-sm text-right tabular-nums font-bold text-foreground">{yen(d.expenses.approvedAmount)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* 現在の承認待ち */}
              {d.expenses.currentPending > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-amber-50/50 dark:bg-amber-900/10">
                  <Clock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    現在 <span className="font-bold">{d.expenses.currentPending}件</span> の経費申請が承認待ちです
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── 実績入金（銀行明細ベース） ──────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden print:border print:shadow-none">
            <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-2">
              <div>
                <SectionTitle>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  実績入金（銀行明細ベース）
                </SectionTitle>
                <p className="text-xs text-muted-foreground -mt-1">
                  {formatMonth(year, month)} に着金した取引（transaction_date ベース）
                </p>
              </div>
              {d.actualIncoming.unmatchedCount > 0 && (
                <Link
                  href="/incoming-payments"
                  className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 font-medium shrink-0 mt-0.5 print:hidden"
                >
                  入金確認へ
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>

            <table className="w-full">
              <thead>
                <tr className="bg-muted/30">
                  <th className="py-2 px-4 text-left text-xs font-medium text-muted-foreground">区分</th>
                  <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">件数</th>
                  <th className="py-2 px-4 text-right text-xs font-medium text-muted-foreground">金額</th>
                </tr>
              </thead>
              <tbody>
                <DataRow
                  label="確認済み（入金予定と照合済み）"
                  count={d.actualIncoming.matchedCount}
                  amount={d.actualIncoming.matchedAmount}
                  highlight="green"
                />
                <DataRow
                  label="未確認（照合されていない入金）"
                  count={d.actualIncoming.unmatchedCount}
                  amount={d.actualIncoming.unmatchedAmount}
                  highlight={d.actualIncoming.unmatchedCount > 0 ? "amber" : undefined}
                />
                <tr className="bg-muted/20">
                  <td className="py-2.5 px-4 text-sm font-semibold text-foreground">合計</td>
                  <td className="py-2.5 px-4 text-sm text-right tabular-nums font-semibold text-foreground">{d.actualIncoming.totalCount.toLocaleString()}件</td>
                  <td className="py-2.5 px-4 text-sm text-right tabular-nums font-bold text-foreground">{yen(d.actualIncoming.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            {/* 予定ベースとの比較メモ */}
            <div className="px-4 py-3 border-t border-border bg-muted/10 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs text-muted-foreground">
                入金予定ベース（照合済み）: <span className="font-medium text-foreground">{yen(d.incoming.receivedAmount)}</span>
              </span>
              <span className="text-xs text-muted-foreground hidden lg:inline">·</span>
              <span className="text-xs text-muted-foreground">
                銀行明細ベース（実着金）: <span className="font-medium text-foreground">{yen(d.actualIncoming.totalAmount)}</span>
              </span>
              {d.actualIncoming.unmatchedCount > 0 && (
                <span className="text-xs text-amber-600 font-medium">
                  ⚠ 未確認 {d.actualIncoming.unmatchedCount}件 が入金予定に未紐づけです
                </span>
              )}
            </div>

            {d.actualIncoming.totalCount === 0 && (
              <div className="flex flex-col items-center gap-2 py-8 text-center border-t border-border">
                <ArrowRightLeft className="h-8 w-8 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">この月の銀行取引データがありません</p>
                <Link href="/incoming-payments" className="text-xs text-sky-500 hover:underline print:hidden">
                  入金確認画面からCSVをアップロード
                </Link>
              </div>
            )}
          </div>

          {/* ── 遅延アラート（遅延あり時のみ） ─────── */}
          {d.incoming.delayedCount > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 px-4 py-3 print:border-red-300">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-700 dark:text-red-400">
                  入金遅延アラート
                </p>
                <p className="text-red-600/80 dark:text-red-400/80 mt-0.5">
                  {formatMonth(year, month)} に <strong>{d.incoming.delayedCount}件</strong>（合計 <strong>{yen(d.incoming.delayedAmount)}</strong>）の入金遅延があります。
                  入金予定画面から取引先への督促を行ってください。
                </p>
              </div>
            </div>
          )}

          {/* ── エクスポートセクション ───────────── */}
          <ExportSection year={year} month={month} />
        </>
      )}
    </>
  );
}
