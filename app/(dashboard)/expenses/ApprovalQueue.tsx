"use client";

import { RefreshCw, ShieldCheck, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import ApprovalCard from "@/components/expenses/ApprovalCard";
import PaidCard from "@/components/expenses/PaidCard";
import { type PendingExpenseRow } from "@/app/(dashboard)/expenses/actions";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Props（コントロールドコンポーネント）
// ─────────────────────────────────────────────

interface ApprovalQueueProps {
  pendingItems:   PendingExpenseRow[];
  approvedItems:  PendingExpenseRow[];
  actingIds:      Set<string>;
  isRefreshing:   boolean;
  onApprove:      (id: string) => Promise<void>;
  onReject:       (id: string, reason: string) => Promise<void>;
  onReturn:       (id: string, reason: string, deleteAttachments: boolean) => Promise<void>;
  onMarkPaid:     (id: string) => Promise<void>;
  onRefresh:      () => void;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function ApprovalQueue({
  pendingItems,
  approvedItems,
  actingIds,
  isRefreshing,
  onApprove,
  onReject,
  onReturn,
  onMarkPaid,
  onRefresh,
}: ApprovalQueueProps) {
  const isEmpty = pendingItems.length === 0 && approvedItems.length === 0;

  // ── 空状態 ────────────────────────────────────
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <ShieldCheck className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <p className="font-semibold text-foreground">処理待ちの申請はありません</p>
          <p className="text-sm text-muted-foreground mt-1">
            すべての申請が処理されています
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          更新
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          承認待ち{" "}
          <span className="font-semibold text-foreground">{pendingItems.length} 件</span>
          {approvedItems.length > 0 && (
            <>
              　支払待ち{" "}
              <span className="font-semibold text-foreground">{approvedItems.length} 件</span>
            </>
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing}>
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          更新
        </Button>
      </div>

      {/* 承認待ちセクション */}
      {pendingItems.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            承認待ち — Pending Approval
          </p>
          <ul className="space-y-2">
            {pendingItems.map((item) => (
              <ApprovalCard
                key={item.id}
                expense={item}
                isActing={actingIds.has(item.id)}
                onApprove={() => onApprove(item.id)}
                onReject={(reason) => onReject(item.id, reason)}
                onReturn={(reason, deleteAttachments) => onReturn(item.id, reason, deleteAttachments)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 支払待ちセクション */}
      {approvedItems.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-3.5 w-3.5 text-blue-500" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              支払待ち — Approved, Awaiting Payment
            </p>
          </div>
          <ul className="space-y-2">
            {approvedItems.map((item) => (
              <PaidCard
                key={item.id}
                expense={item}
                isActing={actingIds.has(item.id)}
                onMarkPaid={() => onMarkPaid(item.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
