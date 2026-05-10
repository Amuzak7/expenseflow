"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, AlertTriangle, Minus, RotateCcw, Send, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ReceiptAnalysis } from "@/lib/claude-vision";
import { saveExpense, uploadExpenseAttachments } from "@/app/(dashboard)/expenses/actions";
import AttachmentUploader from "@/components/expenses/AttachmentUploader";
import { toast } from "sonner";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

const CATEGORIES = ["交通費", "食費", "宿泊費", "接待費", "消耗品費", "通信費", "その他"] as const;
const PAYMENT_METHODS = ["現金", "クレジットカード", "電子マネー", "銀行振込", "その他"] as const;

// ─────────────────────────────────────────────
// フォームスキーマ（HTML input は string を返すため string ベース）
// ─────────────────────────────────────────────

const expenseFormSchema = z.object({
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

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AnalysisResultProps {
  analysis:    ReceiptAnalysis;
  receiptPath: string;
  onReset:     () => void;
  onSaved:     (expenseId: string) => void;
}

// ─────────────────────────────────────────────
// 信頼度バッジ
// ─────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: ReceiptAnalysis["confidence"] }) {
  if (confidence === "high") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" />
        高精度
      </span>
    );
  }
  if (confidence === "medium") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
        <AlertTriangle className="h-3 w-3" />
        中程度
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      <Minus className="h-3 w-3" />
      低精度
    </span>
  );
}

