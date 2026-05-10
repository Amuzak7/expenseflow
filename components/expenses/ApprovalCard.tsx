"use client";

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  FileSearch,
  Loader2,
  User,
  Calendar,
  Banknote,
  Tag,
  CreditCard,
  FileText,
  ExternalLink,
  ImageIcon,
  RotateCcw,
  MessageSquareWarning,
  AlertTriangle,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ExpenseStatusBadge from "@/components/expenses/ExpenseStatusBadge";
import AttachmentList from "@/components/expenses/AttachmentList";
import { getReceiptSignedUrl } from "@/app/(dashboard)/expenses/actions";
import type { PendingExpenseRow } from "@/app/(dashboard)/expenses/actions";
import { toast } from "sonner";

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
    year: "numeric", month: "short", day: "numeric",
  }).format(new Date(dateStr));
}

function formatDateTime(dateStr: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(dateStr));
}

function isPdfPath(path: string | null): boolean {
  return path?.toLowerCase().endsWith(".pdf") ?? false;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ApprovalCardProps {
  expense:   PendingExpenseRow;
  isActing:  boolean;
  onApprove: () => Promise<void>;
  /** reason: 却下理由（必須） */
  onReject:  (reason: string) => Promise<void>;
  /** reason: 差し戻し理由, deleteAttachments: 添付ファイルを削除するか */
  onReturn:  (reason: string, deleteAttachments: boolean) => Promise<void>;
}

// ─────────────────────────────────────────────
// 却下理由ダイアログ
// ─────────────────────────────────────────────

function RejectReasonDialog({
  open,
  onOpenChange,
  onReject,
  isActing,
}: {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onReject:     (reason: string) => Promise<void>;
  isActing:     boolean;
}) {
  const [reason,       setReason]       = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.error("却下理由を入力してください");
      return;
    }
    setIsSubmitting(true);
    onOpenChange(false);
    await onReject(reason.trim());
    setIsSubmitting(false);
    setReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason("");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            却下
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            申請を却下します。却下理由を入力してください。却下後は申請者に通知されます。
          </p>

          {/* 却下理由 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              却下理由 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="却下理由を入力してください（例：領収書の金額が不明瞭、目的の記載が不足など）"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground resize-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
              disabled={isSubmitting || isActing}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length} 文字</p>
          </div>

          {/* 最終確認プレビュー */}
          {reason.trim() && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-destructive">以下の理由で却下します。よろしいですか？</p>
              <p className="text-sm text-foreground leading-relaxed">{reason.trim()}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting || isActing}
          >
            キャンセル
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleConfirm}
            disabled={!reason.trim() || isSubmitting || isActing}
            className="gap-1.5"
          >
            {isSubmitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <XCircle className="h-3.5 w-3.5" />}
            却下する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// 差し戻し理由ダイアログ
// ─────────────────────────────────────────────

