import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Plus, Building2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import TradingPartnersClient from "./TradingPartnersClient";
import TradingPartnersToolbar from "./TradingPartnersToolbar";

export const metadata: Metadata = {
  title: "取引先管理",
};

const SORT_MAP = {
  updated_desc: { column: "updated_at" as const, ascending: false },
  updated_asc: { column: "updated_at" as const, ascending: true },
  created_desc: { column: "created_at" as const, ascending: false },
  created_asc: { column: "created_at" as const, ascending: true },
  name_asc: { column: "name" as const, ascending: true },
  name_desc: { column: "name" as const, ascending: false },
};

export default async function TradingPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
    per_page?: string;
  }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const currentPage = Math.max(1, parseInt(params.page ?? "1") || 1);
  const perPage = params.per_page === "50" ? 50 : 20;
  const sortKey = (params.sort ?? "updated_desc") as keyof typeof SORT_MAP;
  const sort = SORT_MAP[sortKey] ?? SORT_MAP.updated_desc;
  const offset = (currentPage - 1) * perPage;

  // エイリアス名での検索：マッチするpartner IDを先取得
  let aliasMatchIds: string[] = [];
  if (q) {
    const { data: aliasMatches } = await supabase
      .from("trading_partner_aliases")
      .select("trading_partner_id")
      .ilike("alias_name", `%${q}%`);
    aliasMatchIds = aliasMatches?.map((a) => a.trading_partner_id) ?? [];
  }

  // メインクエリ（件数も同時取得）
  let query = supabase
    .from("trading_partners")
    .select(
      `
      id,
      name,
      corporate_number,
      contact_person,
      department,
      phone,
      email,
      bank_name,
      branch_name,
      account_type,
      account_number_last4,
      remittance_code,
      notes,
      updated_at,
      trading_partner_aliases (
        id,
        alias_name,
        is_primary
      )
    `,
      { count: "exact" }
    )
    .is("deleted_at", null);

  // 検索フィルター
  if (q) {
    const textOrFilters = [
      `name.ilike.%${q}%`,
      `contact_person.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `email.ilike.%${q}%`,
    ].join(",");

    if (aliasMatchIds.length > 0) {
      query = query.or(
        `${textOrFilters},id.in.(${aliasMatchIds.join(",")})`
      );
    } else {
      query = query.or(textOrFilters);
    }
  }

  // ソート・ページネーション
  const { data: partners, error, count } = await query
    .order(sort.column, { ascending: sort.ascending })
    .range(offset, offset + perPage - 1);

  if (error) {
    console.error("取引先取得エラー:", error);
  }

  const tradingPartners = partners ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  // ページ番号が範囲外になった場合の補正（削除後など）
  const safePage = Math.min(currentPage, totalPages);

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">取引先管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            振込名義エイリアスと口座情報を一元管理します
          </p>
        </div>
        <Link
          href="/trading-partners/new"
          className={cn(
            buttonVariants({ variant: "default" }),
            "bg-primary hover:bg-primary/90 flex-shrink-0"
          )}
        >
          <Plus className="h-4 w-4 mr-2" />
          取引先を登録
        </Link>
      </div>

      {/* 検索・ソートツールバー */}
      <Suspense fallback={null}>
        <TradingPartnersToolbar />
      </Suspense>

      {/* 取引先リスト */}
      {totalCount === 0 && !q ? (
        <Card className="border-border border-dashed">
          <CardContent className="pt-10 pb-10 flex flex-col items-center gap-3 text-center">
            <Building2 className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-foreground">
                取引先がまだ登録されていません
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                「取引先を登録」ボタンから最初の取引先を追加してください
              </p>
            </div>
            <Link
              href="/trading-partners/new"
              className={cn(buttonVariants({ variant: "default" }), "mt-2")}
            >
              <Plus className="h-4 w-4 mr-2" />
              最初の取引先を登録
            </Link>
          </CardContent>
        </Card>
      ) : (
        <TradingPartnersClient
          partners={tradingPartners as any}
          totalCount={totalCount}
          currentPage={safePage}
          totalPages={totalPages}
          perPage={perPage}
          searchQuery={q}
        />
      )}
    </div>
  );
}
