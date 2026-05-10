"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteIncomingPlan,
  updateIncomingPlanStatus,
  type IncomingPlan,
  type IncomingPlanStatus,
  type IncomingPlansResult,
  type TradingPartnerOption,
} from "./actions";
import IncomingPlanModal from "./IncomingPlanModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const STATUS_FILTER_OPTIONS = [
  { value: "all",       label: "ステータス: すべて" },
  { value: "pending",   label: "未入金（期日前）" },
  { value: "delayed",   label: "遅延（入金督促が必要）" },
  { value: "partial",   label: "一部入金済み" },
  { value: "received",  label: "入金済み" },
  { value: "cancelled", label: "キャンセル" },
];

const PERIOD_OPTIONS = [
  { value: "",              label: "期間: すべて" },
  { value: "current_month", label: "今月" },
  { value: "next_month",    label: "来月" },
  { value: "past30",        label: "過去30日" },
  { value: "custom",        label: "カスタム期間" },
];

const SORT_OPTIONS = [
  { value: "date_asc",    label: "予定日: 古い順" },
  { value: "date_desc",   label: "予定日: 新しい順" },
  { value: "amount_desc", label: "金額: 高い順" },
  { value: "amount_asc",  label: "金額: 低い順" },
  { value: "status_asc",  label: "ステータス順" },
];

// ─────────────────────────────────────────────
// ステータス計算・表示ユーティリティ
// ─────────────────────────────────────────────

type EffectiveStatus = IncomingPlanStatus | "overdue";

function getEffectiveStatus(plan: IncomingPlan): EffectiveStatus {
  // DB で delayed に設定済みの場合
  if (plan.status === "delayed") return "overdue";
  // cron 未実行の互換フォールバック：pending かつ期日超過
  if (plan.status === "pending") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const planned = new Date(plan.planned_date + "T00:00:00");
    if (planned < today) return "overdue";
  }
  return plan.status;
}

/** 遅延日数を返す（遅延していない場合は 0） */
function getOverdueDays(plan: IncomingPlan): number {
  if (plan.status !== "delayed" && getEffectiveStatus(plan) !== "overdue") return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const planned = new Date(plan.planned_date + "T00:00:00");
  return Math.max(0, Math.floor((today.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24)));
}

