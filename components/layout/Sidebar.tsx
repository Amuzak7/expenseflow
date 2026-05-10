"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Banknote,
  CalendarClock,
  FileBarChart2,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import NotificationCenter from "@/components/notifications/NotificationCenter";

const navItems = [
  {
    href: "/dashboard",
    label: "ダッシュボード",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    href: "/trading-partners",
    label: "取引先管理",
    icon: Building2,
    exact: false,
  },
  {
    href: "/incoming-payments",
    label: "入金確認",
    icon: Banknote,
    exact: false,
  },
  {
    href: "/incoming-plans",
    label: "入金予定",
    icon: CalendarClock,
    exact: false,
  },
  {
    href: "/expenses",
    label: "経費精算",
    icon: Receipt,
    exact: false,
  },
  {
    href: "/reports",
    label: "月次レポート",
    icon: FileBarChart2,
    exact: false,
  },
  {
    href: "/settings",
    label: "設定",
    icon: Settings,
    exact: false,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isActive = (href: string, exact: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("ログアウトしました");
    router.push("/login");
    router.refresh();
  };

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* ロゴエリア */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border",
          collapsed && "justify-center px-2"
        )}
      >
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-brand-teal flex items-center justify-center">
          <span className="text-white font-bold text-sm">E</span>
        </div>
        {!collapsed && (
          <span className="font-bold text-sidebar-foreground text-base truncate">
            ExpenseFlow
          </span>
        )}
      </div>

      {/* ナビゲーション */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const active = isActive(item.href, item.exact);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                {item.comingSoon ? (
                  // Coming Soon: クリック不可、グレーアウト
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm opacity-40 cursor-not-allowed",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {!collapsed && (
                      <span className="ml-auto text-xs bg-sidebar-border rounded px-1">
                        準備中
                      </span>
                    )}
                  </div>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!collapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* 通知センター */}
      <div className="px-2 pb-2">
        <NotificationCenter collapsed={collapsed} />
      </div>

      {/* ログアウトボタン */}
      <div className="py-4 px-2 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          disabled={isLoggingOut}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? "ログアウト" : undefined}
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{isLoggingOut ? "ログアウト中..." : "ログアウト"}</span>}
        </button>
      </div>

      {/* 折りたたみトグル */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-7 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-sidebar-border text-sidebar-foreground shadow-sm hover:bg-sidebar-accent transition-colors"
        aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>
    </aside>
  );
}
