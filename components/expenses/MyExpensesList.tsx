"use client";

import { useState, useMemo } from "react";
import { RefreshCw, Receipt, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ExpenseStatusBadge from "@/components/expenses/ExpenseStatusBadge";
import ExpenseDetailModal from "@/components/expenses/ExpenseDetailModal";
import { type ExpenseRow, type UpdateExpenseInput } from "@/app/(dashboard)/expenses/actions";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function fmtAmount(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(n);
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(s));
}

// ─────────────────────────────────────────────
// フィルター定義
// ─────────────────────────────────────────────

type StatusFilter = "all" | "submitted" | "approved" | "rejected" | "paid" | "returned";

const FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all",       label: "すべて"   },
  { value: "submitted", label: "承認待ち" },
  { value: "approved",  label: "承認済み" },
  { value: "rejected",  label: "却下"     },
  { value: "paid",      label: "支払済み" },
  { value: "returned",  label: "差し戻し" },
];

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface MyExpensesListProps {
  expenses:     ExpenseRow[];
  isRefreshing: boolean;
  onRefresh:    () => void;
  onUpdate:     (id: string, data: UpdateExpenseInput) => Promise<boolean>;
  onDelete:     (id: string) => Promise<void>;
  onResubmit:   (id: string) => Promise<void>;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function MyExpensesList({
  expenses,
  isRefreshing,
  onRefresh,
  onUpdate,
  onDelete,
  onResubmit,
}: MyExpensesListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery,  setSearchQuery]  = useState("");
  const [selectedExp,  setSelectedExp]  = useState<ExpenseRow | null>(null);
  const [modalOpen,    setModalOpen]    = useState(false);

  // ── クライアントサイドフィルタリング ─────────
  const filtered = useMemo(() => {
    let result = expenses;

    // ステータスフィルター
    if (statusFilter !== "all") {
      result = result.filter((e) => e.status === statusFilter);
    }

    // テキスト検索（取引先・摘要・金額）
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((e) =>
        e.vendor?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        e.category?.toLowerCase().includes(q) ||
        e.amount?.toString().includes(q)
      );
    }

    return result;
  }, [expenses, statusFilter, searchQuery]);

  // ステータス別件数（バッジ用）
  const counts = useMemo(() => {
    const c: Partial<Record<StatusFilter, number>> = { all: expenses.length };
    for (const e of expenses) {
      c[e.status as StatusFilter] = (c[e.status as StatusFilter] ?? 0) + 1;
    }
    return c;
  }, [expenses]);

  // ── 行クリック → モーダル ──────────────────
  const handleRowClick = (expense: ExpenseRow) => {
    setSelectedExp(expense);
    setModalOpen(true);
  };

  // ── 空状態 ────────────────────────────────────
  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Receipt className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">申請はまだありません</p>
          <p className="text-sm text-muted-foreground mt-1">
            「新規申請」タブから領収書をアップロードしてください
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* ── 検索ボックス ─────────────────────── */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="取引先・摘要・金額で検索…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-8 text-sm"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── ステータスフィルター ──────────────── */}
        <div className="flex items-center gap-1 flex-wrap">
          {FILTER_OPTIONS.map(({ value, label }) => {
            const count = counts[value];
            const isActive = statusFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
              >
                {label}
                {count != null && count > 0 && (
                  <span className={cn(
                    "rounded-full px-1 py-0 text-[10px] font-semibold leading-4",
                    isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}

          {/* スペーサー + 更新ボタン */}
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
              更新
            </Button>
          </div>
        </div>

        {/* ── 件数表示 ──────────────────────────── */}
        <p className="text-xs text-muted-foreground">
          {filtered.length === expenses.length
            ? `${expenses.length} 件の申請`
            : `${filtered.length} 件表示中（全 ${expenses.length} 件）`}
        </p>

        {/* ── 一覧 ─────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Search className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">条件に一致する申請がありません</p>
            <button
              type="button"
              onClick={() => { setStatusFilter("all"); setSearchQuery(""); }}
              className="text-xs text-primary hover:underline"
            >
              フィルターをリセット
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((expense) => (
              <li
                key={expense.id}
                onClick={() => handleRowClick(expense)}
                className={cn(
                  "group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
                  "hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
                )}
              >
                {/* ステータスバッジ */}
                <div className="flex-shrink-0 w-20">
                  <ExpenseStatusBadge status={expense.status} />
                </div>

                {/* メイン情報 */}
                <div className="flex-1 min-w-0 grid grid-cols-1 gap-0.5 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-4 sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {expense.vendor ?? "取引先未登録"}
                    </p>
                    {expense.purpose && (
                      <p className="text-xs text-foreground/80 font-medium truncate">
                        {expense.purpose}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground truncate">
                      {expense.category && <span className="mr-2">{expense.category}</span>}
                      {expense.description}
                    </p>
                  </div>
                  <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                    {fmtDate(expense.date)}
                  </p>
                  <p className="text-sm font-semibold text-foreground whitespace-nowrap tabular-nums">
                    {fmtAmount(expense.amount)}
                  </p>
                  <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
                    申請: {fmtDate(expense.created_at)}
                  </p>
                </div>

                {/* 矢印 */}
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 詳細モーダル ──────────────────────── */}
      <ExpenseDetailModal
        expense={selectedExp ? (expenses.find((e) => e.id === selectedExp.id) ?? selectedExp) : null}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setSelectedExp(null);
        }}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onResubmit={onResubmit}
      />
    </>
  );
}
