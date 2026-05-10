"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Loader2,
  Star,
  AlertTriangle,
  Building2,
} from "lucide-react";

import { updateTradingPartner, deleteTradingPartner } from "./actions";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

export interface TradingPartnerForEdit {
  id: string;
  name: string;
  corporate_number: string | null;
  contact_person: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string | null;
  account_number_last4: string | null;
  remittance_code: string | null;
  notes: string | null;
  updated_at: string;
  trading_partner_aliases: {
    id: string;
    alias_name: string;
    is_primary: boolean;
  }[];
}

interface EditTradingPartnerModalProps {
  partner: TradingPartnerForEdit;
  open: boolean;
  onClose: () => void;
}

// ─────────────────────────────────────────────
// フォームスキーマ
// ─────────────────────────────────────────────

const aliasSchema = z.object({
  alias_name: z.string().min(1, "振込名義を入力してください"),
  is_primary: z.boolean(),
});

const formSchema = z.object({
  name: z.string().min(1, "会社名を入力してください"),
  corporate_number: z
    .string()
    .optional()
    .refine((val) => !val || /^\d{13}$/.test(val), {
      message: "13桁の半角数字で入力してください",
    }),
  contact_person: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  bank_name: z.string().optional(),
  branch_name: z.string().optional(),
  account_type: z.string().optional(),
  account_number_last4: z
    .string()
    .optional()
    .refine((val) => !val || /^\d{4}$/.test(val), {
      message: "半角数字4桁で入力してください",
    }),
  remittance_code: z.string().optional(),
  notes: z.string().optional(),
  aliases: z.array(aliasSchema),
});

