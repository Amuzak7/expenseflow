import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { fetchMonthlyReport } from "./actions";
import ReportClient from "./ReportClient";

export const metadata: Metadata = { title: "月次レポート | ExpenseFlow" };

interface PageProps {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const sp    = await searchParams;
  const now   = new Date();
  const year  = sp.year  ? parseInt(sp.year,  10) : now.getFullYear();
  const month = sp.month ? parseInt(sp.month, 10) : now.getMonth() + 1;

  // year / month が不正な値でも安全に処理
  const safeYear  = Number.isFinite(year)  ? year  : now.getFullYear();
  const safeMonth = Number.isFinite(month) && month >= 1 && month <= 12
    ? month
    : now.getMonth() + 1;

  const data = await fetchMonthlyReport(safeYear, safeMonth);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto print:p-4 print:space-y-4">
      <ReportClient year={safeYear} month={safeMonth} data={data} />
    </div>
  );
}