const STATUS_CONFIG: Record<
  EffectiveStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "未入金",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    icon: <CalendarClock className="h-3 w-3" />,
  },
  delayed: {
    label: "遅延",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  overdue: {
    label: "遅延",
    className: "bg-red-50 text-red-700 border-red-200",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  partial: {
    label: "一部入金",
    className: "bg-amber-50 text-amber-700 border-amber-200",
    icon: <Clock className="h-3 w-3" />,
  },
  received: {
    label: "入金済み",
    className: "bg-green-50 text-green-700 border-green-200",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  cancelled: {
    label: "キャンセル",
    className: "bg-slate-100 text-slate-500 border-slate-200",
    icon: <XCircle className="h-3 w-3" />,
  },
};

// ─────────────────────────────────────────────
// フォーマットユーティリティ
// ─────────────────────────────────────────────

function formatAmount(n: number) {
  return "¥" + n.toLocaleString("ja-JP");
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function relativeDays(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const planned = new Date(dateStr + "T00:00:00");
  const diff = Math.round(
    (planned.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === -1) return "昨日";
  if (diff > 0) return `${diff}日後`;
  return `${Math.abs(diff)}日前`;
}

// ─────────────────────────────────────────────
// ステータスソート優先度（クライアント側）
// ─────────────────────────────────────────────

const STATUS_PRIORITY: Record<string, number> = {
  overdue: 0,
  pending: 1,
  partial: 2,
  received: 3,
  cancelled: 4,
};

function getStatusPriority(plan: IncomingPlan): number {
  return STATUS_PRIORITY[getEffectiveStatus(plan)] ?? 9;
}

// ─────────────────────────────────────────────
// ページネーションコンポーネント
// ─────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = current - 2;
  const right = current + 2;
  if (left > 2) pages.push("...");
  for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) pages.push(i);
  if (right < total - 1) pages.push("...");
  if (total > 1) pages.push(total);
  return pages;
}

function PaginationBar({
  currentPage,
  totalPages,
  onPageChange,
  disabled,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-4 pb-2 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || disabled}
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors border border-border",
          "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        前へ
      </button>

      {pages.map((p, idx) =>
        p === "..." ? (
          <span key={`e${idx}`} className="px-2 py-1.5 text-sm text-muted-foreground select-none">
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={disabled}
            className={cn(
              "w-9 h-9 rounded-md text-sm transition-colors",
              p === currentPage
                ? "bg-primary text-primary-foreground font-semibold"
                : "border border-border hover:bg-muted text-foreground disabled:opacity-40"
            )}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || disabled}
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
// メインコンポーネント
// ─────────────────────────────────────────────

interface IncomingPlansClientProps {
  result: IncomingPlansResult;
  tradingPartners: TradingPartnerOption[];
}

// セレクト共通スタイル
const SELECT_CLS =
  "h-8 rounded-md border border-input bg-background px-2.5 text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-ring/30 cursor-pointer transition-colors hover:border-ring/60";

export default function IncomingPlansClient({
  result,
  tradingPartners,
}: IncomingPlansClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isNavPending, startNavTransition] = useTransition();
  const [isActing, startActing] = useTransition();

  // ── URL から現在パラメータを読み取る ─────────
  const currentStatus   = searchParams.get("status")   ?? "all";
  const currentSort     = searchParams.get("sort")      ?? "date_asc";
  const currentPeriod   = searchParams.get("period")    ?? "";
  const currentPartner  = searchParams.get("partner")   ?? "";
  const currentLimit    = searchParams.get("limit") === "50" ? "50" : "20";
  const currentDateFrom = searchParams.get("dateFrom")  ?? "";
  const currentDateTo   = searchParams.get("dateTo")    ?? "";

  // ── 検索入力（ローカル状態 + debounce） ──────
  const [searchInput, setSearchInput] = useState(searchParams.get("q") ?? "");

  // ブラウザ戻る/進む でURLが変わったとき検索欄を同期
  useEffect(() => {
    setSearchInput(searchParams.get("q") ?? "");
  }, [searchParams]);

  // 350ms デバウンス後にURL更新
  useEffect(() => {
    const urlQ = searchParams.get("q") ?? "";
    if (searchInput === urlQ) return;
    const t = setTimeout(() => updateParams({ q: searchInput || undefined, page: undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // ── モーダル・削除状態 ───────────────────────
  const [modalOpen, setModalOpen]       = useState(false);
  const [editingPlan, setEditingPlan]   = useState<IncomingPlan | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // ── URL 更新ヘルパー ──────────────────────────
  const updateParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(updates)) {
        if (val !== undefined && val !== "" && val !== null) {
          params.set(key, String(val));
        } else {
          params.delete(key);
        }
      }
      startNavTransition(() => {
        router.push(`/incoming-plans?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  const clearAllFilters = () => {
    setSearchInput("");
    startNavTransition(() => router.push("/incoming-plans"));
  };

  // ── 表示データの計算 ──────────────────────────
  const { plans, total, page, limit } = result;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  // status_asc のみクライアント側でページ内ソート
  const displayPlans =
    currentSort === "status_asc"
      ? [...plans].sort(
          (a, b) =>
            getStatusPriority(a) - getStatusPriority(b) ||
            a.planned_date.localeCompare(b.planned_date)
        )
      : plans;

  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx   = Math.min(page * limit, total);

  const hasActiveFilters = !!(
    (searchParams.get("q") ?? "") ||
    currentStatus !== "all" ||
    currentPeriod ||
    currentPartner
  );

  // ── アクション: ステータス切り替え ─────────────
  const handleStatusToggle = (plan: IncomingPlan) => {
    const newStatus: IncomingPlanStatus =
      plan.status === "received" ? "pending" : "received";
    startActing(async () => {
      const res = await updateIncomingPlanStatus(plan.id, newStatus);
      if ("error" in res) {
        toast.error("ステータスの更新に失敗しました", { description: res.error });
      } else {
        toast.success(newStatus === "received" ? "入金済みにしました" : "未入金に戻しました");
        router.refresh();
      }
    });
  };

  // ── アクション: 削除 ───────────────────────────
  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await deleteIncomingPlan(id);
      if ("error" in res) {
        toast.error("削除に失敗しました", { description: res.error });
      } else {
        toast.info("入金予定を削除しました");
        router.refresh();
      }
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const openCreate = () => { setEditingPlan(null); setModalOpen(true); };
  const openEdit   = (plan: IncomingPlan) => { setEditingPlan(plan); setModalOpen(true); };

  return (
    <>
      <Card className="border-border">
        {/* ─── ツールバー ──────────────────────────────── */}
        <CardHeader className="pb-3 space-y-3">

          {/* 行1: 検索 + 表示件数 + 登録ボタン */}
          <div className="flex flex-col sm:flex-row gap-2">
            {/* 検索ボックス */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="会社名・振込名義・メモで検索..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex gap-2 flex-shrink-0 items-center">
              {/* 表示件数 */}
              <select
                value={currentLimit}
                onChange={(e) =>
                  updateParams({ limit: e.target.value, page: undefined })
                }
                className={SELECT_CLS}
              >
                <option value="20">20件/ページ</option>
                <option value="50">50件/ページ</option>
              </select>

              {/* 登録ボタン */}
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 flex-shrink-0"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4 mr-1" />
                入金予定を登録
              </Button>
            </div>
          </div>

          {/* 行2: フィルター + ソート */}
          <div className="flex flex-wrap gap-2 items-center">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

            {/* ステータス */}
            <select
              value={currentStatus}
              onChange={(e) =>
                updateParams({ status: e.target.value, page: undefined })
              }
              className={cn(
                SELECT_CLS,
                currentStatus !== "all" &&
                  "border-primary/50 bg-primary/5 text-primary font-medium"
              )}
            >
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* 期間 */}
            <select
              value={currentPeriod}
              onChange={(e) =>
                updateParams({
                  period: e.target.value,
                  dateFrom: undefined,
                  dateTo: undefined,
                  page: undefined,
                })
              }
              className={cn(
                SELECT_CLS,
                currentPeriod && "border-primary/50 bg-primary/5 text-primary font-medium"
              )}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* カスタム期間入力 */}
            {currentPeriod === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={currentDateFrom}
                  onChange={(e) =>
                    updateParams({ dateFrom: e.target.value, page: undefined })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
                <span className="text-muted-foreground text-sm">〜</span>
                <input
                  type="date"
                  value={currentDateTo}
                  onChange={(e) =>
                    updateParams({ dateTo: e.target.value, page: undefined })
                  }
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
            )}

            {/* 取引先 */}
            <select
              value={currentPartner}
              onChange={(e) =>
                updateParams({ partner: e.target.value, page: undefined })
              }
              className={cn(
                SELECT_CLS,
                currentPartner && "border-primary/50 bg-primary/5 text-primary font-medium"
              )}
            >
              <option value="">取引先: すべて</option>
              {tradingPartners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            {/* ソート */}
            <select
              value={currentSort}
              onChange={(e) => updateParams({ sort: e.target.value })}
              className={SELECT_CLS}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* クリアボタン */}
            {hasActiveFilters && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3 mr-1" />
                クリア
              </Button>
            )}
          </div>

          {/* 行3: 件数表示 */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground min-h-[1rem]">
            {total > 0 ? (
              <span>
                {startIdx.toLocaleString("ja-JP")}〜{endIdx.toLocaleString("ja-JP")}件
                {" "}/ 全{total.toLocaleString("ja-JP")}件
              </span>
            ) : (
              <span>0件</span>
            )}
            {isNavPending && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
          </div>
        </CardHeader>

        {/* ─── テーブル ──────────────────────────────── */}
        <CardContent className="p-0">
          {displayPlans.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <CalendarClock className="h-12 w-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-foreground">
                  {hasActiveFilters
                    ? "条件に一致する入金予定がありません"
                    : "入金予定がまだ登録されていません"}
                </p>
                {hasActiveFilters ? (
                  <p className="text-sm text-muted-foreground mt-1">
                    検索条件を変更するか、
                    <button
                      type="button"
                      className="text-primary underline ml-0.5"
                      onClick={clearAllFilters}
                    >
                      フィルターをクリア
                    </button>
                    してください
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">
                    「入金予定を登録」から追加してください
                  </p>
                )}
              </div>
              {!hasActiveFilters && (
                <Button
                  size="sm"
                  className="mt-1 bg-primary hover:bg-primary/90"
                  onClick={openCreate}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  入金予定を登録
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="pl-6">予定入金日</TableHead>
                    <TableHead>取引先 / 会社名</TableHead>
                    <TableHead>振込名義</TableHead>
                    <TableHead className="text-right">予定金額</TableHead>
                    <TableHead>ステータス</TableHead>
                    <TableHead className="pr-6 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPlans.map((plan) => {
                    const eff = getEffectiveStatus(plan);
                    const statusCfg = STATUS_CONFIG[eff];
                    const displayName =
                      plan.trading_partner_name ?? plan.company_name ?? "-";
                    const isDeleting = deletingId === plan.id;
                    const isConfirmDelete = confirmDeleteId === plan.id;
                    const overdueDays = getOverdueDays(plan);
                    const isOverdue = eff === "overdue";

                    return (
                      <TableRow
                        key={plan.id}
                        className={cn(
                          "border-border hover:bg-muted/30",
                          isOverdue && "bg-red-50/60 hover:bg-red-50/80 dark:bg-red-950/20 dark:hover:bg-red-950/30"
                        )}
                      >
                        {/* 予定入金日 */}
                        <TableCell className="pl-6">
                          <div className="space-y-1">
                            <div className={cn(
                              "text-sm font-medium",
                              isOverdue ? "text-red-700 dark:text-red-400" : "text-foreground"
                            )}>
                              {formatDate(plan.planned_date)}
                            </div>
                            {plan.status !== "received" && plan.status !== "cancelled" && (
                              isOverdue ? (
                                <div className="flex items-center gap-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/40 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:text-red-300">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    {overdueDays}日経過
                                  </span>
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">
                                  {relativeDays(plan.planned_date)}
                                </div>
                              )
                            )}
                          </div>
                        </TableCell>

                        {/* 取引先 / 会社名 */}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className={cn(
                              "text-sm font-medium",
                              isOverdue ? "text-red-700 dark:text-red-400" : "text-foreground"
                            )}>
                              {displayName}
                            </div>
                            {plan.memo && (
                              <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                                {plan.memo}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* 振込名義 */}
                        <TableCell className="text-sm text-muted-foreground">
                          {plan.alias_name ?? (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>

                        {/* 予定金額 */}
                        <TableCell className="text-right font-mono text-sm font-medium text-foreground">
                          {formatAmount(plan.amount)}
                        </TableCell>

                        {/* ステータス */}
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs flex items-center gap-1 w-fit",
                              statusCfg.className
                            )}
                          >
                            {statusCfg.icon}
                            {statusCfg.label}
                          </Badge>
                        </TableCell>

                        {/* 操作 */}
                        <TableCell className="pr-6">
                          {isConfirmDelete ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-muted-foreground">
                                削除しますか？
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                戻る
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                disabled={isDeleting}
                                onClick={() => handleDelete(plan.id)}
                              >
                                {isDeleting ? "削除中..." : "削除"}
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {plan.status !== "cancelled" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-7 text-xs",
                                    plan.status === "received"
                                      ? "text-muted-foreground"
                                      : "text-green-600 hover:text-green-700 hover:bg-green-50"
                                  )}
                                  disabled={isActing}
                                  onClick={() => handleStatusToggle(plan)}
                                >
                                  {plan.status === "received"
                                    ? "未入金に戻す"
                                    : "入金済みにする"}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground"
                                onClick={() => openEdit(plan)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                onClick={() => setConfirmDeleteId(plan.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ─── ページネーション ─────────────────────── */}
          {totalPages > 1 && (
            <div className="px-6">
              <PaginationBar
                currentPage={page}
                totalPages={totalPages}
                onPageChange={(p) => updateParams({ page: p })}
                disabled={isNavPending}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* モーダル */}
      <IncomingPlanModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingPlan(null);
        }}
        plan={editingPlan ?? undefined}
        tradingPartners={tradingPartners}
      />
    </>
  );
}
