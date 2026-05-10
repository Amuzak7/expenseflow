"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Building2, ChevronDown, Loader2, Search, X } from "lucide-react";

import {
  createIncomingPlan,
  updateIncomingPlan,
  type IncomingPlan,
  type TradingPartnerOption,
} from "./actions";
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
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { DatePicker } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// フォームスキーマ
// ─────────────────────────────────────────────

const formSchema = z.object({
  trading_partner_id: z.string().nullable().optional(),
  company_name: z.string().optional(),
  alias_name: z.string().optional(),
  amount: z
    .string()
    .min(1, "金額を入力してください")
    .refine((v) => /^\d+$/.test(v.replace(/,/g, "")) && parseInt(v.replace(/,/g, ""), 10) > 0, {
      message: "1円以上の正の整数で入力してください",
    }),
  planned_date: z.string().min(1, "予定入金日を選択してください"),
  memo: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface IncomingPlanModalProps {
  open: boolean;
  onClose: () => void;
  plan?: IncomingPlan;
  tradingPartners: TradingPartnerOption[];
}

// ─────────────────────────────────────────────
// 取引先コンボボックス
// ─────────────────────────────────────────────

interface PartnerComboboxProps {
  partners: TradingPartnerOption[];
  value: string | null | undefined;
  onChange: (partner: TradingPartnerOption | null) => void;
  disabled?: boolean;
}

function PartnerCombobox({
  partners,
  value,
  onChange,
  disabled,
}: PartnerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = partners.find((p) => p.id === value) ?? null;

  const filtered = search
    ? partners.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.primary_alias?.toLowerCase().includes(search.toLowerCase()) ??
            false)
      )
    : partners;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (partner: TradingPartnerOption) => {
    onChange(partner);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors",
          "hover:border-ring focus-visible:outline-none",
          open && "border-ring ring-2 ring-ring/30",
          disabled && "cursor-not-allowed opacity-50",
          !selected && "text-muted-foreground"
        )}
      >
        <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left truncate">
          {selected ? selected.name : "取引先を選択（任意）"}
        </span>
        {selected ? (
          <X
            className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
          {/* 検索 */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="会社名・振込名義で検索..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoComplete="off"
            />
          </div>

          {/* 選択肢 */}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                該当する取引先が見つかりません
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className={cn(
                    "flex w-full flex-col items-start px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                    p.id === value && "bg-primary/5"
                  )}
                >
                  <span className="font-medium text-foreground">{p.name}</span>
                  {p.primary_alias && (
                    <span className="text-xs text-muted-foreground">
                      {p.primary_alias}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function IncomingPlanModal({
  open,
  onClose,
  plan,
  tradingPartners,
}: IncomingPlanModalProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const isEditMode = !!plan;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trading_partner_id: plan?.trading_partner_id ?? null,
      company_name: plan?.company_name ?? "",
      alias_name: plan?.alias_name ?? "",
      amount: plan ? String(plan.amount) : "",
      planned_date: plan?.planned_date ?? "",
      memo: plan?.memo ?? "",
    },
  });

  const selectedPartnerId = watch("trading_partner_id");

  // モーダルが開くたびにリセット
  useEffect(() => {
    if (open) {
      reset({
        trading_partner_id: plan?.trading_partner_id ?? null,
        company_name: plan?.company_name ?? "",
        alias_name: plan?.alias_name ?? "",
        amount: plan ? String(plan.amount) : "",
        planned_date: plan?.planned_date ?? "",
        memo: plan?.memo ?? "",
      });
    }
  }, [open, plan, reset]);

  // 取引先選択時に会社名・振込名義を自動入力
  const handlePartnerChange = (partner: TradingPartnerOption | null) => {
    setValue("trading_partner_id", partner?.id ?? null);
    if (partner) {
      setValue("company_name", partner.name);
      setValue("alias_name", partner.primary_alias ?? "");
    }
  };

  const onSubmit = async (values: FormValues) => {
    setIsSaving(true);
    try {
      const payload = {
        trading_partner_id: values.trading_partner_id || null,
        company_name: values.company_name || undefined,
        alias_name: values.alias_name || undefined,
        amount: parseInt(values.amount.replace(/,/g, ""), 10),
        planned_date: values.planned_date,
        memo: values.memo || undefined,
      };

      const result = isEditMode
        ? await updateIncomingPlan(plan.id, payload)
        : await createIncomingPlan(payload);

      if ("error" in result) {
        toast.error(isEditMode ? "更新に失敗しました" : "登録に失敗しました", {
          description: result.error,
        });
      } else {
        toast.success(isEditMode ? "入金予定を更新しました" : "入金予定を登録しました");
        router.refresh();
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isSaving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? "入金予定を編集" : "入金予定を登録"}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "入金予定の内容を編集します"
              : "入金予定の情報を入力してください"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          {/* ── 取引先 ──────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>取引先（任意）</Label>
            <Controller
              name="trading_partner_id"
              control={control}
              render={() => (
                <PartnerCombobox
                  partners={tradingPartners}
                  value={selectedPartnerId}
                  onChange={handlePartnerChange}
                  disabled={isSaving}
                />
              )}
            />
            {selectedPartnerId && (
              <p className="text-xs text-muted-foreground">
                会社名・振込名義を自動入力しました。必要に応じて変更できます。
              </p>
            )}
          </div>

          <Separator />

          {/* ── 会社名 ──────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-company_name">
              会社名
              {!selectedPartnerId && (
                <span className="text-muted-foreground font-normal ml-1">
                  （取引先未選択時）
                </span>
              )}
            </Label>
            <Input
              id="plan-company_name"
              placeholder="例: 株式会社〇〇"
              disabled={isSaving}
              {...register("company_name")}
            />
          </div>

          {/* ── 振込名義 ────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-alias_name">振込名義（任意）</Label>
            <Input
              id="plan-alias_name"
              placeholder="例: カ）マルマルカブシキ"
              disabled={isSaving}
              {...register("alias_name")}
            />
          </div>

          <Separator />

          {/* ── 予定金額・予定入金日 ─────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="plan-amount">
                予定金額 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="plan-amount"
                  inputMode="numeric"
                  placeholder="100000"
                  disabled={isSaving}
                  className="pr-6"
                  {...register("amount")}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                  円
                </span>
              </div>
              {errors.amount && (
                <p className="text-xs text-destructive">
                  {errors.amount.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="plan-planned_date">
                予定入金日 <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="planned_date"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="日付を選択"
                    disabled={isSaving}
                  />
                )}
              />
              {errors.planned_date && (
                <p className="text-xs text-destructive">
                  {errors.planned_date.message}
                </p>
              )}
            </div>
          </div>

          {/* ── メモ ────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label htmlFor="plan-memo">メモ（任意）</Label>
            <Textarea
              id="plan-memo"
              placeholder="請求書番号・内容など"
              rows={2}
              disabled={isSaving}
              {...register("memo")}
            />
          </div>

          {/* ── フッター ─────────────────────────────── */}
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onClose}
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={isSaving}
              className="bg-primary hover:bg-primary/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {isEditMode ? "更新中..." : "登録中..."}
                </>
              ) : isEditMode ? (
                "更新"
              ) : (
                "登録"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