function ReturnReasonDialog({
  open,
  onOpenChange,
  onReturn,
  isActing,
}: {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onReturn:     (reason: string, deleteAttachments: boolean) => Promise<void>;
  isActing:     boolean;
}) {
  const [reason,            setReason]            = useState("");
  const [deleteAttachments, setDeleteAttachments] = useState(false);
  const [isSubmitting,      setIsSubmitting]      = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      toast.error("差し戻し理由を入力してください");
      return;
    }
    setIsSubmitting(true);
    onOpenChange(false);
    await onReturn(reason.trim(), deleteAttachments);
    setIsSubmitting(false);
    setReason("");
    setDeleteAttachments(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setReason("");
      setDeleteAttachments(false);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-orange-500" />
            差し戻し
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-sm text-muted-foreground">
            申請者に差し戻す理由を入力してください。申請者は理由を確認したうえで修正・再申請できます。
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              差し戻し理由 <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 領収書の金額と申請額が一致しません。再確認してください。"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground resize-none outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 transition-colors"
              disabled={isSubmitting || isActing}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length} 文字</p>
          </div>

          {/* 添付ファイル削除オプション */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={deleteAttachments}
              onChange={(e) => setDeleteAttachments(e.target.checked)}
              disabled={isSubmitting || isActing}
              className="mt-0.5 h-4 w-4 rounded border-input accent-orange-500 cursor-pointer"
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground leading-snug group-hover:text-orange-700 transition-colors">
                この申請の添付ファイルを削除する
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                個人情報が含まれる場合などにチェックしてください。チェックを入れると、添付ファイルが Supabase Storage から完全に削除されます。申請者は再申請時に新しいファイルをアップロードできます。
              </p>
            </div>
          </label>

          {deleteAttachments && (
            <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 text-xs text-orange-800">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px text-orange-600" />
              <p>添付ファイルはすべて削除されます。この操作は元に戻せません。</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isSubmitting || isActing}
          >
            キャンセル
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!reason.trim() || isSubmitting || isActing}
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white border-transparent"
          >
            {isSubmitting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <MessageSquareWarning className="h-3.5 w-3.5" />}
            差し戻す
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// 詳細ダイアログ
// ─────────────────────────────────────────────

function DetailDialog({
  expense,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onReturn,
  isActing,
}: {
  expense:      PendingExpenseRow;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  onApprove:    () => Promise<void>;
  onReject:     (reason: string) => Promise<void>;
  onReturn:     (reason: string, deleteAttachments: boolean) => Promise<void>;
  isActing:     boolean;
}) {
  const [receiptUrl,       setReceiptUrl]       = useState<string | null>(null);
  const [isLoadingUrl,     setIsLoadingUrl]     = useState(false);
  const [receiptError,     setReceiptError]     = useState<string | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);

  const analysis   = expense.analysis as Record<string, unknown> | null;
  const confidence = (analysis?.confidence as string) ?? null;
  const rawText    = (analysis?.rawText as string) ?? null;

  const handleLoadReceipt = async () => {
    if (!expense.receipt_path) return;
    setIsLoadingUrl(true);
    setReceiptError(null);
    const result = await getReceiptSignedUrl(expense.receipt_path);
    setIsLoadingUrl(false);
    if (!result.ok) { setReceiptError(result.error); return; }
    if (isPdfPath(expense.receipt_path)) {
      window.open(result.data, "_blank", "noopener,noreferrer");
    } else {
      setReceiptUrl(result.data);
    }
  };

  const handleApprove = async () => {
    onOpenChange(false);
    await onApprove();
  };

  const handleReject = async (reason: string) => {
    onOpenChange(false);
    await onReject(reason);
  };

  const handleReturn = async (reason: string, deleteAttachments: boolean) => {
    onOpenChange(false);
    await onReturn(reason, deleteAttachments);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>申請詳細</DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              <ExpenseStatusBadge status={expense.status} />
              <span className="text-xs text-muted-foreground">
                申請: {formatDateTime(expense.created_at)}
              </span>
            </div>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            {/* 申請者 */}
            <div className="flex items-center gap-2 py-2 border-b border-border">
              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">申請者</span>
              <span className="font-medium ml-auto">{expense.submitterName ?? "—"}</span>
            </div>

            {/* 基本情報グリッド */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DetailRow icon={<Calendar className="h-3.5 w-3.5" />}   label="日付"       value={formatDate(expense.date)} />
              <DetailRow icon={<Banknote className="h-3.5 w-3.5" />}   label="金額（税込）" value={formatAmount(expense.amount)} highlight />
              {expense.tax_amount != null && (
                <DetailRow icon={<Banknote className="h-3.5 w-3.5 opacity-0" />} label="うち消費税" value={formatAmount(expense.tax_amount)} />
              )}
              <DetailRow icon={<Tag className="h-3.5 w-3.5" />}        label="カテゴリ"   value={expense.category ?? "—"} />
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

            {/* 添付ファイル */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Paperclip className="h-3.5 w-3.5" />
                添付ファイル
              </div>
              <AttachmentList expenseId={expense.id} canDelete={false} />
            </div>

            {/* AI解析精度 */}
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
                  <img src={receiptUrl} alt="領収書" className="w-full rounded-lg border border-border object-contain max-h-64" />
                ) : (
                  <Button variant="outline" size="sm" onClick={handleLoadReceipt} disabled={isLoadingUrl} className="gap-1.5">
                    {isLoadingUrl
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : isPdfPath(expense.receipt_path)
                        ? <ExternalLink className="h-3.5 w-3.5" />
                        : <ImageIcon className="h-3.5 w-3.5" />}
                    {isPdfPath(expense.receipt_path) ? "PDFを別タブで表示" : "領収書を表示"}
                  </Button>
                )}
                {receiptError && <p className="text-xs text-destructive">{receiptError}</p>}
              </div>
            )}

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
          </div>

          {/* フッター: 差し戻し / 却下 / 承認 */}
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnDialogOpen(true)}
              disabled={isActing}
              className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              差し戻し
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setRejectDialogOpen(true)}
              disabled={isActing}
              className="gap-1.5"
            >
              <XCircle className="h-3.5 w-3.5" />
              却下
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isActing}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white border-transparent"
            >
              {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              承認
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 却下理由ダイアログ（詳細から） */}
      <RejectReasonDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        onReject={handleReject}
        isActing={isActing}
      />

      {/* 差し戻し理由ダイアログ（詳細から） */}
      <ReturnReasonDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        onReturn={handleReturn}
        isActing={isActing}
      />
    </>
  );
}

