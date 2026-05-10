"use client";

import { useState } from "react";
import {
  ClipboardList, UserX, UserCheck, LogOut, Trash2,
  Bot, ChevronDown, Search, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OperationLogRow } from "./actions";

// ─────────────────────────────────────────────
// アクション表示ラベル（"use server" ファイルには置けないためここで定義）
// ─────────────────────────────────────────────

const ACTION_LABEL: Record<OperationLogRow["action"], string> = {
  disable:          "無効化",
  restore:          "復活",
  retire:           "退職処理",
  permanent_delete: "完全削除",
};

// ─────────────────────────────────────────────
// アクション別スタイル定義
// ─────────────────────────────────────────────

const ACTION_STYLE: Record<
  OperationLogRow["action"],
  { badge: string; icon: React.ElementType; dot: string }
> = {
  disable: {
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800",
    icon:  UserX,
    dot:   "bg-orange-400",
  },
  restore: {
    badge: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800",
    icon:  UserCheck,
    dot:   "bg-green-400",
  },
  retire: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    icon:  LogOut,
    dot:   "bg-amber-400",
  },
  permanent_delete: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800",
    icon:  Trash2,
    dot:   "bg-red-500",
  },
};

// ─────────────────────────────────────────────
// 日時フォーマット
// ─────────────────────────────────────────────

function fmtDatetime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      year:   "numeric",
      month:  "2-digit",
      day:    "2-digit",
      hour:   "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface OperationLogsTabProps {
  initialLogs: OperationLogRow[];
}

// ─────────────────────────────────────────────
// フィルターオプション
// ─────────────────────────────────────────────

const FILTER_OPTIONS: { value: OperationLogRow["action"] | "all"; label: string }[] = [
  { value: "all",              label: "すべて" },
  { value: "disable",          label: "無効化" },
  { value: "restore",          label: "復活"   },
  { value: "retire",           label: "退職処理" },
  { value: "permanent_delete", label: "完全削除" },
];

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────
// コンポーネント本体
// ─────────────────────────────────────────────

export default function OperationLogsTab({ initialLogs }: OperationLogsTabProps) {
  const [search,     setSearch]     = useState("");
  const [actionFilter, setActionFilter] = useState<OperationLogRow["action"] | "all">("all");
  const [page,       setPage]       = useState(1);

  // ── フィルタリング ────────────────────────────
  const filtered = initialLogs.filter((log) => {
    const matchAction = actionFilter === "all" || log.action === actionFilter;
    const q           = search.trim().toLowerCase();
    const matchSearch = q === "" || [
      log.target_name,
      log.performer_name,
      log.reason,
      ACTION_LABEL[log.action],
    ].some((v) => v?.toLowerCase().includes(q));

    return matchAction && matchSearch;
  });

  // ── ページネーション ──────────────────────────
  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated   = filtered.slice(0, page * PAGE_SIZE);
  const hasMore     = page * PAGE_SIZE < filtered.length;

  return (
    <div className="space-y-4">
      {/* ── ヘッダー ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">ユーザー操作ログ</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            全 {initialLogs.length} 件
          </span>
        </div>

        {/* ── フィルターバー ──────────────────────── */}
        <div className="px-5 py-3 border-b border-border bg-muted/20 flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* 検索 */}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="ユーザー名・操作者名・理由で検索"
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* アクションフィルター */}
          <div className="flex items-center gap-1 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            {FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => { setActionFilter(value as typeof actionFilter); setPage(1); }}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  actionFilter === value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary hover:text-primary"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── ログ一覧 ─────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            {initialLogs.length === 0
              ? "まだ操作ログがありません"
              : "検索条件に一致するログがありません"}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {paginated.map((log) => {
              const style  = ACTION_STYLE[log.action];
              const Icon   = style.icon;
              const isAuto = log.performed_by === null;

              return (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                  {/* タイムライン ドット */}
                  <div className="flex flex-col items-center pt-1 flex-shrink-0">
                    <div className={cn("h-2 w-2 rounded-full", style.dot)} />
                  </div>

                  {/* コンテンツ */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* アクションバッジ */}
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium flex-shrink-0",
                        style.badge
                      )}>
                        <Icon className="h-3 w-3" />
                        {ACTION_LABEL[log.action]}
                      </span>

                      {/* 対象ユーザー名 */}
                      <span className="text-sm font-medium text-foreground truncate">
                        {log.target_name ?? "（不明なユーザー）"}
                      </span>
                    </div>

                    {/* 操作者・日時 */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {isAuto ? (
                        <span className="flex items-center gap-1">
                          <Bot className="h-3 w-3" />
                          自動処理（30日経過）
                        </span>
                      ) : (
                        <span>操作者: {log.performer_name}</span>
                      )}
                      <span className="text-muted-foreground/60">·</span>
                      <time dateTime={log.performed_at}>
                        {fmtDatetime(log.performed_at)}
                      </time>
                    </div>

                    {/* 理由（任意） */}
                    {log.reason && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1 inline-block">
                        理由: {log.reason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── もっと見るボタン ────────────────────── */}
        {hasMore && (
          <div className="px-5 py-3 border-t border-border flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              className="text-xs gap-1.5"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              もっと見る（残り {filtered.length - page * PAGE_SIZE} 件）
            </Button>
          </div>
        )}
      </div>

      {/* ── 補足情報 ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          ログについて
        </p>
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>管理者による操作はすべてここに記録されます</li>
          <li>「自動処理」は退職後30日経過による Cron ジョブの実行を意味します</li>
          <li>完全削除されたユーザーのログは引き続き閲覧できます</li>
          <li>直近 100 件を表示しています（それ以前はデータベースで確認してください）</li>
        </ul>
      </div>
    </div>
  );
}
