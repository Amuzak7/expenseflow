"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Calendar,
  Banknote,
  Tag,
  CreditCard,
  FileText,
  FileSearch,
  ImageIcon,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
  ArrowLeft,
  AlertTriangle,
  Send,
  Target,
  Paperclip,
  RotateCcw,
  MessageSquareWarning,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ExpenseStatusBadge from "@/components/expenses/ExpenseStatusBadge";
import {
  getReceiptSignedUrl,
  uploadExpenseAttachments,
  type ExpenseRow,
  type UpdateExpenseInput,
} from "@/app/(dashboard)/expenses/actions";
import AttachmentUploader from "@/components/expenses/AttachmentUploader";
import AttachmentList from "@/components/expenses/AttachmentList";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const CATEGORIES    = ["交通費", "食費", "宿泊費", "接待費", "消耗品費", "通信費", "その他"] as const;
const PAYMENT_METHODS = ["現金", "クレジットカード", "電子マネー", "銀行振込", "その他"] as const;

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

function fmtDateTime(s: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(s));
}

function isPdf(path: string | null): boolean {
  return path?.toLowerCase().endsWith(".pdf") ?? false;
}

// ─────────────────────────────────────────────
// フォームスキーマ（編集用）
// ─────────────────────────────────────────────

const editSchema = z.object({
  purpose:       z.string().min(1, "目的・用途を入力してください"),
  date:          z.string().min(1, "日付を入力してください"),
  amount:        z.string().min(1, "金額を入力してください").refine(
    (v) => Number.isInteger(Number(v)) && Number(v) > 0,
    "正の整数を入力してください"
  ),
  taxAmount:     z.string().optional(),
  vendor:        z.string().min(1, "取引先を入力してください"),
  category:      z.string().min(1, "カテゴリを選択してください"),
  description:   z.string().optional(),
  paymentMethod: z.string().min(1, "支払方法を選択してください"),
});

type EditFormValues = z.infer<typeof editSchema>;

// ─────────────────────────────────────────────
// モーダルモード
// ─────────────────────────────────────────────