function DetailRow({ icon, label, value, highlight }: {
  icon: React.ReactNode; label: string; value: string; highlight?: boolean;
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
    high:   { label: "高精度", className: "text-green-700" },
    medium: { label: "中程度", className: "text-yellow-700" },
    low:    { label: "低精度", className: "text-red-700" },
  };
  const cfg = map[confidence] ?? { label: confidence, className: "text-muted-foreground" };
  return <span className={`font-medium ${cfg.className}`}>{cfg.label}</span>;
}

// ─────────────────────────────────────────────
// メインカード
// ─────────────────────────────────────────────

export default function ApprovalCard({
  expense,
  isActing,
  onApprove,
  onReject,
  onReturn,
}: ApprovalCardProps) {
  const [dialogOpen,       setDialogOpen]       = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);

  return (
    <>
      <li className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/20">
        {/* 左: 申請者 + 主要情報 */}
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
              申請: {formatDate(expense.created_at)}
            </span>
          </div>
        </div>

        {/* 中央: 金額 */}
        <div className="text-right sm:text-center">
          <p className="text-base font-bold text-foreground tabular-nums">
            {formatAmount(expense.amount)}
          </p>
          {expense.tax_amount != null && (
            <p className="text-xs text-muted-foreground">税 {formatAmount(expense.tax_amount)}</p>
          )}
        </div>

        {/* 右: アクションボタン */}
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} disabled={isActing}>
            <FileSearch className="h-3.5 w-3.5" />
            詳細
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setReturnDialogOpen(true)}
            disabled={isActing}
            className="gap-1 text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-400"
          >
            {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            差し戻し
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setRejectDialogOpen(true)}
            disabled={isActing}
            className="gap-1"
          >
            {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            却下
          </Button>

          <Button
            size="sm"
            onClick={onApprove}
            disabled={isActing}
            className="gap-1 bg-green-600 hover:bg-green-700 text-white border-transparent"
          >
            {isActing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            承認
          </Button>
        </div>
      </li>

      {/* 詳細ダイアログ */}
      <DetailDialog
        expense={expense}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onApprove={onApprove}
        onReject={onReject}
        onReturn={onReturn}
        isActing={isActing}
      />

      {/* 却下理由ダイアログ（カードから直接） */}
      <RejectReasonDialog
        open={rejectDialogOpen}
        onOpenChange={setRejectDialogOpen}
        onReject={onReject}
        isActing={isActing}
      />

      {/* 差し戻し理由ダイアログ（カードから直接） */}
      <ReturnReasonDialog
        open={returnDialogOpen}
        onOpenChange={setReturnDialogOpen}
        onReturn={onReturn}
        isActing={isActing}
      />
    </>
  );
}
