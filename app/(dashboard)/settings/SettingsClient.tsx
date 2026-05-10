"use client";

import { useState } from "react";
import {
  Building2,
  Users,
  Receipt,
  Bell,
  ShieldCheck,
  AlertCircle,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SettingsData,
  ExpenseRulesData,
  NotificationSettings,
  OperationLogRow,
} from "./actions";
import CompanyTab        from "./CompanyTab";
import UsersTab          from "./UsersTab";
import ExpenseRulesTab   from "./ExpenseRulesTab";
import NotificationsTab  from "./NotificationsTab";
import SecurityTab       from "./SecurityTab";
import OperationLogsTab  from "./OperationLogsTab";

// ─────────────────────────────────────────────
// タブ定義
// ─────────────────────────────────────────────

const ADMIN_TABS = [
  { id: "company",        label: "会社情報",     icon: Building2    },
  { id: "users",          label: "ユーザー管理",  icon: Users        },
  { id: "expense-rules",  label: "経費ルール",    icon: Receipt      },
  { id: "operation-logs", label: "操作ログ",      icon: ClipboardList },
] as const;

const ALL_TABS = [
  { id: "notifications", label: "通知設定",     icon: Bell       },
  { id: "security",      label: "セキュリティ",  icon: ShieldCheck },
] as const;

type AdminTabId  = typeof ADMIN_TABS[number]["id"];
type CommonTabId = typeof ALL_TABS[number]["id"];
type TabId = AdminTabId | CommonTabId;

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface SettingsClientProps {
  settingsData:      SettingsData | null;
  expenseRulesData:  ExpenseRulesData | null;
  notifSettings:     NotificationSettings;
  sessionTimeout:    number;
  currentUserId:     string;
  currentUserRole:   string;
  currentUserEmail:  string;
  isAdmin:           boolean;
  operationLogs:     OperationLogRow[];
}

// ─────────────────────────────────────────────
// コンポーネント本体
// ─────────────────────────────────────────────

export default function SettingsClient({
  settingsData,
  expenseRulesData,
  notifSettings,
  sessionTimeout,
  currentUserId,
  currentUserRole,
  currentUserEmail,
  isAdmin,
  operationLogs,
}: SettingsClientProps) {
  // 管理者は会社情報から開始、一般ユーザーは通知設定から開始
  const [activeTab, setActiveTab] = useState<TabId>(
    isAdmin ? "company" : "notifications"
  );

  // 表示するタブリスト
  const visibleTabs = isAdmin
    ? [...ADMIN_TABS, ...ALL_TABS]
    : [...ALL_TABS];

  return (
    <div className="space-y-4">
      {/* ── タブナビゲーション ──────────────────── */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1">
        {visibleTabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex flex-1 min-w-[7rem] items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              activeTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* ── タブコンテンツ ──────────────────────── */}

      {/* 会社情報（admin のみ） */}
      {activeTab === "company" && isAdmin && (
        settingsData ? (
          <CompanyTab company={settingsData.company} />
        ) : (
          <EmptyState message="会社情報を取得できませんでした" />
        )
      )}

      {/* ユーザー管理（admin のみ） */}
      {activeTab === "users" && isAdmin && (
        settingsData ? (
          <UsersTab
            initialUsers={settingsData.users}
            initialInvitations={settingsData.invitations}
            currentUserId={currentUserId}
          />
        ) : (
          <EmptyState message="ユーザー情報を取得できませんでした" />
        )
      )}

      {/* 経費ルール（admin のみ） */}
      {activeTab === "expense-rules" && isAdmin && (
        expenseRulesData ? (
          <ExpenseRulesTab initialData={expenseRulesData} />
        ) : (
          <EmptyState message="経費ルールを取得できませんでした" />
        )
      )}

      {/* 通知設定（全ユーザー） */}
      {activeTab === "notifications" && (
        <NotificationsTab initialSettings={notifSettings} />
      )}

      {/* セキュリティ（全ユーザー） */}
      {activeTab === "security" && (
        <SecurityTab
          currentUserEmail={currentUserEmail}
          initialTimeout={sessionTimeout}
        />
      )}

      {/* 操作ログ（admin のみ） */}
      {activeTab === "operation-logs" && isAdmin && (
        <OperationLogsTab initialLogs={operationLogs} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// エラー表示用ヘルパー
// ─────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-700 dark:text-amber-400">{message}</p>
    </div>
  );
}
