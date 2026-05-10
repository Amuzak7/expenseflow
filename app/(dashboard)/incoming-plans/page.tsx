import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  fetchIncomingPlans,
  fetchTradingPartnersForSelect,
  type IncomingPlansQueryParams,
} from "./actions";
import IncomingPlansClient from "./IncomingPlansClient";

export const metadata: Metadata = { title: "入金予定 | ExpenseFlow" };

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function toStr(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function IncomingPlansPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp = await searchParams;

  const queryParams: IncomingPlansQueryParams = {
    q:          toStr(sp.q),
    status:     toStr(sp.status),
    sort:       toStr(sp.sort),
    period:     toStr(sp.period),
    dateFrom:   toStr(sp.dateFrom),
    dateTo:     toStr(sp.dateTo),
    partnerId:  toStr(sp.partner),
    page:       sp.page  ? parseInt(toStr(sp.page)  ?? "1",  10) : 1,
    limit:      sp.limit ? parseInt(toStr(sp.limit) ?? "20", 10) : 20,
  };

  const [result, tradingPartners] = await Promise.all([
    fetchIncomingPlans(queryParams),
    fetchTradingPartnersForSelect(),
  ]);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">入金予定</h1>
        <p className="text-sm text-muted-foreground mt-1">
          入金予定の登録・管理を行います
        </p>
      </div>
      <IncomingPlansClient result={result} tradingPartners={tradingPartners} />
    </div>
  );
}
