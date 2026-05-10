"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, XCircle, RotateCcw, X, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/app/(dashboard)/notifications/actions";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface NotificationCenterProps {
  collapsed: boolean;
}

// ─────────────────────────────────────────────
// 通知タイプ設定
// ─────────────────────────────────────────────

const TYPE_CONFIG = {
  approved: {
    icon: CheckCircle2,
    iconClass: "text-green-500",
    bgClass:   "bg-green-50",
  },
  rejected: {
    icon: XCircle,
    iconClass: "text-red-500",
    bgClass:   "bg-red-50",
  },
  returned: {
    icon: RotateCcw,
    iconClass: "text-orange-500",
    bgClass:   "bg-orange-50",
  },
} as const;

// ─────────────────────────────────────────────
// 相対時刻フォーマット
// ─────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now  = Date.now();
  const diff = now - new Date(dateStr).getTime(); // ms
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);

  if (mins  <  1) return "たった今";
  if (mins  < 60) return `${mins}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days  <  7) return `${days}日前`;
  return new Date(dateStr).toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function NotificationCenter({ collapsed }: NotificationCenterProps) {
  const router = useRouter();

  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);

  // ── 未読件数のポーリング（60秒毎）────────────
  const refreshUnread = useCallback(async () => {
    const count = await fetchUnreadNotificationCount();
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    refreshUnread();
    const timer = setInterval(refreshUnread, 60_000);
    return () => clearInterval(timer);
  }, [refreshUnread]);

  // ── パネル外クリックで閉じる ─────────────────
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // ── パネルを開く ─────────────────────────────
  const handleOpen = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setLoading(true);
    const data = await fetchNotifications();
    setNotifications(data);
    setLoading(false);
  };

  // ── 通知クリック: 既読 → /expenses へ ─────────
  const handleNotificationClick = async (n: NotificationRow) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications((prev) =>
        prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item)
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    router.push("/expenses");
  };

  // ── 全件既読 ─────────────────────────────────
  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const hasUnread = unreadCount > 0;

  return (
    <div className="relative" ref={panelRef}>
      {/* ── ベルボタン ────────────────────────── */}
      <button
        onClick={handleOpen}
        title="通知"
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          open && "bg-sidebar-accent text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
      >
        <span className="relative flex-shrink-0">
          <Bell className="h-5 w-5" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
        {!collapsed && <span className="truncate">通知</span>}
        {!collapsed && hasUnread && (
          <span className="ml-auto text-xs font-semibold text-red-500">
            {unreadCount}
          </span>
        )}
      </button>

      {/* ── 通知パネル（右側オーバーレイ）────────── */}
      {open && (
        <>
          {/* 背景オーバーレイ */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* パネル本体 */}
          <div
            className={cn(
              "fixed top-0 right-0 z-50 h-full w-96 bg-background border-l border-border shadow-xl",
              "flex flex-col"
            )}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">通知</h2>
                {hasUnread && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {hasUnread && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="すべて既読にする"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    すべて既読
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                  aria-label="閉じる"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* 通知リスト */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                  読み込み中…
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">通知はありません</p>
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => {
                    const cfg =
                      TYPE_CONFIG[n.type as keyof typeof TYPE_CONFIG] ??
                      TYPE_CONFIG.approved;
                    const Icon = cfg.icon;

                    return (
                      <li key={n.id}>
                        <button
                          onClick={() => handleNotificationClick(n)}
                          className={cn(
                            "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                            "hover:bg-muted/60 border-b border-border/50",
                            !n.is_read && "bg-blue-50/40"
                          )}
                        >
                          {/* アイコン */}
                          <div className={cn(
                            "flex-shrink-0 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full",
                            cfg.bgClass
                          )}>
                            <Icon className={cn("h-4 w-4", cfg.iconClass)} />
                          </div>

                          {/* テキスト */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cn(
                                "text-sm leading-snug",
                                n.is_read ? "text-foreground" : "font-semibold text-foreground"
                              )}>
                                {n.title}
                              </p>
                              {!n.is_read && (
                                <span className="flex-shrink-0 mt-1 h-2 w-2 rounded-full bg-blue-500" />
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {n.body}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground/70">
                              {formatRelativeTime(n.created_at)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
