"use client";

import React, { useState, useMemo, useTransition, useEffect } from "react";
import {
  CalendarClock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  HelpCircle,
  RefreshCw,
  UserCheck,
  Calendar,
  User,
  Undo2,
  AlertTriangle,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import {
  confirmMatch,
  ignoreTransaction,
  revertTransaction,
  batchConfirmMatches,
  type MatchedTransaction,
  type StoredTransaction,
  type PlanMatchInfo,
  type BatchConfirmItem,
} from "@/app/(dashboard)/incoming-payments/actions";
import ManualMatchModal from "@/app/(dashboard)/incoming-payments/ManualMatchModal";
import BatchConfirmBar from "@/components/incoming-payments/BatchConfirmBar";
import { CONFIDENCE_LABEL, CONFIDENCE_COLOR } from "@/lib/matching";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// ページネーション定数・ユーティリティ
// ─────────────────────────────────────────────

const PAGE_SIZE = 20;

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];
  const left = current - 2;
  const right = current + 2;

  if (left > 2) pages.push("...");
  for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) {
    pages.push(i);
  }
  if (right < total - 1) pages.push("...");
  if (total > 1) pages.push(total);

  return pages;
}

function PaginationBar({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-2 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors border border-border",
          "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        前へ
      </button>

      {pages.map((page, idx) =>
        page === "..." ? (
          <span
            key={`ellipsis-${idx}`}
            className="px-2 py-1.5 text-sm text-muted-foreground select-none"
          >
            ...
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={cn(
              "w-9 h-9 rounded-md text-sm transition-colors",
              page === currentPage
                ? "bg-primary text-primary-foreground font-semibold"
                : "border border-border hover:bg-muted text-foreground"
            )}
          >
            {page}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors border border-border",
          "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        次へ
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

type AnyTransaction = MatchedTransaction | StoredTransaction;

interface MatchingResultListProps {
  transactions: AnyTransaction[];
  /** 見出しラベル（省略時は「マッチング結果」） */
  title?: string;
  /** 確定・無視操作の後にページをリフレッシュするか（DBデータ表示時はtrue） */
  refreshOnAction?: boolean;
  /**
   * 操作完了後に呼び出されるコールバック。
   * 指定時は refreshOnAction より優先される。
   * 親が現在のフィルター条件で再取得する場合に使用。
   */
  onRefresh?: () => void;
}

// ─────────────────────────────────────────────
// フォーマットユーティリティ
// ─────────────────────────────────────────────

function formatAmount(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ─────────────────────────────────────────────
// 1件分のトランザクションカード
// ─────────────────────────────────────────────

interface TransactionCardProps {
  transaction: AnyTransaction;
  onConfirm: (txId: string, matchId: string) => Promise<void>;
  onIgnore: (txId: string) => Promise<void>;
  onManualMatch: (txId: string) => void;
  onRevert: (txId: string) => Promise<void>;
  isActing: boolean;
  // ── バッチ選択 ──────────────────────────────
  /** チェックボックスを表示するか（高信頼度・未確定のみ true） */
  isSelectable?: boolean;
  /** 現在選択されているか */
  isSelected?: boolean;
  /** チェックボックスの状態を切り替えるコールバック */
  onToggleSelect?: () => void;
}

function TransactionCard({
  transaction: tx,
  onConfirm,
  onIgnore,
  onManualMatch,
  onRevert,
  isActing,
  isSelectable = false,
  isSelected = false,
  onToggleSelect,
}: TransactionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState<string>(
    tx.matches.find((m) => m.isTopMatch)?.matchId ??
      tx.matches[0]?.matchId ??
      ""
  );
  const [showManualModal, setShowManualModal] = useState(false);
  /** インライン確認ダイアログ（未確認に戻す） */
  const [confirmingRevert, setConfirmingRevert] = useState(false);
  /** 操作履歴の開閉状態 */
  const [showHistory, setShowHistory] = useState(false);
  /**
   * 手動マッチング後の楽観的 UI 状態
   * null = 手動マッチング未実施 or DB由来の状態
   * { partnerName } = 手動マッチングで確定済み（ページリフレッシュ前の一時表示）
   */
  const [manualConfirm, setManualConfirm] = useState<{
    partnerName: string;
  } | null>(null);

  const topMatch =
    tx.matches.find((m) => m.matchId === selectedMatchId) ?? tx.matches[0];
  const otherMatches = tx.matches.filter((m) => m.matchId !== selectedMatchId);

  // DB から確定済みマッチを探して手動マッチかどうか確認
  const confirmedDbMatch = tx.matches.find((m) => m.matchStatus === "confirmed");
  const isDbManualMatch = confirmedDbMatch?.isManual === true;

  // 楽観的 UI を考慮した実効状態
  const isConfirmed = tx.status === "matched" || manualConfirm !== null;
  const isIgnored = tx.status === "ignored";
  const isManualMatch = isDbManualMatch || manualConfirm !== null;

  // 「手動で取引先を選択」ボタン: 候補なし or 低信頼度のみ
  const showManualMatchButton =
    !isConfirmed &&
    !isIgnored &&
    (tx.matches.length === 0 || topMatch?.confidence === "low");

  // 確定済み時に表示する取引先名
  const confirmedPartnerName =
    manualConfirm?.partnerName ??
    confirmedDbMatch?.tradingPartnerName ??
    topMatch?.tradingPartnerName;

  // DB由来の監査情報（StoredTransaction のみ保持）
  const processedAt     = "processedAt"     in tx ? (tx as StoredTransaction).processedAt     : null;
  const processedByName = "processedByName" in tx ? (tx as StoredTransaction).processedByName : null;
  const auditLogs       = "auditLogs"       in tx ? (tx as StoredTransaction).auditLogs       : [];
  const planMatch: PlanMatchInfo | null = "planMatch" in tx ? (tx as StoredTransaction).planMatch : null;

  return (
    <>
      <div
        className={cn(
          "rounded-xl border p-4 space-y-3 transition-all duration-200",
          // 選択中: プライマリカラーのリング
          isSelected && "border-primary/40 ring-2 ring-primary/20 bg-primary/[0.02]",
          // 選択中でない場合はステータスでスタイル決定
          !isSelected && isConfirmed && "border-green-200 bg-green-50/30",
          !isSelected && isIgnored && "border-border bg-muted/20 opacity-60",
          !isSelected &&
            !isConfirmed &&
            !isIgnored &&
            "border-border bg-card hover:border-border/80"
        )}
      >
        {/* ── ヘッダー行 ─────────────────────────── */}
        <div className="flex items-start gap-3">
          {/* チェックボックス（高信頼度・未確定のみ表示） */}
          {isSelectable && (
            <div className="pt-0.5 flex-shrink-0">
              <Checkbox
                checked={isSelected}
                onCheckedChange={onToggleSelect}
                disabled={isActing}
                aria-label={`${tx.senderName} を選択`}
              />
            </div>
          )}

          {/* カードヘッダー本体 */}
          <div className="flex-1 flex flex-wrap items-start justify-between gap-2 min-w-0">
            {/* 左: 取引情報 */}
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(tx.transactionDate)}
              </span>
              <span className="font-mono font-semibold text-foreground">
                {formatAmount(tx.amount)}
              </span>
              <span
                className="text-sm text-foreground truncate max-w-[200px]"
                title={tx.senderName}
              >
                {tx.senderName}
              </span>
              {tx.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[150px] hidden sm:block">
                  {tx.description}
                </span>
              )}
            </div>

            {/* 右: ステータスバッジ */}
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
              {isConfirmed && (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  確定済み
                </Badge>
              )}
              {/* 手動マッチバッジ（手動確定時のみ） */}
              {isManualMatch && (
                <Badge
                  variant="outline"
                  className="text-xs text-primary border-primary/30 bg-primary/5"
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  手動マッチ
                </Badge>
              )}
              {isIgnored && (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  無視
                </Badge>
              )}
              {!isConfirmed && !isIgnored && tx.matches.length === 0 && (
                <Badge
                  variant="outline"
                  className="text-xs text-muted-foreground"
                >
                  候補なし
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* ── 確定済みの取引先表示（楽観的 UI / DB由来） ── */}
        {isConfirmed && confirmedPartnerName && (
          <div className="flex items-center gap-2 rounded-lg bg-green-50/50 border border-green-100 px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <span className="text-xs text-muted-foreground">確定先:</span>
            <span className="text-sm font-medium text-foreground">
              {confirmedPartnerName}
            </span>
          </div>
        )}

        {/* ── 入金予定との紐づけ & 差額表示（確定済みかつ planMatch あり） ── */}
        {isConfirmed && planMatch && (
          <div className="rounded-lg bg-sky-50/50 border border-sky-100 px-3 py-2 space-y-1.5">
            {/* 予定情報行 */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
              <span className="flex items-center gap-1 text-sky-600 font-medium">
                <CalendarClock className="h-3.5 w-3.5 flex-shrink-0" />
                入金予定
              </span>
              <span className="text-muted-foreground">
                {formatDate(planMatch.plannedDate)}
              </span>
              <span className="font-mono text-foreground">
                ¥{planMatch.plannedAmount.toLocaleString("ja-JP")}
              </span>
              {planMatch.matchType === "manual" && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-4 px-1 py-0 text-sky-600 border-sky-200 bg-sky-50/80"
                >
                  手動
                </Badge>
              )}
            </div>
            {/* 差額行 */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">差額:</span>
              <span
                className={cn(
                  "font-mono font-semibold",
                  planMatch.difference === 0
                    ? "text-green-600"
                    : planMatch.difference > 0
                      ? "text-blue-600"
                      : "text-red-500"
                )}
              >
                {planMatch.difference === 0
                  ? "±¥0（完全一致）"
                  : planMatch.difference > 0
                    ? `+¥${planMatch.difference.toLocaleString("ja-JP")}（過払い）`
                    : `-¥${Math.abs(planMatch.difference).toLocaleString("ja-JP")}（不足）`}
              </span>
              {planMatch.difference !== 0 && (
                <span className="text-muted-foreground">
                  残額:
                  <span className="font-mono ml-1">
                    ¥{Math.max(0, planMatch.plannedAmount - planMatch.matchedAmount).toLocaleString("ja-JP")}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── 処理日時・担当者（DB由来のデータのみ） ── */}
        {(isConfirmed || isIgnored) && (processedAt || processedByName) && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
            {processedAt && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 flex-shrink-0" />
                {new Intl.DateTimeFormat("ja-JP", {
                  year: "numeric", month: "short", day: "numeric",
                  hour: "2-digit", minute: "2-digit",
                }).format(new Date(processedAt))}
              </span>
            )}
            {processedByName && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3 flex-shrink-0" />
                {processedByName}
              </span>
            )}
          </div>
        )}

        {/* ── マッチ候補（未確定のみ表示） ─────────── */}
        {tx.matches.length > 0 && !isIgnored && !isConfirmed && (
          <div className="space-y-2">
            {/* トップ候補（選択中） */}
            {topMatch && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">候補:</span>
                <span className="text-sm font-medium text-foreground">
                  {topMatch.tradingPartnerName}
                </span>
                <Badge
                  className={cn(
                    "text-xs border",
                    CONFIDENCE_COLOR[topMatch.confidence]
                  )}
                >
                  {CONFIDENCE_LABEL[topMatch.confidence]} {topMatch.score}/100
                </Badge>

                {/* マッチング根拠 tooltip */}
                {topMatch.reasons.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button className="text-muted-foreground hover:text-foreground transition-colors" />
                      }
                    >
                      <HelpCircle className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <ul className="space-y-1 text-xs">
                        {topMatch.reasons.map((r, i) => (
                          <li key={i}>・{r}</li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}

            {/* 代替候補（展開表示） */}
            {otherMatches.length > 0 && (
              <div>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expanded ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  他の候補 ({otherMatches.length}件)
                </button>
                {expanded && (
                  <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-border">
                    {otherMatches.map((m) => (
                      <button
                        key={m.matchId}
                        onClick={() => setSelectedMatchId(m.matchId)}
                        className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm text-foreground flex-1">
                          {m.tradingPartnerName}
                        </span>
                        <Badge
                          className={cn(
                            "text-xs border flex-shrink-0",
                            CONFIDENCE_COLOR[m.confidence]
                          )}
                        >
                          {m.score}/100
                        </Badge>
                        <RefreshCw className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 候補なしメッセージ */}
        {tx.matches.length === 0 && !isIgnored && !isConfirmed && (
          <p className="text-xs text-muted-foreground">
            取引先マスタに一致する候補が見つかりませんでした。
            取引先を先に登録してから再試行することをおすすめします。
          </p>
        )}

        {/* ── アクションボタン ────────────────────── */}
        {!isConfirmed && !isIgnored && (
          <div className="flex flex-wrap gap-2 pt-1">
            {/* AI候補を確定 */}
            {topMatch && (
              <Button
                size="sm"
                className="h-7 text-xs bg-primary hover:bg-primary/90"
                disabled={isActing}
                onClick={() => onConfirm(tx.id, selectedMatchId)}
              >
                {isActing ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                確定
              </Button>
            )}

            {/* 手動で取引先を選択（候補なし or 低信頼度のとき表示） */}
            {showManualMatchButton && (
              <Button
                size="sm"
                variant={tx.matches.length === 0 ? "default" : "outline"}
                className={cn(
                  "h-7 text-xs",
                  tx.matches.length === 0
                    ? "bg-primary hover:bg-primary/90"
                    : "border-primary/40 text-primary hover:bg-primary/5"
                )}
                disabled={isActing}
                onClick={() => setShowManualModal(true)}
              >
                <UserCheck className="h-3 w-3 mr-1" />
                手動で取引先を選択
              </Button>
            )}

            {/* 無視 */}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
              disabled={isActing}
              onClick={() => onIgnore(tx.id)}
            >
              <XCircle className="h-3 w-3 mr-1" />
              無視
            </Button>
          </div>
        )}

        {/* ── 未確認に戻す（確定済み・無視済みのみ表示） ─ */}
        {(isConfirmed || isIgnored) && (
          <div className="pt-1">
            {confirmingRevert ? (
              /* インライン確認プロンプト */
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/50 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                <span className="text-xs text-orange-700 flex-1">
                  本当に未確認に戻しますか？
                </span>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    disabled={isActing}
                    onClick={() => setConfirmingRevert(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                    disabled={isActing}
                    onClick={async () => {
                      setConfirmingRevert(false);
                      await onRevert(tx.id);
                    }}
                  >
                    {isActing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "戻す"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground hover:text-orange-600"
                disabled={isActing}
                onClick={() => setConfirmingRevert(true)}
              >
                <Undo2 className="h-3 w-3 mr-1" />
                未確認に戻す
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── 操作履歴（監査ログ） ───────────────────── */}
      {auditLogs.length > 0 && (
        <div className="pt-1 border-b border-border pb-2">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History className="h-3 w-3" />
            操作履歴 ({auditLogs.length}件)
            {showHistory ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-0 pl-1">
              {auditLogs.map((log, idx) => {
                const isLast = idx === auditLogs.length - 1;
                const config: Record<
                  string,
                  { label: string; color: string; icon: React.ReactNode }
                > = {
                  confirmed: {
                    label: "確定",
                    color: "text-green-600",
                    icon: <CheckCircle2 className="h-3 w-3 text-green-500" />,
                  },
                  batch_confirmed: {
                    label: "一括確定",
                    color: "text-green-600",
                    icon: <CheckCircle2 className="h-3 w-3 text-green-500" />,
                  },
                  manual_matched: {
                    label: "手動確定",
                    color: "text-primary",
                    icon: <UserCheck className="h-3 w-3 text-primary" />,
                  },
                  ignored: {
                    label: "無視",
                    color: "text-muted-foreground",
                    icon: <XCircle className="h-3 w-3 text-muted-foreground" />,
                  },
                  reverted: {
                    label: "未確認に戻す",
                    color: "text-orange-600",
                    icon: <Undo2 className="h-3 w-3 text-orange-500" />,
                  },
                };
                const c = config[log.action] ?? {
                  label: log.action,
                  color: "text-muted-foreground",
                  icon: <History className="h-3 w-3 text-muted-foreground" />,
                };
                return (
                  <div key={log.id} className="flex gap-2.5">
                    {/* タイムラインライン */}
                    <div className="flex flex-col items-center flex-shrink-0 pt-1">
                      <div className="flex items-center justify-center w-5 h-5 rounded-full bg-muted/60">
                        {c.icon}
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 bg-border my-0.5 min-h-[8px]" />
                      )}
                    </div>
                    {/* コンテンツ */}
                    <div className={cn("pb-2 min-w-0", isLast && "pb-0")}>
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className={cn("text-xs font-medium", c.color)}>
                          {c.label}
                        </span>
                        {log.tradingPartnerName && (
                          <span className="text-xs text-foreground">
                            — {log.tradingPartnerName}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-2.5 w-2.5 flex-shrink-0" />
                          {new Intl.DateTimeFormat("ja-JP", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(log.performedAt))}
                        </span>
                        {log.performedByName && (
                          <span className="flex items-center gap-1">
                            <User className="h-2.5 w-2.5 flex-shrink-0" />
                            {log.performedByName}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── 手動マッチングモーダル ──────────────────── */}
      <ManualMatchModal
        open={showManualModal}
        onClose={() => setShowManualModal(false)}
        transaction={{
          id: tx.id,
          transactionDate: tx.transactionDate,
          amount: tx.amount,
          senderName: tx.senderName,
          description: tx.description,
        }}
        onConfirmed={(partnerName) => {
          setManualConfirm({ partnerName });
          onManualMatch(tx.id);
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function MatchingResultList({
  transactions,
  title = "マッチング結果",
  refreshOnAction = false,
  onRefresh,
}: MatchingResultListProps) {
  const router = useRouter();

  const doRefresh = () => {
    if (onRefresh) onRefresh();
    else if (refreshOnAction) router.refresh();
  };

  // ── 単体操作用トランジション ──────────────────
  const [isPending, startTransition] = useTransition();
  const [actingId, setActingId] = useState<string | null>(null);

  // ── バッチ操作用トランジション ────────────────
  const [isBatchPending, startBatchTransition] = useTransition();

  // ── 選択状態 ─────────────────────────────────
  /** 選択中のトランザクション ID セット */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── 楽観的 UI: 確定・無視・バッチ確定後に即リストから消す ──
  /** 処理済み ID セット（確定・無視・バッチ確定、ページリフレッシュ前の一時状態） */
  const [localProcessedIds, setLocalProcessedIds] = useState<Set<string>>(
    new Set()
  );

  const addLocalProcessed = (id: string) =>
    setLocalProcessedIds((prev) => new Set([...prev, id]));

  // ── バッチ対象の計算 ──────────────────────────
  /**
   * 選択可能な明細 = 未確定 かつ 高信頼度のトップマッチを持つもの
   * localProcessedIds でバッチ確定済みのものは除外
   */
  const selectableItems = useMemo<BatchConfirmItem[]>(() => {
    return transactions
      .filter((tx) => {
        if (tx.status !== "unmatched") return false;
        if (localProcessedIds.has(tx.id)) return false;
        const topMatch = tx.matches.find((m) => m.isTopMatch) ?? tx.matches[0];
        return topMatch?.confidence === "high" && Boolean(topMatch.matchId);
      })
      .map((tx) => {
        const topMatch =
          tx.matches.find((m) => m.isTopMatch) ?? tx.matches[0];
        return {
          transactionId: tx.id,
          matchId: topMatch!.matchId,
        };
      });
  }, [transactions, localProcessedIds]);

  /** txId → matchId のマップ（バッチ確定時に使用） */
  const selectableMap = useMemo(
    () => new Map(selectableItems.map((i) => [i.transactionId, i.matchId])),
    [selectableItems]
  );

  // ── 楽観的 UI 用の表示リスト ──────────────────
  const visibleTransactions = useMemo(
    () => transactions.filter((tx) => !localProcessedIds.has(tx.id)),
    [transactions, localProcessedIds]
  );

  // ── ページネーション ───────────────────────────
  const [currentPage, setCurrentPage] = useState(1);

  // フィルター（transactions prop）が変わったらページをリセット
  useEffect(() => { setCurrentPage(1); }, [transactions]);

  // 楽観的削除でページが空になった場合に前ページへ戻す
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(visibleTransactions.length / PAGE_SIZE));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [visibleTransactions.length, currentPage]);

  const totalPages = Math.max(1, Math.ceil(visibleTransactions.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = Math.min(pageStart + PAGE_SIZE, visibleTransactions.length);
  const pagedTransactions = visibleTransactions.slice(pageStart, pageEnd);

  // ── 統計（表示リストから算出） ────────────────
  const total = visibleTransactions.length;
  const unmatched = visibleTransactions.filter(
    (t) => t.status === "unmatched"
  ).length;
  const confirmed = visibleTransactions.filter(
    (t) => t.status === "matched"
  ).length;
  const ignored = visibleTransactions.filter(
    (t) => t.status === "ignored"
  ).length;

  // ── 単体操作ハンドラ ──────────────────────────

  const handleConfirm = async (txId: string, matchId: string) => {
    setActingId(txId);
    startTransition(async () => {
      const result = await confirmMatch(txId, matchId);
      if ("error" in result) {
        toast.error("確定に失敗しました", { description: result.error });
      } else {
        toast.success("入金を確定しました");
        addLocalProcessed(txId);
        doRefresh();
      }
      setActingId(null);
    });
  };

  const handleIgnore = async (txId: string) => {
    setActingId(txId);
    startTransition(async () => {
      const result = await ignoreTransaction(txId);
      if ("error" in result) {
        toast.error("無視処理に失敗しました", { description: result.error });
      } else {
        toast.info("明細を無視しました");
        addLocalProcessed(txId);
        doRefresh();
      }
      setActingId(null);
    });
  };

  const handleManualMatch = (txId: string) => {
    addLocalProcessed(txId);
    doRefresh();
  };

  const handleRevert = async (txId: string) => {
    setActingId(txId);
    startTransition(async () => {
      const result = await revertTransaction(txId);
      if ("error" in result) {
        toast.error("取り消しに失敗しました", { description: result.error });
      } else {
        toast.info("未確認に戻しました");
        addLocalProcessed(txId);
        doRefresh();
      }
      setActingId(null);
    });
  };

  // ── バッチ操作ハンドラ ────────────────────────

  const handleSelectAll = () => {
    setSelectedIds(
      new Set(selectableItems.map((i) => i.transactionId))
    );
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleToggleSelect = (txId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) {
        next.delete(txId);
      } else {
        next.add(txId);
      }
      return next;
    });
  };

  const handleBatchConfirm = () => {
    // 選択中 ID を BatchConfirmItem[] に変換（matchId を selectableMap から取得）
    const items: BatchConfirmItem[] = [...selectedIds]
      .map((txId) => ({
        transactionId: txId,
        matchId: selectableMap.get(txId) ?? "",
      }))
      .filter((i) => i.matchId !== ""); // matchId が取れないものは除外

    if (items.length === 0) return;

    startBatchTransition(async () => {
      const result = await batchConfirmMatches(items);
      if ("error" in result) {
        toast.error("一括確定に失敗しました", { description: result.error });
      } else {
        const count = result.confirmedCount;
        toast.success(`${count}件を一括確定しました`);

        // 楽観的 UI: 確定した明細をリストから即座に消す
        for (const { transactionId } of items) addLocalProcessed(transactionId);

        // 選択状態をリセット
        setSelectedIds(new Set());

        doRefresh();
      }
    });
  };

  if (total === 0 && localProcessedIds.size === 0) return null;

  return (
    <div className="space-y-4">
      {/* ── ヘッダー & 統計サマリー ───────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {total > 0 && (
            <span className="text-muted-foreground">
              表示件数：{(pageStart + 1).toLocaleString("ja-JP")}〜{pageEnd.toLocaleString("ja-JP")} / 全{total.toLocaleString("ja-JP")}件
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="gap-1">全{total}件</Badge>
            {unmatched > 0 && (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1">
                未確認 {unmatched}件
              </Badge>
            )}
            {confirmed > 0 && (
              <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                確定済み {confirmed}件
              </Badge>
            )}
            {ignored > 0 && (
              <Badge variant="outline" className="text-muted-foreground gap-1">
                無視 {ignored}件
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ── バッチ一括確定バー（高信頼度マッチが1件以上ある場合のみ表示） ── */}
      {selectableItems.length > 0 && (
        <BatchConfirmBar
          totalSelectable={selectableItems.length}
          selectedCount={selectedIds.size}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onBatchConfirm={handleBatchConfirm}
          isActing={isBatchPending}
        />
      )}

      {/* ── バッチ確定後の楽観的空状態（全件確定時） ── */}
      {total === 0 && localProcessedIds.size > 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center rounded-xl border border-green-200 bg-green-50/30">
          <CheckCircle2 className="h-8 w-8 text-green-500 mb-2" />
          <p className="text-sm font-medium text-green-800">
            {localProcessedIds.size}件をすべて処理しました
          </p>
          <p className="text-xs text-green-600 mt-1">
            ページを更新すると処理済み一覧に移動します
          </p>
        </div>
      )}

      {/* ── トランザクションカード一覧 ──────────── */}
      <div className="space-y-3">
        {pagedTransactions.map((tx) => (
          <TransactionCard
            key={tx.id}
            transaction={tx}
            onConfirm={handleConfirm}
            onIgnore={handleIgnore}
            onManualMatch={handleManualMatch}
            onRevert={handleRevert}
            isActing={(actingId === tx.id && isPending) || isBatchPending}
            isSelectable={selectableMap.has(tx.id)}
            isSelected={selectedIds.has(tx.id)}
            onToggleSelect={() => handleToggleSelect(tx.id)}
          />
        ))}
      </div>

      {/* ── ページネーション ────────────────────── */}
      <PaginationBar
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

