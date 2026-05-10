"use client";

import { useState, useTransition } from "react";
import {
  Receipt,
  ShieldCheck,
  Tags,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Save,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpenseRulesData, ExpenseCategory } from "./actions";
import {
  upsertExpenseRules,
  addExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
} from "./actions";

// ─────────────────────────────────────────────
// デフォルト科目候補（未登録時のサジェスト）
// ─────────────────────────────────────────────

const SUGGESTED_CATEGORIES = [
  "交通費", "宿泊費", "接待費", "消耗品費",
  "通信費", "会議費", "研修費", "広告費", "その他",
];

interface ExpenseRulesTabProps {
  initialData: ExpenseRulesData;
}

export default function ExpenseRulesTab({ initialData }: ExpenseRulesTabProps) {
  // ── 承認ルール ──────────────────────────────
  const [approvalMode, setApprovalMode] = useState<"always" | "threshold">(
    initialData.rule.approval_required_amount == null ? "always" : "threshold"
  );
  const [approvalAmount, setApprovalAmount] = useState(
    initialData.rule.approval_required_amount?.toString() ?? "10000"
  );

  // ── 領収書ルール ────────────────────────────
  const [receiptMode, setReceiptMode] = useState<"none" | "threshold">(
    initialData.rule.receipt_required_amount == null ? "none" : "threshold"
  );
  const [receiptAmount, setReceiptAmount] = useState(
    initialData.rule.receipt_required_amount?.toString() ?? "5000"
  );

  const [isSavingRules, startRulesTransition] = useTransition();

  // ── 科目 ────────────────────────────────────
  const [categories, setCategories] = useState<ExpenseCategory[]>(
    initialData.categories
  );
  const [newCatName,  setNewCatName]  = useState("");
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isAddingCat, startCatTransition] = useTransition();

  // ── ルール保存 ───────────────────────────────
  const handleSaveRules = () => {
    startRulesTransition(async () => {
      const approvalVal =
        approvalMode === "always"
          ? null
          : parseInt(approvalAmount, 10) || 0;
      const receiptVal =
        receiptMode === "none"
          ? null
          : parseInt(receiptAmount, 10) || 0;

      const result = await upsertExpenseRules({
        approval_required_amount: approvalVal,
        receipt_required_amount:  receiptVal,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("経費ルールを保存しました");
      }
    });
  };

  // ── 科目追加 ─────────────────────────────────
  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    startCatTransition(async () => {
      const result = await addExpenseCategory(newCatName.trim());
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.category) {
          setCategories((prev) => [...prev, result.category!]);
        }
        setNewCatName("");
        toast.success("科目を追加しました");
      }
    });
  };

  // ── サジェストから追加 ────────────────────────
  const handleAddSuggested = (name: string) => {
    startCatTransition(async () => {
      const result = await addExpenseCategory(name);
      if (result.error) {
        toast.error(result.error);
      } else {
        if (result.category) {
          setCategories((prev) => [...prev, result.category!]);
        }
        toast.success(`「${name}」を追加しました`);
      }
    });
  };

  // ── 科目名編集開始 ───────────────────────────
  const startEdit = (cat: ExpenseCategory) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
  };

  // ── 科目名編集確定 ───────────────────────────
  const commitEdit = async (id: string) => {
    if (!editingName.trim()) {
      setEditingId(null);
      return;
    }
    const prevName = categories.find((c) => c.id === id)?.name ?? "";
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: editingName.trim() } : c))
    );
    setEditingId(null);
    const result = await updateExpenseCategory(id, editingName.trim());
    if (result.error) {
      toast.error(result.error);
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? { ...c, name: prevName } : c))
      );
    }
  };

  // ── 科目削除 ─────────────────────────────────
  const handleDelete = async (id: string, name: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    const result = await deleteExpenseCategory(id);
    if (result.error) {
      toast.error(result.error);
      setCategories(initialData.categories);
    } else {
      toast.success(`「${name}」を削除しました`);
    }
  };

  // ── サジェスト（未登録のもののみ）─────────────
  const existingNames = new Set(categories.map((c) => c.name));
  const suggestions   = SUGGESTED_CATEGORIES.filter((s) => !existingNames.has(s));

  return (
    <div className="space-y-5">
      {/* ── 承認ルール ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">承認ルール</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          閾値未満の経費申請は自動承認されます。常に承認必要に設定すると全申請が審査されます。
        </p>

        <div className="space-y-2">
          {/* 常に承認必要 */}
          <label className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
            approvalMode === "always"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/40"
          )}>
            <input
              type="radio"
              className="accent-primary"
              checked={approvalMode === "always"}
              onChange={() => setApprovalMode("always")}
            />
            <div>
              <p className="text-sm font-medium text-foreground">
                すべての申請に承認が必要
              </p>
              <p className="text-xs text-muted-foreground">
                金額に関わらず、すべての経費申請を審査します
              </p>
            </div>
          </label>

          {/* 金額閾値 */}
          <label className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
            approvalMode === "threshold"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/40"
          )}>
            <input
              type="radio"
              className="accent-primary mt-0.5"
              checked={approvalMode === "threshold"}
              onChange={() => setApprovalMode("threshold")}
            />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  一定金額以上の申請のみ承認が必要
                </p>
                <p className="text-xs text-muted-foreground">
                  設定額未満は申請直後に自動承認されます
                </p>
              </div>
              {approvalMode === "threshold" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={approvalAmount}
                    onChange={(e) => setApprovalAmount(e.target.value)}
                    className="h-8 w-32"
                    min={1}
                  />
                  <span className="text-sm text-muted-foreground">円以上</span>
                </div>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* ── 領収書ルール ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">領収書ルール</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          設定した金額以上の経費申請には領収書の添付を必須にします。
        </p>

        <div className="space-y-2">
          {/* 不要 */}
          <label className={cn(
            "flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
            receiptMode === "none"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/40"
          )}>
            <input
              type="radio"
              className="accent-primary"
              checked={receiptMode === "none"}
              onChange={() => setReceiptMode("none")}
            />
            <div>
              <p className="text-sm font-medium text-foreground">領収書不要</p>
              <p className="text-xs text-muted-foreground">
                添付は任意です
              </p>
            </div>
          </label>

          {/* 金額閾値 */}
          <label className={cn(
            "flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors",
            receiptMode === "threshold"
              ? "border-primary bg-primary/5"
              : "border-border hover:bg-muted/40"
          )}>
            <input
              type="radio"
              className="accent-primary mt-0.5"
              checked={receiptMode === "threshold"}
              onChange={() => setReceiptMode("threshold")}
            />
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  一定金額以上は領収書必須
                </p>
                <p className="text-xs text-muted-foreground">
                  設定額以上の申請では領収書の添付が必要になります
                </p>
              </div>
              {receiptMode === "threshold" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={receiptAmount}
                    onChange={(e) => setReceiptAmount(e.target.value)}
                    className="h-8 w-32"
                    min={1}
                  />
                  <span className="text-sm text-muted-foreground">円以上</span>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* 保存ボタン */}
        <div className="flex justify-end pt-1 border-t border-border">
          <Button onClick={handleSaveRules} disabled={isSavingRules}>
            {isSavingRules ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSavingRules ? "保存中..." : "ルールを保存"}
          </Button>
        </div>
      </div>

      {/* ── 経費科目管理 ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">経費科目</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {categories.length} 件
          </span>
        </div>

        {/* 科目一覧 */}
        {categories.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Tags className="h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              科目がまだ登録されていません
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {categories.map((cat) => (
              <li key={cat.id} className="flex items-center gap-2 px-5 py-2.5">
                {editingId === cat.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-7 flex-1 text-sm"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter")  commitEdit(cat.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => commitEdit(cat.id)}
                      className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-foreground">
                      {cat.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => startEdit(cat)}
                      className="text-muted-foreground hover:text-foreground"
                      title="名前を変更"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(cat.id, cat.name)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="削除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* 新規追加フォーム */}
        <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
          <Input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="新しい科目名を入力..."
            className="h-8 flex-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddCategory();
            }}
          />
          <Button
            size="sm"
            onClick={handleAddCategory}
            disabled={isAddingCat || !newCatName.trim()}
          >
            {isAddingCat ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            追加
          </Button>
        </div>

        {/* サジェスト */}
        {suggestions.length > 0 && (
          <div className="px-5 py-3 border-t border-border">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <p className="text-xs text-muted-foreground font-medium">
                よく使われる科目
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => handleAddSuggested(s)}
                  disabled={isAddingCat}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                >
                  <Plus className="h-2.5 w-2.5" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
