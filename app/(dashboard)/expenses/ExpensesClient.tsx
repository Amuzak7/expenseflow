"use client";

import { useState, useTransition, useCallback } from "react";
import { PlusCircle, List, ShieldCheck } from "lucide-react";
import ReceiptUploader from "@/components/expenses/ReceiptUploader";
import AnalysisResult from "@/components/expenses/AnalysisResult";
import MyExpensesList from "@/components/expenses/MyExpensesList";
import ApprovalQueue from "@/app/(dashboard)/expenses/ApprovalQueue";
import {
  fetchMyExpenses,
  fetchPendingApprovals,
  fetchApprovedExpenses,
  approveExpense,
  rejectExpense,
  returnExpense,
  resubmitExpense,
  markAsPaid,
  updateExpense,
  deleteExpense,
  type AnalyzeReceiptResult,
  type ExpenseRow,
  type PendingExpenseRow,
  type UpdateExpenseInput,
} from "@/app/(dashboard)/expenses/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// タブ定義
// ─────────────────────────────────────────────

type Tab = "new" | "list" | "approval";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ExpensesClientProps {
  initialExpenses:       ExpenseRow[];
  initialPendingItems:   PendingExpenseRow[];
  initialApprovedItems:  PendingExpenseRow[];
  isApprover:            boolean;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function ExpensesClient({
  initialExpenses,
  initialPendingItems,
  initialApprovedItems,
  isApprover,
}: ExpensesClientProps) {
  const [tab, setTab]                     = useState<Tab>("new");
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeReceiptResult | null>(null);

  // ── 全データ状態をここで一元管理 ─────────────
  const [expenses, setExpenses]           = useState<ExpenseRow[]>(initialExpenses);
  const [pendingItems, setPendingItems]   = useState<PendingExpenseRow[]>(initialPendingItems);
  const [approvedItems, setApprovedItems] = useState<PendingExpenseRow[]>(initialApprovedItems);
  const [actingIds, setActingIds]         = useState<Set<string>>(new Set());
  const [isPending, startTransition]      = useTransition();

  const setActing   = (id: string) => setActingIds((p) => new Set([...p, id]));
  const unsetActing = (id: string) => setActingIds((p) => { const s = new Set(p); s.delete(id); return s; });

  // ── 全データ再取得 ────────────────────────────
  const refreshAll = useCallback(() => {
    startTransition(async () => {
      if (isApprover) {
        const [fresh, freshPending, freshApproved] = await Promise.all([
          fetchMyExpenses(),
          fetchPendingApprovals(),
          fetchApprovedExpenses(),
        ]);
        setExpenses(fresh);
        setPendingItems(freshPending);
        setApprovedItems(freshApproved);
      } else {
        const fresh = await fetchMyExpenses();
        setExpenses(fresh);
      }
    });
  }, [isApprover]);

  // ── タブ切り替え: データ自動更新 ──────────────
  const handleTabChange = (next: Tab) => {
    setTab(next);
    if (next !== "new") refreshAll();
  };

  // ── 解析完了 ──────────────────────────────────
  const handleAnalyzed = (data: AnalyzeReceiptResult) => setAnalyzeResult(data);

  // ── 申請完了: 全データ更新 → 申請一覧へ ────────
  const handleSaved = (_expenseId: string) => {
    setAnalyzeResult(null);
    startTransition(async () => {
      if (isApprover) {
        const [fresh, freshPending, freshApproved] = await Promise.all([
          fetchMyExpenses(),
          fetchPendingApprovals(),
          fetchApprovedExpenses(),
        ]);
        setExpenses(fresh);
        setPendingItems(freshPending);
        setApprovedItems(freshApproved);
      } else {
        const fresh = await fetchMyExpenses();
        setExpenses(fresh);
      }
      setTab("list");
    });
  };

  // ── 承認処理 ──────────────────────────────────
  const handleApprove = async (id: string) => {
    setActing(id);
    // 楽観的更新: pending → approved へ移動
    const item = pendingItems.find((i) => i.id === id);
    setPendingItems((p) => p.filter((i) => i.id !== id));
    if (item) setApprovedItems((p) => [...p, { ...item, status: "approved" }]);

    const result = await approveExpense(id);
    unsetActing(id);
    if (!result.ok) {
      toast.error(result.error);
      // ロールバック
      if (item) setPendingItems((p) => [...p, item]);
      setApprovedItems((p) => p.filter((i) => i.id !== id));
      return;
    }
    toast.success("承認しました");
    // 申請一覧のステータスを更新
    startTransition(async () => {
      const fresh = await fetchMyExpenses();
      setExpenses(fresh);
    });
  };

  // ── 却下処理 ──────────────────────────────────
  const handleReject = async (id: string, reason: string) => {
    setActing(id);
    const item = pendingItems.find((i) => i.id === id);
    setPendingItems((p) => p.filter((i) => i.id !== id));

    const result = await rejectExpense(id, reason);
    unsetActing(id);
    if (!result.ok) {
      toast.error(result.error);
      if (item) setPendingItems((p) => [...p, item]);
      return;
    }
    toast.success("却下しました");
    startTransition(async () => {
      const fresh = await fetchMyExpenses();
      setExpenses(fresh);
    });
  };

  // ── 支払済み処理 ──────────────────────────────
  const handleMarkPaid = async (id: string) => {
    setActing(id);
    const item = approvedItems.find((i) => i.id === id);
    setApprovedItems((p) => p.filter((i) => i.id !== id));

    const result = await markAsPaid(id);
    unsetActing(id);
    if (!result.ok) {
      toast.error(result.error);
      if (item) setApprovedItems((p) => [...p, item]);
      return;
    }
    toast.success("支払済みにしました");
    startTransition(async () => {
      const fresh = await fetchMyExpenses();
      setExpenses(fresh);
    });
  };

  // ── 申請内容の編集 ────────────────────────────
  const handleUpdateExpense = async (id: string, data: UpdateExpenseInput): Promise<boolean> => {
    const result = await updateExpense(id, data);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("申請内容を更新しました");
    // 楽観的更新: 対象行のフィールドを即時反映
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              purpose:        data.purpose ?? e.purpose,
              date:           data.date,
              amount:         data.amount,
              tax_amount:     data.taxAmount ?? null,
              vendor:         data.vendor,
              category:       data.category,
              description:    data.description ?? null,
              payment_method: data.paymentMethod,
            }
          : e
      )
    );
    return true;
  };

  // ── 差し戻し処理 ──────────────────────────────
  const handleReturn = async (id: string, reason: string, deleteAttachments: boolean) => {
    setActing(id);
    const item = pendingItems.find((i) => i.id === id);
    setPendingItems((p) => p.filter((i) => i.id !== id));

    const result = await returnExpense(id, reason, deleteAttachments);
    unsetActing(id);
    if (!result.ok) {
      toast.error(result.error);
      if (item) setPendingItems((p) => [...p, item]);
      return;
    }
    toast.success("差し戻しました");
    // 申請一覧のステータスを更新
    startTransition(async () => {
      const fresh = await fetchMyExpenses();
      setExpenses(fresh);
    });
  };

  // ── 再申請処理 ────────────────────────────────
  const handleResubmit = async (id: string): Promise<void> => {
    const result = await resubmitExpense(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("再申請しました！承認待ちに移行しました。");
    // 楽観的更新: expenses の該当行を submitted に変更
    setExpenses((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: "submitted", return_reason: null } : e
      )
    );
    // approver の場合は承認キューも更新
    if (isApprover) {
      startTransition(async () => {
        const freshPending = await fetchPendingApprovals();
        setPendingItems(freshPending);
      });
    }
  };

  // ── 申請の取り消し ────────────────────────────
  const handleDeleteExpense = async (id: string): Promise<void> => {
    const result = await deleteExpense(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("申請を取り消しました");
    // 楽観的更新: 申請一覧・承認キューの両方から即時削除
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    setPendingItems((prev) => prev.filter((e) => e.id !== id));
  };

  const handleReset = () => setAnalyzeResult(null);

  const totalQueueCount = pendingItems.length + approvedItems.length;

  return (
    <div className="space-y-0">
      {/* ── タブヘッダー ─────────────────────────── */}
      <div className="flex border-b border-border overflow-x-auto">
        <TabButton
          active={tab === "new"}
          onClick={() => handleTabChange("new")}
          icon={<PlusCircle className="h-3.5 w-3.5" />}
          label="新規申請"
        />
        <TabButton
          active={tab === "list"}
          onClick={() => handleTabChange("list")}
          icon={<List className="h-3.5 w-3.5" />}
          label="申請一覧"
          badge={expenses.length > 0 ? expenses.length : undefined}
        />
        {isApprover && (
          <TabButton
            active={tab === "approval"}
            onClick={() => handleTabChange("approval")}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            label="承認キュー"
            badge={totalQueueCount > 0 ? totalQueueCount : undefined}
            badgeVariant={totalQueueCount > 0 ? "alert" : "default"}
          />
        )}
      </div>

      {/* ── タブコンテンツ ────────────────────────── */}
      <div className="pt-5">
        {/* 新規申請タブ */}
        {tab === "new" && (
          analyzeResult ? (
            <AnalysisResult
              analysis={analyzeResult.analysis}
              receiptPath={analyzeResult.receiptPath}
              onReset={handleReset}
              onSaved={handleSaved}
            />
          ) : (
            <ReceiptUploader onAnalyzed={handleAnalyzed} />
          )
        )}

        {/* 申請一覧タブ */}
        {tab === "list" && (
          <MyExpensesList
            expenses={expenses}
            isRefreshing={isPending}
            onRefresh={refreshAll}
            onUpdate={handleUpdateExpense}
            onDelete={handleDeleteExpense}
            onResubmit={handleResubmit}
          />
        )}

        {/* 承認キュータブ（admin / approver のみ） */}
        {tab === "approval" && isApprover && (
          <ApprovalQueue
            pendingItems={pendingItems}
            approvedItems={approvedItems}
            actingIds={actingIds}
            isRefreshing={isPending}
            onApprove={handleApprove}
            onReject={(id, reason) => handleReject(id, reason)}
            onReturn={(id, reason, del) => handleReturn(id, reason, del)}
            onMarkPaid={handleMarkPaid}
            onRefresh={refreshAll}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// タブボタン（内部）
// ─────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  badge,
  badgeVariant = "default",
}: {
  active:        boolean;
  onClick:       () => void;
  icon:          React.ReactNode;
  label:         string;
  badge?:        number;
  badgeVariant?: "default" | "alert";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
      )}
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span
          className={cn(
            "ml-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
            badgeVariant === "alert"
              ? active
                ? "bg-orange-500 text-white"
                : "bg-orange-100 text-orange-700"
              : active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