type FormValues = z.infer<typeof formSchema>;

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function EditTradingPartnerModal({
  partner,
  open,
  onClose,
}: EditTradingPartnerModalProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isPending = isSaving || isDeleting;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: partner.name,
      corporate_number: partner.corporate_number ?? "",
      contact_person: partner.contact_person ?? "",
      department: partner.department ?? "",
      phone: partner.phone ?? "",
      email: partner.email ?? "",
      bank_name: partner.bank_name ?? "",
      branch_name: partner.branch_name ?? "",
      account_type: partner.account_type ?? "",
      account_number_last4: partner.account_number_last4 ?? "",
      remittance_code: partner.remittance_code ?? "",
      notes: partner.notes ?? "",
      aliases:
        partner.trading_partner_aliases.length > 0
          ? partner.trading_partner_aliases.map((a) => ({
              alias_name: a.alias_name,
              is_primary: a.is_primary,
            }))
          : [{ alias_name: "", is_primary: true }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "aliases" });
  const aliases = watch("aliases");

  const setPrimary = (index: number) => {
    aliases.forEach((_, i) => {
      setValue(`aliases.${i}.is_primary`, i === index);
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setShowDeleteConfirm(false);
    onClose();
  };

  // ── 保存 ─────────────────────────────────────
  const onSave = async (values: FormValues) => {
    const hasNoPrimary = !values.aliases.some((a) => a.is_primary);
    if (hasNoPrimary && values.aliases.length > 0) {
      values.aliases[0].is_primary = true;
    }

    setIsSaving(true);
    try {
      const result = await updateTradingPartner(partner.id, values);
      if ("error" in result) {
        toast.error("更新に失敗しました", { description: result.error });
      } else {
        toast.success("取引先を更新しました");
        router.refresh();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  // ── 削除 ─────────────────────────────────────
  const onDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deleteTradingPartner(partner.id);
      if ("error" in result) {
        toast.error("削除に失敗しました", { description: result.error });
        setShowDeleteConfirm(false);
      } else {
        toast.info(`「${partner.name}」を削除しました`);
        router.refresh();
        onClose();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
        showCloseButton={!isPending}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
            取引先を編集
          </DialogTitle>
          <DialogDescription>{partner.name}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSave)} className="space-y-5">
          {/* ── 基本情報 ─────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              基本情報
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="edit-name">
                会社名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder="株式会社〇〇"
                disabled={isPending}
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>

            {/* 法人番号 */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-corporate_number">法人番号（任意）</Label>
              <Input
                id="edit-corporate_number"
                placeholder="例: 1234567890123"
                maxLength={13}
                inputMode="numeric"
                disabled={isPending}
                {...register("corporate_number")}
              />
              {errors.corporate_number && (
                <p className="text-xs text-destructive">
                  {errors.corporate_number.message as string}
                </p>
              )}
            </div>

            {/* 担当者名・部署 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-contact_person">担当者名（任意）</Label>
                <Input
                  id="edit-contact_person"
                  placeholder="例: 山田 太郎"
                  disabled={isPending}
                  {...register("contact_person")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-department">部署（任意）</Label>
                <Input
                  id="edit-department"
                  placeholder="例: 経理部"
                  disabled={isPending}
                  {...register("department")}
                />
              </div>
            </div>

            {/* 電話番号・メールアドレス */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">電話番号（任意）</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  placeholder="例: 03-1234-5678"
                  disabled={isPending}
                  {...register("phone")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">メールアドレス（任意）</Label>
                <Input
                  id="edit-email"
                  type="email"
                  placeholder="例: yamada@example.com"
                  disabled={isPending}
                  {...register("email")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">メモ（任意）</Label>
              <Textarea
                id="edit-notes"
                placeholder="取引内容・注意事項など"
                rows={3}
                disabled={isPending}
                {...register("notes")}
              />
            </div>
          </div>

          <Separator />

          {/* ── 振込名義 ──────────────────────────── */}
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                振込名義
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                入金マッチング時に使用します。1社に複数の名義を登録できます。
              </p>
            </div>

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setPrimary(index)}
                  title={
                    aliases[index]?.is_primary
                      ? "メイン振込名義"
                      : "メイン振込名義に設定"
                  }
                  disabled={isPending}
                  className="mt-2 flex-shrink-0"
                >
                  <Star
                    className={cn(
                      "h-4 w-4 transition-colors",
                      aliases[index]?.is_primary
                        ? "fill-primary text-primary"
                        : "text-muted-foreground hover:text-primary"
                    )}
                  />
                </button>

                <div className="flex-1 space-y-1">
                  <Input
                    placeholder={`例: カ）マルマルカブシキ ${index + 1}`}
                    disabled={isPending}
                    {...register(`aliases.${index}.alias_name`)}
                  />
                  {errors.aliases?.[index]?.alias_name && (
                    <p className="text-xs text-destructive">
                      {errors.aliases[index]?.alias_name?.message}
                    </p>
                  )}
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1 || isPending}
                  className="mt-1 flex-shrink-0 text-muted-foreground hover:text-destructive"
                  title="この名義を削除"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => append({ alias_name: "", is_primary: false })}
            >
              <Plus className="h-4 w-4 mr-2" />
              振込名義を追加
            </Button>
          </div>

          <Separator />

          {/* ── 口座情報 ──────────────────────────── */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              口座情報（任意）
            </p>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-bank_name">銀行名</Label>
                <Input
                  id="edit-bank_name"
                  placeholder="例: 三菱UFJ銀行"
                  disabled={isPending}
                  {...register("bank_name")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-branch_name">支店名</Label>
                <Input
                  id="edit-branch_name"
                  placeholder="例: 渋谷支店"
                  disabled={isPending}
                  {...register("branch_name")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-account_type">口座種別</Label>
                <Select
                  defaultValue={partner.account_type ?? ""}
                  onValueChange={(val) =>
                    setValue("account_type", val || undefined)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger id="edit-account_type">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="普通">普通預金</SelectItem>
                    <SelectItem value="当座">当座預金</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-account_number_last4">
                  口座番号（下4桁のみ）
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                    ****
                  </span>
                  <Input
                    id="edit-account_number_last4"
                    className="pl-12 font-mono"
                    placeholder="1234"
                    maxLength={4}
                    inputMode="numeric"
                    pattern="\d{4}"
                    disabled={isPending}
                    {...register("account_number_last4")}
                  />
                </div>
                {errors.account_number_last4 && (
                  <p className="text-xs text-destructive">
                    {errors.account_number_last4.message as string}
                  </p>
                )}
              </div>
            </div>

            {/* 振込依頼人コード */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-remittance_code">
                振込依頼人コード（任意）
              </Label>
              <Input
                id="edit-remittance_code"
                placeholder="例: 1234567890"
                disabled={isPending}
                {...register("remittance_code")}
              />
              <p className="text-xs text-muted-foreground">
                ※ 振込時に使用する依頼人識別コードです
              </p>
            </div>
          </div>

          <Separator />

          {/* ── 削除ゾーン ────────────────────────── */}
          <div className="space-y-2">
            {showDeleteConfirm ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                <span className="text-sm text-destructive flex-1">
                  「{partner.name}」を削除しますか？この操作は取り消せません。
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    キャンセル
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                    disabled={isDeleting}
                    onClick={onDelete}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : null}
                    削除する
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive h-7"
                disabled={isPending}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                この取引先を削除
              </Button>
            )}
          </div>

          {/* ── フッター ──────────────────────────── */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleClose}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-primary hover:bg-primary/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
