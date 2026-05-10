"use client";

import { BadgeDollarSign, Calendar, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingExpenseRow } from "@/app/(dashboard)/expenses/actions";

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function formatAmount(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(dateStr));
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface PaidCardProps {
  expense:    PendingExpenseRow;
  isActing:   boolean;
  onMarkPaid: () => Promise<void>;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function PaidCard({ expense, isActing, onMarkPaid }: PaidCardProps) {
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/20">
      {/* 左: 取引先 + 申請者 + 日付 */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {expense.vendor ?? "取引先未登録"}
          </span>
          {expense.category && (
            <span className="text-xs bg-muted rounded-full px-2 py-0.5 text-muted-foreground">
              {expense.category}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {expense.submitterName ?? "—"}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(expense.date)}
          </span>
          <span className="text-xs text-muted-foreground">
            承認: {formatDate(expense.created_at)}
          </span>
        </div>
      </div>

      {/* 中央: 金額 */}
      <div className="text-right sm:text-center">
        <p className="text-base font-bold text-foreground tabular-nums">
          {formatAmount(expense.amount)}
        </p>
        {expense.tax_amount != null && (
          <p className="text-xs text-muted-foreground">
            税 {formatAmount(expense.tax_amount)}
          </p>
        )}
      </div>

      {/* 右: 支払済みにするボタン */}
      <div className="flex-shrink-0">
        <Button
          size="sm"
          onClick={onMarkPaid}
          disabled={isActing}
          className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-transparent"
        >
          {isActing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <BadgeDollarSign className="h-3.5 w-3.5" />
          )}
          支払済みにする
        </Button>
      </div>
    </li>
  );
}
