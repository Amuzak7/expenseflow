"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// 振込名義スキーマ
const aliasSchema = z.object({
  alias_name: z.string().min(1, "振込名義を入力してください"),
  is_primary: z.boolean(),
});

// 取引先登録スキーマ
const tradingPartnerSchema = z.object({
  name: z.string().min(1, "会社名を入力してください"),
  corporate_number: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z
      .string()
      .regex(/^\d{13}$/, "法人番号は13桁の半角数字で入力してください")
      .optional()
  ),
  contact_person: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  department: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  phone: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  email: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  bank_name: z.string().optional(),
  branch_name: z.string().optional(),
  account_type: z.string().optional(),
  // セキュリティ要件: 口座番号は下4桁のみ受け付ける
  account_number_last4: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z
      .string()
      .regex(/^\d{4}$/, "口座番号の下4桁は半角数字4桁で入力してください")
      .optional()
  ),
  remittance_code: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  notes: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().optional()
  ),
  aliases: z.array(aliasSchema),
});

export type TradingPartnerFormData = z.infer<typeof tradingPartnerSchema>;

type ActionResult = { error: string } | { success: true };

/**
 * 取引先を新規登録する Server Action
 * - Zod バリデーション
 * - ログインユーザーの company_id を取得してRLS対応で挿入
 * - 振込名義（aliases）を別テーブルに一括挿入
 */
export async function createTradingPartner(
  data: TradingPartnerFormData
): Promise<ActionResult> {
  const supabase = await createClient();

  // 認証チェック
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // バリデーション
  const parsed = tradingPartnerSchema.safeParse(data);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: firstError?.message ?? "入力内容にエラーがあります" };
  }

  // company_id をRPC関数で取得（profilesテーブルの直接クエリより型安全）
  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );

  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。管理者にお問い合わせください。" };
  }

  const { aliases, ...partnerData } = parsed.data;

  // 取引先を挿入
  const { data: partner, error: partnerError } = await supabase
    .from("trading_partners")
    .insert({
      company_id: companyId,
      name: partnerData.name,
      corporate_number: partnerData.corporate_number || null,
      contact_person: partnerData.contact_person || null,
      department: partnerData.department || null,
      phone: partnerData.phone || null,
      email: partnerData.email || null,
      bank_name: partnerData.bank_name || null,
      branch_name: partnerData.branch_name || null,
      account_type: partnerData.account_type || null,
      account_number_last4: partnerData.account_number_last4 || null,
      remittance_code: partnerData.remittance_code || null,
      notes: partnerData.notes || null,
    })
    .select("id")
    .single();

  if (partnerError || !partner) {
    console.error("取引先挿入エラー:", partnerError);
    return { error: "取引先の登録に失敗しました: " + partnerError?.message };
  }

  // 振込名義を一括挿入
  if (aliases.length > 0) {
    const { error: aliasError } = await supabase
      .from("trading_partner_aliases")
      .insert(
        aliases.map((a) => ({
          trading_partner_id: partner.id,
          alias_name: a.alias_name,
          is_primary: a.is_primary,
        }))
      );

    if (aliasError) {
      console.error("振込名義挿入エラー:", aliasError);
      // 取引先本体は登録済みなので部分エラーとして返す
      return {
        error: "振込名義の登録中にエラーが発生しました。取引先は登録されています。",
      };
    }
  }

  // 一覧ページのキャッシュを無効化
  revalidatePath("/trading-partners");
  redirect("/trading-partners");
}

/**
 * 取引先を更新する Server Action
 * - 基本情報を UPDATE
 * - 振込名義は全削除→全挿入で同期
 */
export async function updateTradingPartner(
  id: string,
  data: TradingPartnerFormData
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = tradingPartnerSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "入力内容にエラーがあります" };
  }

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。" };
  }

  const { aliases, ...partnerData } = parsed.data;

  // 基本情報を更新
  const { error: updateError } = await supabase
    .from("trading_partners")
    .update({
      name: partnerData.name,
      corporate_number: partnerData.corporate_number || null,
      contact_person: partnerData.contact_person || null,
      department: partnerData.department || null,
      phone: partnerData.phone || null,
      email: partnerData.email || null,
      bank_name: partnerData.bank_name || null,
      branch_name: partnerData.branch_name || null,
      account_type: partnerData.account_type || null,
      account_number_last4: partnerData.account_number_last4 || null,
      remittance_code: partnerData.remittance_code || null,
      notes: partnerData.notes || null,
      updated_by: user.id,
    })
    .eq("id", id)
    .eq("company_id", companyId);

  if (updateError) {
    return { error: "取引先の更新に失敗しました: " + updateError.message };
  }

  // 振込名義を全削除してから再挿入
  const { error: deleteAliasError } = await supabase
    .from("trading_partner_aliases")
    .delete()
    .eq("trading_partner_id", id);

  if (deleteAliasError) {
    return { error: "振込名義の更新に失敗しました: " + deleteAliasError.message };
  }

  if (aliases.length > 0) {
    const { error: insertAliasError } = await supabase
      .from("trading_partner_aliases")
      .insert(
        aliases.map((a) => ({
          trading_partner_id: id,
          alias_name: a.alias_name,
          is_primary: a.is_primary,
        }))
      );

    if (insertAliasError) {
      return { error: "振込名義の登録中にエラーが発生しました: " + insertAliasError.message };
    }
  }

  revalidatePath("/trading-partners");
  return { success: true };
}

/**
 * 取引先を論理削除する Server Action
 * - deleted_at / deleted_by をセットするだけ（物理削除しない）
 */
export async function deleteTradingPartner(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: companyId, error: companyError } = await supabase.rpc(
    "get_user_company_id"
  );
  if (companyError || !companyId) {
    return { error: "会社情報が見つかりません。" };
  }

  // SECURITY DEFINER 関数経由でソフトデリートを実行
  // (SELECT ポリシーの RETURNING チェック問題を回避するため RPC を使用)
  const { error } = await supabase.rpc("soft_delete_trading_partner", {
    p_partner_id: id,
  });

  if (error) {
    return { error: "削除に失敗しました: " + error.message };
  }

  revalidatePath("/trading-partners");
  return { success: true };
}