// ─────────────────────────────────────────────
// フォームフィールド共通ラッパー
// ─────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function AnalysisResult({
  analysis,
  receiptPath,
  onReset,
  onSaved,
}: AnalysisResultProps) {
  // 添付ファイルの状態管理
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful, isDirty },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      purpose:       "",
      date:          analysis.date          ?? "",
      amount:        analysis.amount?.toString() ?? "",
      taxAmount:     analysis.taxAmount?.toString() ?? "",
      vendor:        analysis.vendor        ?? "",
      category:      analysis.category      ?? "",
      description:   analysis.description   ?? "",
      paymentMethod: analysis.paymentMethod ?? "",
    },
  });

  const handleCancel = () => {
    if (isDirty || attachmentFiles.length > 0) {
      if (!window.confirm("入力内容が失われますが、キャンセルしてよいですか？")) return;
    }
    onReset();
  };

  const onSubmit = async (values: ExpenseFormValues) => {
    // 1. 経費申請を保存
    const result = await saveExpense({
      receiptPath,
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
      analysis,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    const expenseId = result.data.id;

    // 2. 添付ファイルがある場合はアップロード（失敗しても申請自体は完了）
    if (attachmentFiles.length > 0) {
      const fd = new FormData();
      attachmentFiles.forEach((f) => fd.append("files", f));
      const attachResult = await uploadExpenseAttachments(expenseId, fd);

      if (attachResult.ok && attachResult.data.errors.length > 0) {
        // 一部失敗
        toast.warning(
          `申請しました。ただし一部の添付ファイルのアップロードに失敗しました: ${attachResult.data.errors.join("、")}`
        );
      } else if (!attachResult.ok) {
        toast.warning("申請しました。添付ファイルのアップロードに失敗しました。詳細画面から再度お試しください。");
      } else {
        toast.success("申請しました！承認待ちに移行しました。");
      }
    } else {
      toast.success("申請しました！承認待ちに移行しました。");
    }

    onSaved(expenseId);
  };

  const selectClass = cn(
    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm",
    "transition-colors outline-none",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "disabled:cursor-not-allowed disabled:opacity-50"
  );

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
          <span className="font-semibold text-foreground">解析完了</span>
          <ConfidenceBadge confidence={analysis.confidence} />
        </div>
        <Button variant="ghost" size="sm" onClick={onReset} disabled={isSubmitting}>
          <RotateCcw className="h-3.5 w-3.5" />
          新しい領収書
        </Button>
      </div>

      {analysis.confidence === "low" && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50/50 p-3 text-sm text-yellow-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>解析精度が低い項目があります。内容を確認・修正してから申請してください。</span>
        </div>
      )}

      {/* フォームバリデーションエラー全体サマリー */}
      {Object.keys(errors).length > 0 && !isSubmitSuccessful && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">入力内容を確認してください</p>
            <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside">
              {Object.entries(errors).map(([key, err]) => (
                err?.message ? <li key={key}>{err.message as string}</li> : null
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* フォーム */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 目的・用途（全幅） */}
        <Field label="目的・用途 *" error={errors.purpose?.message}>
          <Input
            type="text"
            placeholder="例: A社との商談、社内会議の資料費、B社への提案"
            {...register("purpose")}
            aria-invalid={!!errors.purpose}
            disabled={isSubmitting}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* 日付 */}
          <Field label="日付" error={errors.date?.message}>
            <Input
              type="date"
              {...register("date")}
              aria-invalid={!!errors.date}
              disabled={isSubmitting}
            />
          </Field>

          {/* 取引先 */}
          <Field label="取引先・店舗名" error={errors.vendor?.message}>
            <Input
              type="text"
              placeholder="例: 株式会社サンプル"
              {...register("vendor")}
              aria-invalid={!!errors.vendor}
              disabled={isSubmitting}
            />
          </Field>

          {/* 金額 */}
          <Field label="金額（税込・円）" error={errors.amount?.message}>
            <Input
              type="number"
              min={1}
              placeholder="例: 1500"
              {...register("amount")}
              aria-invalid={!!errors.amount}
              disabled={isSubmitting}
            />
          </Field>

          {/* 消費税 */}
          <Field label="消費税額（円）" error={errors.taxAmount?.message}>
            <Input
              type="number"
              min={0}
              placeholder="例: 136"
              {...register("taxAmount")}
              disabled={isSubmitting}
            />
          </Field>

          {/* カテゴリ */}
          <Field label="カテゴリ" error={errors.category?.message}>
            <select
              {...register("category")}
              className={selectClass}
              disabled={isSubmitting}
            >
              <option value="">選択してください</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          {/* 支払方法 */}
          <Field label="支払方法" error={errors.paymentMethod?.message}>
            <select
              {...register("paymentMethod")}
              className={selectClass}
              disabled={isSubmitting}
            >
              <option value="">選択してください</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        </div>

        {/* 摘要 */}
        <Field label="摘要・品目" error={errors.description?.message}>
          <Input
            type="text"
            placeholder="例: 東京-大阪間 新幹線代"
            {...register("description")}
            disabled={isSubmitting}
          />
        </Field>

        {/* 添付ファイル */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Paperclip className="h-3.5 w-3.5" />
            添付ファイル（任意）
          </div>
          <p className="text-xs text-muted-foreground">
            参加者名簿・議事録・請求書・見積書などを添付できます
          </p>

          {/* 個人情報マスキング注意書き */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px text-amber-600" />
            <p className="leading-relaxed">
              個人情報が含まれる資料（参加者名簿など）は、
              <strong className="font-semibold">必要最小限の情報にマスキングしてから</strong>
              添付してください。マスキングせずにアップロードした場合、差し戻し時に古いファイルを削除できます。
            </p>
          </div>

          <AttachmentUploader
            files={attachmentFiles}
            onChange={setAttachmentFiles}
            disabled={isSubmitting}
          />
        </div>

        {/* 申請ボタン */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            キャンセル
          </Button>
          <Button type="submit" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                申請中...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                申請する
              </>
            )}
          </Button>
        </div>
      </form>

      {/* 生テキスト（折りたたみ） */}
      {analysis.rawText && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 rounded-lg select-none">
            AIが読み取ったテキスト全文を表示
          </summary>
          <pre className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words border-t border-border">
            {analysis.rawText}
          </pre>
        </details>
      )}
    </div>
  );
}
