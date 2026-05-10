"use client";

import { useState, useTransition } from "react";
import {
  Lock,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Save,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { updateSessionTimeout } from "./actions";

// ─────────────────────────────────────────────
// セッションタイムアウト選択肢
// ─────────────────────────────────────────────

const TIMEOUT_OPTIONS = [
  { value: "0",   label: "タイムアウトなし" },
  { value: "30",  label: "30 分" },
  { value: "60",  label: "1 時間" },
  { value: "240", label: "4 時間" },
] as const;

// ─────────────────────────────────────────────
// パスワード強度チェック
// ─────────────────────────────────────────────

function checkPasswordStrength(pw: string): {
  score:  number; // 0-4
  label:  string;
  color:  string;
} {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const clipped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  const map: Record<typeof clipped, { label: string; color: string }> = {
    0: { label: "非常に弱い", color: "bg-red-500" },
    1: { label: "弱い",       color: "bg-orange-500" },
    2: { label: "普通",       color: "bg-amber-500" },
    3: { label: "強い",       color: "bg-green-500" },
    4: { label: "非常に強い", color: "bg-emerald-500" },
  };

  return { score: clipped, ...map[clipped] };
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface SecurityTabProps {
  currentUserEmail:  string;
  initialTimeout:    number;
}

// ─────────────────────────────────────────────
// コンポーネント本体
// ─────────────────────────────────────────────

export default function SecurityTab({
  currentUserEmail,
  initialTimeout,
}: SecurityTabProps) {
  // ── パスワード変更 ───────────────────────────
  const [newPassword,  setNewPassword]  = useState("");
  const [confirmPw,    setConfirmPw]    = useState("");
  const [showNew,      setShowNew]      = useState(false);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [pwError,      setPwError]      = useState<string | null>(null);
  const [isChangingPw, startPwTransition] = useTransition();

  // ── セッションタイムアウト ─────────────────────
  const [timeout,        setTimeout_]    = useState(String(initialTimeout));
  const [isSavingTimeout, startTimeoutTransition] = useTransition();

  const strength = newPassword ? checkPasswordStrength(newPassword) : null;

  // ── パスワード変更処理 ───────────────────────
  const handleChangePassword = () => {
    setPwError(null);
    if (newPassword.length < 8) {
      setPwError("パスワードは8文字以上で設定してください");
      return;
    }
    if (newPassword !== confirmPw) {
      setPwError("パスワードが一致しません");
      return;
    }

    startPwTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPwError(error.message);
        toast.error("パスワードの変更に失敗しました");
      } else {
        setNewPassword("");
        setConfirmPw("");
        toast.success("パスワードを変更しました");
      }
    });
  };

  // ── セッションタイムアウト保存 ────────────────
  const handleSaveTimeout = () => {
    startTimeoutTransition(async () => {
      const result = await updateSessionTimeout(parseInt(timeout, 10));
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("セッション設定を保存しました");
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* ── パスワード変更 ───────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">パスワード変更</h2>
        </div>

        {/* アカウントメール（読み取り専用） */}
        <div className="space-y-1.5">
          <Label>ログイン中のアカウント</Label>
          <p className="text-sm text-muted-foreground px-2.5 py-1.5 rounded-lg border border-input bg-muted/30">
            {currentUserEmail}
          </p>
        </div>

        {/* 新しいパスワード */}
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">新しいパスワード</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setPwError(null);
              }}
              placeholder="8文字以上"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showNew ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* パスワード強度バー */}
          {newPassword && strength && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      i < strength.score ? strength.color : "bg-muted"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                強度: <span className="font-medium">{strength.label}</span>
              </p>
            </div>
          )}
        </div>

        {/* 確認入力 */}
        <div className="space-y-1.5">
          <Label htmlFor="confirmPw">パスワードを確認</Label>
          <div className="relative">
            <Input
              id="confirmPw"
              type={showConfirm ? "text" : "password"}
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value);
                setPwError(null);
              }}
              placeholder="もう一度入力"
              className={cn(
                "pr-10",
                confirmPw && confirmPw === newPassword && "border-green-500"
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirm ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            {confirmPw && confirmPw === newPassword && (
              <CheckCircle2 className="absolute right-8 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
            )}
          </div>
        </div>

        {/* エラーメッセージ */}
        {pwError && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {pwError}
          </div>
        )}

        {/* 保存ボタン */}
        <div className="flex justify-end pt-1 border-t border-border">
          <Button
            onClick={handleChangePassword}
            disabled={isChangingPw || !newPassword || !confirmPw}
          >
            {isChangingPw ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}
            {isChangingPw ? "変更中..." : "パスワードを変更"}
          </Button>
        </div>
      </div>

      {/* ── セッションタイムアウト ───────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            セッションタイムアウト
          </h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          操作がない状態が続いた場合に自動的にログアウトします。
        </p>

        <div className="flex items-center gap-3">
          <Select value={timeout} onValueChange={setTimeout_}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIMEOUT_OPTIONS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={handleSaveTimeout}
            disabled={isSavingTimeout}
          >
            {isSavingTimeout ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSavingTimeout ? "保存中..." : "保存"}
          </Button>
        </div>

        {timeout !== "0" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {timeout === "30" ? "30 分" : timeout === "60" ? "1 時間" : "4 時間"}
              以上操作がない場合、自動的にログアウトされます。
              保存されていないデータは失われる可能性があります。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
