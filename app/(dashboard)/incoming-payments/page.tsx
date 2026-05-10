import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Banknote } from "lucide-react";
import IncomingPaymentsClient from "./IncomingPaymentsClient";
import { fetchIncomingPayments } from "./actions";

export const metadata: Metadata = {
  title: "入金確認",
};

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default async function IncomingPaymentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // デフォルト: 直近3ヶ月
  const today = new Date();
  const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  const defaultDateFrom = toDateString(threeMonthsAgo);
  const defaultDateTo = toDateString(today);

  const allTransactions = await fetchIncomingPayments({
    dateFrom: defaultDateFrom,
    dateTo: defaultDateTo,
  });

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">入金確認</h1>
        <p className="text-sm text-muted-foreground mt-1">
          銀行明細CSVをアップロードして取引先と自動マッチングします
        </p>
      </div>

      <IncomingPaymentsClient
        allStoredTransactions={allTransactions}
        initialDateFrom={defaultDateFrom}
        initialDateTo={defaultDateTo}
      />

      <div className="flex items-start gap-2 text-xs text-muted-foreground border-t border-border pt-4">
        <Banknote className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <p>
          マッチングは振込名義・口座番号下4桁を基準にスコアリングしています。
          確定前に必ず内容を確認してください。
          取引先マスタへの振込名義エイリアス追加でマッチング精度が向上します。
        </p>
      </div>
    </div>
  );
}
