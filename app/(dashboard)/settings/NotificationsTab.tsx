"use client";

import { useState, useTransition } from "react";
import { Mail, Bell, Save, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NotificationSettings } from "./actions";
import { upsertNotificationSettings } from "./actions";

// ─────────────────────────────────────────────
// トグルスイッチコンポーネント
// ─────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked:  boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-input dark:bg-muted"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ─────────────────────────────────────────────
// 通知項目の定義
// ─────────────────────────────────────────────

interface NotifRow {
  key:      keyof NotificationSettings;
  label:    string;
  sublabel: string;
}

const EMAIL_ROWS: NotifRow[] = [
  {
    key:      "email_on_approved",
    label:    "経費申請が承認されたとき",
    sublabel: "申請者にメールを送信します",
  },
  {
    key:      "email_on_rejected",
    label:    "経費申請が却下されたとき",
    sublabel: "申請者にメールを送信します",
  },
  {
    key:      "email_on_returned",
    label:    "経費申請が差し戻されたとき",
    sublabel: "申請者にメールを送信します",
  },
  {
    key:      "email_on_payment_delayed",
    label:    "入金遅延が発生したとき",
    sublabel: "入金担当者にメールを送信します",
  },
  {
    key:      "email_on_new_request",
    label:    "新規経費申請が提出されたとき",
    sublabel: "承認者・管理者に送信します",
  },
];

const APP_ROWS: NotifRow[] = [
  {
    key:      "app_on_approved",
    label:    "経費申請が承認されたとき",
    sublabel: "アプリ内通知に表示します",
  },
  {
    key:      "app_on_rejected",
    label:    "経費申請が却下されたとき",
    sublabel: "アプリ内通知に表示します",
  },
  {
    key:      "app_on_returned",
    label:    "経費申請が差し戻されたとき",
    sublabel: "アプリ内通知に表示します",
  },
  {
    key:      "app_on_payment_delayed",
    label:    "入金遅延が発生したとき",
    sublabel: "アプリ内通知に表示します",
  },
];

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface NotificationsTabProps {
  initialSettings: NotificationSettings;
}

// ─────────────────────────────────────────────
// コンポーネント本体
// ─────────────────────────────────────────────

export default function NotificationsTab({ initialSettings }: NotificationsTabProps) {
  const [settings,  setSettings]  = useState<NotificationSettings>(initialSettings);
  const [isPending, startTransition] = useTransition();

  const toggle = (key: keyof NotificationSettings) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await upsertNotificationSettings(settings);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("通知設定を保存しました");
      }
    });
  };

  // セクションを一括ON/OFF
  const toggleSection = (rows: NotifRow[], allOn: boolean) => {
    setSettings((prev) => {
      const next = { ...prev };
      rows.forEach(({ key }) => { next[key] = !allOn; });
      return next;
    });
  };

  const emailAllOn = EMAIL_ROWS.every(({ key }) => settings[key]);
  const appAllOn   = APP_ROWS.every(({ key }) => settings[key]);

  return (
    <div className="space-y-5">
      {/* ── メール通知 ──────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">メール通知</h2>
          <button
            onClick={() => toggleSection(EMAIL_ROWS, emailAllOn)}
            className="ml-auto text-xs text-primary hover:underline"
          >
            {emailAllOn ? "すべてOFF" : "すべてON"}
          </button>
        </div>

        <ul className="divide-y divide-border">
          {EMAIL_ROWS.map(({ key, label, sublabel }) => (
            <li
              key={key}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sublabel}</p>
              </div>
              <Toggle
                checked={settings[key]}
                onChange={() => toggle(key)}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* ── アプリ内通知 ─────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">アプリ内通知</h2>
          <button
            onClick={() => toggleSection(APP_ROWS, appAllOn)}
            className="ml-auto text-xs text-primary hover:underline"
          >
            {appAllOn ? "すべてOFF" : "すべてON"}
          </button>
        </div>

        <ul className="divide-y divide-border">
          {APP_ROWS.map(({ key, label, sublabel }) => (
            <li key={key} className="flex items-center gap-3 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{sublabel}</p>
              </div>
              <Toggle
                checked={settings[key]}
                onChange={() => toggle(key)}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* メモ */}
      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          メール通知はSupabaseのメールサービスを通じて送信されます。
          大量送信には別途メールプロバイダー（Resend等）の設定が必要です。
        </p>
      </div>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isPending ? "保存中..." : "通知設定を保存"}
        </Button>
      </div>
    </div>
  );
}