type ModalMode = "view" | "edit" | "confirmDelete" | "confirmResubmit";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ExpenseDetailModalProps {
  expense:      ExpenseRow | null;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate:     (id: string, data: UpdateExpenseInput) => Promise<boolean>;
  onDelete:     (id: string) => Promise<void>;
  onResubmit:   (id: string) => Promise<void>;
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function ExpenseDetailModal({
  expense,
  open,
  onOpenChange,
  onUpdate,
  onDelete,
  onResubmit,
}: ExpenseDetailModalProps) {
  const [mode, setMode] = useState<ModalMode>("view");

  // モーダルが閉じられたときにモードをリセット
  const handleOpenChange = (next: boolean) => {
    if (!next) setMode("view");
    onOpenChange(next);
  };

  if (!expense) return null;

  // 編集可能: 承認待ち・差し戻しのみ
  const canEdit = expense.status === "submitted" || expense.status === "returned";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto">
        {mode === "view" && (
          <ViewMode
            expense={expense}
            canEdit={canEdit}
            onEdit={() => setMode("edit")}
            onDelete={() => setMode("confirmDelete")}
            onResubmit={() => setMode("confirmResubmit")}
            onClose={() => handleOpenChange(false)}
          />
        )}
        {mode === "edit" && (
          <EditMode
            expense={expense}
            onBack={() => setMode("view")}
            onClose={() => handleOpenChange(false)}
            onUpdate={onUpdate}
          />
        )}
        {mode === "confirmDelete" && (
          <ConfirmDeleteMode
            expense={expense}
            onBack={() => setMode("view")}
            onDelete={async () => {
              await onDelete(expense.id);
              handleOpenChange(false);
            }}
          />
        )}
        {mode === "confirmResubmit" && (
          <ConfirmResubmitMode
            expense={expense}
            onBack={() => setMode("view")}
            onResubmit={async () => {
              await onResubmit(expense.id);
              handleOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// 表示モード
// ─────────────────────────────────────────────

function ViewMode({
  expense,
  canEdit,
  onEdit,
  onDelete,
  onResubmit,
  onClose,
}: {
  expense:    ExpenseRow;
  canEdit:    boolean;
  onEdit:     () => void;
  onDelete:   () => void;
  onResubmit: () => void;
  onClose:    () => void;
}) {
  const [receiptUrl, setReceiptUrl]     = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  const analysis = expense.analysis as Record<string, unknown> | null;
  const confidence = (analysis?.confidence as string) ?? null;
  const rawText    = (analysis?.rawText as string) ?? null;

  const handleLoadReceipt = async () => {
    if (!expense.receipt_path) return;
    setIsLoadingUrl(true);
    setReceiptError(null);
    const result = await getReceiptSignedUrl(expense.receipt_path);
    setIsLoadingUrl(false);
    if (!result.ok) { setReceiptError(result.error); return; }
    if (isPdf(expense.receipt_path)) {
      window.open(result.data, "_blank", "noopener,noreferrer");
    } else {
      setReceiptUrl(result.data);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>申請詳細</DialogTitle>
        <div className="flex items-center gap-2 mt-1">
          <ExpenseStatusBadge status={expense.status} />
          <span className="text-xs text-muted-foreground">
            申請: {fmtDateTime(expense.created_at)}
          </span>
          {expense.paid_at && (
            <span className="text-xs text-muted-foreground">
              支払: {fmtDateTime(expense.paid_at)}
            </span>
          )}
        </div>
      </DialogHeader>

      <div className="space-y-4 text-sm">
        {/* 却下理由バナー */}
        {expense.status === "rejected" && expense.rejection_reason && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
            <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-destructive mb-0.5">却下理由</p>
              <p className="text-sm text-foreground">{expense.rejection_reason}</p>
            </div>
          </div>
        )}

        {/* 差し戻し理由バナー */}
        {expense.status === "returned" && expense.return_reason && (
          <div className="flex items-start gap-2.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5">
            <MessageSquareWarning className="h-4 w-4 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-orange-700 mb-0.5">差し戻し理由</p>
              <p className="text-sm text-orange-800">{expense.return_reason}</p>
            </div>
          </div>
        )}

        {/* 目的・用途 */}
        {expense.purpose && (
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
              <Target className="h-3.5 w-3.5" />
              目的・用途
            </div>
            <p className="font-medium text-foreground">{expense.purpose}</p>
          </div>
        )}

        {/* 基本情報グリッド */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <DetailRow icon={<Calendar className="h-3.5 w-3.5" />}  label="日付"       value={fmtDate(expense.date)} />
          <DetailRow icon={<Banknote className="h-3.5 w-3.5" />}  label="金額（税込）" value={fmtAmount(expense.amount)} highlight />
          {expense.tax_amount != null && (
            <DetailRow icon={<Banknote className="h-3.5 w-3.5 opacity-0" />} label="うち消費税" value={fmtAmount(expense.tax_amount)} />
          )}
          <DetailRow icon={<Tag className="h-3.5 w-3.5" />}       label="カテゴリ"   value={expense.category ?? "—"} />
          <DetailRow icon={<CreditCard className="h-3.5 w-3.5" />} label="支払方法"   value={expense.payment_method ?? "—"} />
        </div>

        {/* 取引先 */}
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5">取引先・店舗名</p>
          <p className="font-medium">{expense.vendor ?? "—"}</p>
        </div>

        {/* 摘要 */}
        {expense.description && (
          <div className="rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground mb-0.5">摘要・品目</p>
            <p>{expense.description}</p>
          </div>
        )}

        {/* AI 解析精度 */}
        {confidence && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileSearch className="h-3.5 w-3.5" />
            <span>AI解析精度:</span>
            <ConfidenceLabel confidence={confidence} />
          </div>
        )}

        {/* 領収書 */}
        {expense.receipt_path && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">領収書</p>
            {receiptUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={receiptUrl}
                alt="領収書"
                className="w-full rounded-lg border border-border object-contain max-h-72"
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoadReceipt}
                disabled={isLoadingUrl}
                className="gap-1.5"
              >
                {isLoadingUrl ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isPdf(expense.receipt_path) ? (
                  <ExternalLink className="h-3.5 w-3.5" />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5" />
                )}
                {isPdf(expense.receipt_path) ? "PDFを別タブで表示" : "領収書を表示"}
              </Button>
            )}
            {receiptError && <p className="text-xs text-destructive">{receiptError}</p>}
          </div>
        )}

        {/* 添付ファイル */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Paperclip className="h-3.5 w-3.5" />
            添付ファイル
          </div>
          <AttachmentList
            expenseId={expense.id}
            canDelete={expense.status === "submitted" || expense.status === "returned"}
          />
        </div>

        {/* 生テキスト */}
        {rawText && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 rounded-lg select-none flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              AIが読み取ったテキスト全文
            </summary>
            <pre className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words border-t border-border">
              {rawText}
            </pre>
          </details>
        )}

        {/* 編集不可メッセージ */}
        {!canEdit && (
          <p className="text-xs text-muted-foreground text-center py-1">
            ※ 承認待ち・差し戻し以外の申請は編集・取り消しできません
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        {canEdit ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="gap-1.5 text-destructive hover:text-destructive hover:border-destructive/50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              取り消し
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              編集
            </Button>
            {/* 差し戻し申請のみ: 再申請ボタン */}
            {expense.status === "returned" && (
              <Button
                size="sm"
                onClick={onResubmit}
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white border-transparent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                再申請する
              </Button>
            )}
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onClose}>
            閉じる
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// ─────────────────────────────────────────────
// 編集モード
// ─────────────────────────────────────────────

function EditMode({
  expense,
  onBack,
  onClose,
  onUpdate,
}: {
  expense:  ExpenseRow;
  onBack:   () => void;
  onClose:  () => void;
  onUpdate: (id: string, data: UpdateExpenseInput) => Promise<boolean>;
}) {
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      purpose:       expense.purpose ?? "",
      date:          expense.date ?? "",
      amount:        expense.amount?.toString() ?? "",
      taxAmount:     expense.tax_amount?.toString() ?? "",
      vendor:        expense.vendor ?? "",
      category:      expense.category ?? "",
      description:   expense.description ?? "",
      paymentMethod: expense.payment_method ?? "",
    },
  });

  const onSubmit = async (values: EditFormValues) => {
    // 1. フォーム内容を保存
    const ok = await onUpdate(expense.id, {
      purpose:       values.purpose,
      date:          values.date,
      amount:        parseInt(values.amount, 10),
      taxAmount:     values.taxAmount && values.taxAmount !== ""
                       ? parseInt(values.taxAmount, 10)
                       : undefined,
      vendor:        values.vendor,
      category:      values.category,
      description:   values.description || undefined,
      paymentMethod: values.paymentMethod,
    });
    if (!ok) return;

    // 2. 新規添付ファイルがあればアップロード
    if (newFiles.length > 0) {
      const fd = new FormData();
      newFiles.forEach((f) => fd.append("files", f));
      const attachResult = await uploadExpenseAttachments(expense.id, fd);

      if (!attachResult.ok) {
        toast.warning("内容を保存しましたが、添付ファイルのアップロードに失敗しました。詳細画面から再度お試しください。");
      } else if (attachResult.data.errors.length > 0) {
        toast.warning(`保存しました。一部の添付ファイルのアップロードに失敗しました: ${attachResult.data.errors.join("、")}`);
      }
    }

    // 新規ファイル選択をリセットして詳細画面に戻る
    setNewFiles([]);
    onBack();
  };

  const selectCls = cn(
    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm",
    "transition-colors outline-none",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50"
  );

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 hover:bg-muted transition-colors"
            disabled={isSubmitting}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>申請を編集</DialogTitle>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 目的・用途（全幅） */}
        <Field label="目的・用途 *" error={errors.purpose?.message}>
          <Input
            type="text"
            placeholder="例: A社との商談、社内会議の資料費"
            {...register("purpose")}
            disabled={isSubmitting}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 日付 */}
          <Field label="日付" error={errors.date?.message}>
            <Input type="date" {...register("date")} disabled={isSubmitting} />
          </Field>

          {/* 取引先 */}
          <Field label="取引先・店舗名" error={errors.vendor?.message}>
            <Input type="text" placeholder="例: 株式会社サンプル" {...register("vendor")} disabled={isSubmitting} />
          </Field>

          {/* 金額 */}
          <Field label="金額（税込・円）" error={errors.amount?.message}>
            <Input type="number" min={1} placeholder="例: 1500" {...register("amount")} disabled={isSubmitting} />
          </Field>

          {/* 消費税 */}
          <Field label="消費税額（円）" error={errors.taxAmount?.message}>
            <Input type="number" min={0} placeholder="例: 136" {...register("taxAmount")} disabled={isSubmitting} />
          </Field>

          {/* カテゴリ */}
          <Field label="カテゴリ" error={errors.category?.message}>
            <select {...register("category")} className={selectCls} disabled={isSubmitting}>
              <option value="">選択してください</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {/* 支払方法 */}
          <Field label="支払方法" error={errors.paymentMethod?.message}>
            <select {...register("paymentMethod")} className={selectCls} disabled={isSubmitting}>
              <option value="">選択してください</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>

        {/* 摘要 */}
        <Field label="摘要・品目" error={errors.description?.message}>
          <Input type="text" placeholder="例: 東京-大阪間 新幹線代" {...register("description")} disabled={isSubmitting} />
        </Field>

        {/* ── 添付ファイル ──────────────────────── */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Paperclip className="h-3.5 w-3.5" />
            添付ファイル
          </div>

          {/* 既存の添付ファイル一覧（削除可） */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">現在の添付ファイル</p>
            <AttachmentList
              expenseId={expense.id}
              canDelete={!isSubmitting}
            />
          </div>

          <div className="border-t border-border/60 pt-2 space-y-2">
            <p className="text-xs text-muted-foreground">新しいファイルを追加</p>

            {/* 個人情報マスキング注意書き */}
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px text-amber-600" />
              <p className="leading-relaxed">
                個人情報が含まれる資料（参加者名簿など）は、
                <strong className="font-semibold">必要最小限の情報にマスキングしてから</strong>
                添付してください。
              </p>
            </div>

            <AttachmentUploader
              files={newFiles}
              onChange={setNewFiles}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={isSubmitting}>
            キャンセル
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {isSubmitting ? "保存中…" : "保存する"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

// ─────────────────────────────────────────────
// 取り消し確認モード
// ─────────────────────────────────────────────

function ConfirmDeleteMode({
  expense,
  onBack,
  onDelete,
}: {
  expense:  ExpenseRow;
  onBack:   () => void;
  onDelete: () => Promise<void>;
}) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 hover:bg-muted transition-colors"
            disabled={isDeleting}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>申請の取り消し</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-destructive">この申請を取り消しますか？</p>
            <p className="text-muted-foreground">取り消すと、申請データと領収書ファイルが削除されます。この操作は元に戻せません。</p>
          </div>
        </div>

        {/* 対象申請の概要 */}
        <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">取引先</span>
            <span className="font-medium">{expense.vendor ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">金額</span>
            <span className="font-medium tabular-nums">
              {expense.amount != null
                ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(expense.amount)
                : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">日付</span>
            <span>{fmtDate(expense.date)}</span>
          </div>
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isDeleting}>
          戻る
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="gap-1.5"
        >
          {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {isDeleting ? "取り消し中…" : "取り消す"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─────────────────────────────────────────────
// 再申請確認モード
// ─────────────────────────────────────────────

function ConfirmResubmitMode({
  expense,
  onBack,
  onResubmit,
}: {
  expense:    ExpenseRow;
  onBack:     () => void;
  onResubmit: () => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleResubmit = async () => {
    setIsSubmitting(true);
    await onResubmit();
    setIsSubmitting(false);
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 hover:bg-muted transition-colors"
            disabled={isSubmitting}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle>再申請の確認</DialogTitle>
        </div>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
          <RotateCcw className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-orange-800">この申請を再提出しますか？</p>
            <p className="text-orange-700/80">
              再申請すると「承認待ち」ステータスに戻り、承認者に通知されます。
            </p>
          </div>
        </div>

        {expense.return_reason && (
          <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
            <p className="text-xs text-muted-foreground font-medium">差し戻し理由（参考）</p>
            <p className="text-foreground">{expense.return_reason}</p>
          </div>
        )}

        <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">取引先</span>
            <span className="font-medium">{expense.vendor ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">金額</span>
            <span className="font-medium tabular-nums">
              {expense.amount != null
                ? new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY" }).format(expense.amount)
                : "—"}
            </span>
          </div>
          {expense.purpose && (
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground shrink-0">目的</span>
              <span className="text-right">{expense.purpose}</span>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button variant="outline" size="sm" onClick={onBack} disabled={isSubmitting}>
          戻る
        </Button>
        <Button
          size="sm"
          onClick={handleResubmit}
          disabled={isSubmitting}
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white border-transparent"
        >
          {isSubmitting
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RotateCcw className="h-3.5 w-3.5" />}
          {isSubmitting ? "再申請中…" : "再申請する"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─────────────────────────────────────────────
// 内部: フィールド行
// ─────────────────────────────────────────────

function DetailRow({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</div>
      <p className={highlight ? "font-semibold text-base" : "font-medium"}>{value}</p>
    </div>
  );
}

function ConfidenceLabel({ confidence }: { confidence: string }) {
  const map: Record<string, { label: string; className: string }> = {
    high:   { label: "高精度", className: "text-green-700 font-medium" },
    medium: { label: "中程度", className: "text-yellow-700 font-medium" },
    low:    { label: "低精度", className: "text-red-700 font-medium" },
  };
  const cfg = map[confidence] ?? { label: confidence, className: "text-muted-foreground" };
  return <span className={cfg.className}>{cfg.label}</span>;
}

function Field({
  label, error, children,
}: {
  label: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
