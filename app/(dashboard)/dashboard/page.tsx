import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Building2,
  Receipt,
  Banknote,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "ダッシュボード",
};

// ─────────────────────────────────────────────
// KPI カードのバリアント定義
// ─────────────────────────────────────────────

type CardVariant = "default" | "ok" | "warning" | "danger";

const variantStyles: Record<CardVariant, {
  iconBg:   string;
  iconText: string;
  badge?:   string;
}> = {
  default: {
    iconBg:   "bg-teal-100 dark:bg-teal-900/30",
    iconText: "text-teal-600 dark:text-teal-400",
  },
  ok: {
    iconBg:   "bg-green-100 dark:bg-green-900/30",
    iconText: "text-green-600 dark:text-green-400",
  },
  warning: {
    iconBg:   "bg-amber-100 dark:bg-amber-900/30",
    iconText: "text-amber-600 dark:text-amber-400",
    badge:    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  danger: {
    iconBg:   "bg-red-100 dark:bg-red-900/30",
    iconText: "text-red-600 dark:text-red-400",
    badge:    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
};

// ─────────────────────────────────────────────
// KPI カードコンポーネント
// ─────────────────────────────────────────────

interface KpiCardProps {
  title:     string;
  value:     number;
  unit:      string;
  sub:       string;
  href:      string;
  variant:   CardVariant;
  Icon:      React.ComponentType<{ className?: string }>;
  badge?:    string;
  subIcon?:  React.ComponentType<{ className?: string }>;
}

function KpiCard({
  title, value, unit, sub, href, variant, Icon, badge, subIcon: SubIcon,
}: KpiCardProps) {
  const s = variantStyles[variant];

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-5",
        "shadow-sm hover:shadow-md transition-all duration-200",
        "hover:border-border/80 hover:-translate-y-0.5",
        (variant === "warning" || variant === "danger") && value > 0 &&
          "ring-1 ring-inset",
        variant === "warning" && value > 0 && "ring-amber-200 dark:ring-amber-800",
        variant === "danger"  && value > 0 && "ring-red-200 dark:ring-red-800",
      )}
    >
      {/* ヘッダー行：カテゴリ名 + アイコン */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground tracking-wide">
          {title}
        </p>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", s.iconBg)}>
          <Icon className={cn("h-4 w-4", s.iconText)} />
        </div>
      </div>

      {/* 数値 */}
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tabular-nums text-foreground">
          {value.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>

      {/* アクションバッジ：何をすべきかを明示 */}
      {badge && value > 0 ? (
        <div className={cn(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold w-fit",
          s.badge
        )}>
          <span>▶ {badge}</span>
        </div>
      ) : (
        <div className="h-[30px]" /> // バッジなし時の高さを揃えるスペーサー
      )}

      {/* 補足説明 */}
      <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {SubIcon && <SubIcon className="h-3.5 w-3.5 flex-shrink-0" />}
          <span>{sub}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────
// ページ本体（Server Component）
// ─────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // ── 今月の初日 ───────────────────────────────
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // ── 全KPIを並列取得 ──────────────────────────
  const [
    { count: tradingPartnersCount   },
    { count: thisMonthPartnersCount },
    { count: pendingExpensesCount   },
    { count: unmatchedPaymentsCount },
    { count: overdueCount           },
  ] = await Promise.all([
    // 1. 登録取引先（RLS で deleted_at IS NULL が適用済み）
    supabase
      .from("trading_partners")
      .select("*", { count: "exact", head: true }),

    // 1b. 今月追加の取引先
    supabase
      .from("trading_partners")
      .select("*", { count: "exact", head: true })
      .gte("created_at", firstOfMonth),

    // 2. 承認待ち経費（status = 'submitted'）
    supabase
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),

    // 3. 未確認入金（status = 'unmatched'）
    supabase
      .from("bank_transactions")
      .select("*", { count: "exact", head: true })
      .eq("status", "unmatched"),

    // 4. 入金遅延（status = 'delayed'、または cron 未実行時の互換: pending + 期日超過）
    supabase
      .from("incoming_plans")
      .select("*", { count: "exact", head: true })
      .or(`status.eq.delayed,and(status.eq.pending,planned_date.lt.${todayStr})`),
  ]);

  const partners   = tradingPartnersCount   ?? 0;
  const newPartners = thisMonthPartnersCount ?? 0;
  const pending    = pendingExpensesCount    ?? 0;
  const unmatched  = unmatchedPaymentsCount  ?? 0;
  const overdue    = overdueCount            ?? 0;

  // ── カード定義 ────────────────────────────────
  const cards: KpiCardProps[] = [
    {
      title:   "登録取引先",
      value:   partners,
      unit:    "社",
      sub:     newPartners > 0 ? `今月 +${newPartners}社 追加` : "今月の追加なし",
      href:    "/trading-partners",
      variant: "default",
      Icon:    Building2,
      subIcon: newPartners > 0 ? TrendingUp : undefined,
    },
    {
      title:   "承認待ち経費",
      value:   pending,
      unit:    "件",
      sub:     pending > 0 ? "申請を開いて承認 / 却下してください" : "すべて処理済みです",
      href:    "/expenses",
      variant: pending > 0 ? "warning" : "ok",
      Icon:    Receipt,
      badge:   pending > 0 ? "申請の承認・却下" : undefined,
      subIcon: pending > 0 ? Clock : CheckCircle2,
    },
    {
      title:   "未確認入金",
      value:   unmatched,
      unit:    "件",
      sub:     unmatched > 0 ? "入金明細を取引先に紐づけてください" : "未確認の入金はありません",
      href:    "/incoming-payments",
      variant: unmatched > 0 ? "warning" : "ok",
      Icon:    Banknote,
      badge:   unmatched > 0 ? "取引先マッチング" : undefined,
      subIcon: unmatched > 0 ? Clock : CheckCircle2,
    },
    {
      title:   "入金遅延",
      value:   overdue,
      unit:    "件",
      sub:     overdue > 0 ? "取引先への入金督促を行ってください" : "遅延している入金はありません",
      href:    "/incoming-plans",
      variant: overdue > 0 ? "danger" : "ok",
      Icon:    AlertTriangle,
      badge:   overdue > 0 ? "未入金の督促" : undefined,
      subIcon: overdue > 0 ? AlertTriangle : CheckCircle2,
    },
  ];

  // ── アラートチップ定義（種別ごとに個別表示） ──
  const alertChips = [
    pending  > 0 && { label: "申請の承認・却下",  count: pending,  href: "/expenses",           color: "amber" as const },
    unmatched > 0 && { label: "取引先マッチング",   count: unmatched, href: "/incoming-payments",  color: "amber" as const },
    overdue  > 0 && { label: "未入金の督促",       count: overdue,  href: "/incoming-plans",     color: "red"   as const },
  ].filter(Boolean) as { label: string; count: number; href: string; color: "amber" | "red" }[];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* ── ページヘッダー ─────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ダッシュボード</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {now.toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}
          </p>
        </div>

        {/* アラートチップ（種別ごとにリンク付きで表示） */}
        {alertChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {alertChips.map((chip) => (
              <Link
                key={chip.href}
                href={chip.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5",
                  "text-xs font-semibold transition-opacity hover:opacity-80",
                  chip.color === "red"
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
                    : "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400"
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {chip.label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  chip.color === "red"
                    ? "bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200"
                    : "bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200"
                )}>
                  {chip.count}
                </span>
                <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── KPI カードグリッド ─────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <KpiCard key={card.title} {...card} />
        ))}
      </div>

      {/* ── ステータスサマリー ─────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 承認待ち経費 詳細 */}
        <SummaryRow
          href="/expenses"
          Icon={Receipt}
          label="承認待ち経費"
          value={pending}
          unit="件の申請"
          active={pending > 0}
          activeColor="text-amber-600"
          inactiveText="申請なし"
        />
        {/* 未確認入金 詳細 */}
        <SummaryRow
          href="/incoming-payments"
          Icon={Banknote}
          label="未確認入金"
          value={unmatched}
          unit="件をマッチング待ち"
          active={unmatched > 0}
          activeColor="text-amber-600"
          inactiveText="未確認なし"
        />
        {/* 入金遅延 詳細 */}
        <SummaryRow
          href="/incoming-plans"
          Icon={AlertTriangle}
          label="入金遅延"
          value={overdue}
          unit="件が遅延中"
          active={overdue > 0}
          activeColor="text-red-600"
          inactiveText="遅延なし"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// サマリー行コンポーネント
// ─────────────────────────────────────────────

function SummaryRow({
  href,
  Icon,
  label,
  value,
  unit,
  active,
  activeColor,
  inactiveText,
}: {
  href:          string;
  Icon:          React.ComponentType<{ className?: string }>;
  label:         string;
  value:         number;
  unit:          string;
  active:        boolean;
  activeColor:   string;
  inactiveText:  string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3",
        "hover:bg-muted/40 transition-colors"
      )}
    >
      <Icon className={cn(
        "h-4 w-4 flex-shrink-0",
        active ? activeColor : "text-muted-foreground/50"
      )} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        {active ? (
          <p className={cn("text-sm font-semibold", activeColor)}>
            {value.toLocaleString()} {unit}
          </p>
        ) : (
          <p className="text-sm font-medium text-green-600 dark:text-green-400">{inactiveText}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors flex-shrink-0" />
    </Link>
  );
}
