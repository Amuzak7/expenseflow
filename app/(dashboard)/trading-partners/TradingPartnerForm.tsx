"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Star } from "lucide-react";

import { createTradingPartner } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// フォームスキーマ（actions.tsと同一のルール）
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
  // フォーム側は空文字も許容し、refineでバリデーション
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

export default function TradingPartnerForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      name: "",
      corporate_number: "",
      contact_person: "",
      department: "",
      phone: "",
      email: "",
      bank_name: "",
      branch_name: "",
      account_type: "",
      account_number_last4: "",
      remittance_code: "",
      notes: "",
      aliases: [{ alias_name: "", is_primary: true }],
    },
  });

  // 振込名義の動的フィールド管理
  const { fields, append, remove } = useFieldArray({
    control,
    name: "aliases",
  });

  const aliases = watch("aliases");

  // プライマリ振込名義の切り替え（1つだけプライマリにする）
  const setPrimary = (index: number) => {
    aliases.forEach((_, i) => {
      setValue(`aliases.${i}.is_primary`, i === index);
    });
  };

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    // primar振込名義が1つも設定されていない場合、先頭をプライマリにする
    const hasNoPrimary = !values.aliases.some((a) => a.is_primary);
    if (hasNoPrimary && values.aliases.length > 0) {
      values.aliases[0].is_primary = true;
    }

    try {
      const result = await createTradingPartner(values);

      // redirect()はエラーをthrowするため、resultが返ってきた場合はエラー
      if (result && "error" in result) {
        toast.error("登録に失敗しました", { description: result.error });
      }
    } catch (e) {
      // Next.jsのredirect()はエラーとしてthrowされるため、
      // NEXT_REDIRECTはSuccess扱いにする
      const err = e as Error;
      if (!err.message?.includes("NEXT_REDIRECT")) {
        toast.error("予期しないエラーが発生しました");
        console.error(e);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
      {/* 基本情報 */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">基本情報</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 会社名 */}
          <div className="space-y-1.5">
            <Label htmlFor="name">
              会社名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="株式会社〇〇"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          {/* 法人番号 */}
          <div className="space-y-1.5">
            <Label htmlFor="corporate_number">法人番号（任意）</Label>
            <Input
              id="corporate_number"
              placeholder="例: 1234567890123"
              maxLength={13}
              inputMode="numeric"
              {...register("corporate_number")}
            />
            {errors.corporate_number && (
              <p className="text-xs text-destructive">
                {errors.corporate_number.message as string}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              ※ 13桁の半角数字で入力してください
            </p>
          </div>

          {/* 担当者名・部署 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact_person">担当者名（任意）</Label>
              <Input
                id="contact_person"
                placeholder="例: 山田 太郎"
                {...register("contact_person")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">部署（任意）</Label>
              <Input
                id="department"
                placeholder="例: 経理部"
                {...register("department")}
              />
            </div>
          </div>

          {/* 電話番号・メールアドレス */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">電話番号（任意）</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="例: 03-1234-5678"
                {...register("phone")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">メールアドレス（任意）</Label>
              <Input
                id="email"
                type="email"
                placeholder="例: yamada@example.com"
                {...register("email")}
              />
            </div>
          </div>

          {/* メモ */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">メモ（任意）</Label>
            <Textarea
              id="notes"
              placeholder="取引内容・注意事項など"
              rows={3}
              {...register("notes")}
            />
          </div>
        </CardContent>
      </Card>

      {/* 振込名義（複数登録可） */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">振込名義</CardTitle>
          <p className="text-sm text-muted-foreground">
            入金マッチング時に使用します。1社に複数の名義を登録できます。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              {/* プライマリ切り替えボタン */}
              <button
                type="button"
                onClick={() => setPrimary(index)}
                title={
                  aliases[index]?.is_primary
                    ? "メイン振込名義"
                    : "メイン振込名義に設定"
                }
                className="mt-2 flex-shrink-0"
              >
                <Star
                  className={`h-4 w-4 transition-colors ${
                    aliases[index]?.is_primary
                      ? "fill-brand-teal text-brand-teal"
                      : "text-muted-foreground hover:text-brand-teal"
                  }`}
                />
              </button>

              {/* 振込名義入力 */}
              <div className="flex-1 space-y-1">
                <Input
                  placeholder={`例: カ）マルマルカブシキ ${index + 1}`}
                  {...register(`aliases.${index}.alias_name`)}
                />
                {errors.aliases?.[index]?.alias_name && (
                  <p className="text-xs text-destructive">
                    {errors.aliases[index]?.alias_name?.message}
                  </p>
                )}
              </div>

              {/* 削除ボタン（1件は削除不可） */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
                className="mt-1 flex-shrink-0 text-muted-foreground hover:text-destructive"
                title="この名義を削除"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          {/* 振込名義追加ボタン */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ alias_name: "", is_primary: false })}
            className="mt-1"
          >
            <Plus className="h-4 w-4 mr-2" />
            振込名義を追加
          </Button>

          {errors.aliases && !Array.isArray(errors.aliases) && (
            <p className="text-xs text-destructive">
              {(errors.aliases as { message?: string }).message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 口座情報 */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-base">口座情報（任意）</CardTitle>
          <p className="text-sm text-muted-foreground">
            セキュリティ上の理由から、口座番号は下4桁のみ登録します。
            入金マッチングの精度向上に使用します。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 銀行名・支店名 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="bank_name">銀行名</Label>
              <Input
                id="bank_name"
                placeholder="例: 三菱UFJ銀行"
                {...register("bank_name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch_name">支店名</Label>
              <Input
                id="branch_name"
                placeholder="例: 渋谷支店"
                {...register("branch_name")}
              />
            </div>
          </div>

          <Separator />

          {/* 口座種別・口座番号下4桁 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account_type">口座種別</Label>
              <Select
                onValueChange={(val) => setValue("account_type", val || undefined)}
                defaultValue=""
              >
                <SelectTrigger id="account_type">
                  <SelectValue placeholder="選択してください" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="普通">普通預金</SelectItem>
                  <SelectItem value="当座">当座預金</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="account_number_last4">
                口座番号（下4桁のみ）
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                  ****
                </span>
                <Input
                  id="account_number_last4"
                  className="pl-12 font-mono"
                  placeholder="1234"
                  maxLength={4}
                  inputMode="numeric"
                  pattern="\d{4}"
                  {...register("account_number_last4")}
                />
              </div>
              {errors.account_number_last4 && (
                <p className="text-xs text-destructive">
                  {errors.account_number_last4.message as string}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                ※ フル口座番号は登録できません（セキュリティポリシー）
              </p>
            </div>
          </div>

          <Separator />

          {/* 振込依頼人コード */}
          <div className="space-y-1.5">
            <Label htmlFor="remittance_code">振込依頼人コード（任意）</Label>
            <Input
              id="remittance_code"
              placeholder="例: 1234567890"
              {...register("remittance_code")}
            />
            <p className="text-xs text-muted-foreground">
              ※ 振込時に使用する依頼人識別コードです
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 送信ボタン */}
      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={isSubmitting}
          className="bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              登録中...
            </>
          ) : (
            "取引先を登録"
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          キャンセル
        </Button>
      </div>
    </form>
  );
}
