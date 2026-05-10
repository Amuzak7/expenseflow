"use client";

import { useState, useTransition } from "react";
import {
  UserCog, UserPlus, Mail, Clock, Shield, ShieldCheck,
  UserX, UserCheck, Trash2, Loader2, Crown,
  AlertTriangle, LogOut, RotateCcw, Users, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { ProfileWithEmail, InvitationRow } from "./actions";
import {
  updateUserRole, disableUser, restoreUser, retireUser,
  inviteUser, cancelInvitation,
} from "./actions";

// ─────────────────────────────────────────────
// 定数・ヘルパー
// ─────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin: "管理者", approver: "承認者", member: "一般社員",
};
const ROLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: Crown, approver: ShieldCheck, member: Shield,
};
const ROLE_BADGE: Record<string, string> = {
  admin:    "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  approver: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  member:   "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
};

type TabKey = "active" | "inactive" | "deleted";

// ─────────────────────────────────────────────
// 確認ダイアログの状態型
// ─────────────────────────────────────────────

interface ConfirmState {
  type:     "retire" | "delete";
  userId:   string;
  userName: string;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface UsersTabProps {
  initialUsers:       ProfileWithEmail[];
  initialInvitations: InvitationRow[];
  currentUserId:      string;
}

// ─────────────────────────────────────────────
// 確認ダイアログ（モーダルオーバーレイ）
// ─────────────────────────────────────────────

function ConfirmDialog({
  state,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isPending,
}: {
  state:          ConfirmState;
  reason:         string;
  onReasonChange: (v: string) => void;
  onConfirm:      () => void;
  onCancel:       () => void;
  isPending:      boolean;
}) {
  const isDelete = state.type === "delete";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl mx-4">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
            isDelete ? "bg-destructive/10" : "bg-amber-100 dark:bg-amber-900/30"
          )}>
            <AlertTriangle className={cn(
              "h-5 w-5",
              isDelete ? "text-destructive" : "text-amber-600 dark:text-amber-400"
            )} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isDelete ? "完全削除の確認" : "退職処理の確認"}
            </p>
            <p className="text-xs text-muted-foreground">
              {state.userName}
            </p>
          </div>
        </div>

        {/* 説明 */}
        <p className="text-sm text-muted-foreground mb-4">
          {isDelete ? (
            <>
              <span className="font-semibold text-destructive">この操作は取り消せません。</span>
              <br />
              Supabase からユーザーとすべての関連データが完全に削除されます。
            </>
          ) : (
            <>
              退職処理を行うと、ユーザーはログインできなくなります。
              <br />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                30日後に Supabase からも完全削除されます。
              </span>
              （それまでは復活可能です）
            </>
          )}
        </p>

        {/* 退職理由入力（退職処理のみ） */}
        {!isDelete && (
          <div className="mb-4 space-y-1.5">
            <Label htmlFor="retireReason" className="text-xs">
              退職理由（任意）
            </Label>
            <Input
              id="retireReason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="例：退職、契約終了など"
              className="h-9 text-sm"
            />
          </div>
        )}

        {/* ボタン */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            キャンセル
          </Button>
          <Button
            size="sm"
            variant={isDelete ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={isPending}
            className={!isDelete ? "bg-amber-600 hover:bg-amber-700 text-white" : ""}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDelete ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            {isPending ? "処理中..." : isDelete ? "完全削除する" : "退職処理を実行"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function UsersTab({
  initialUsers,
  initialInvitations,
  currentUserId,
}: UsersTabProps) {
  const [users,       setUsers]       = useState<ProfileWithEmail[]>(initialUsers);
  const [invitations, setInvitations] = useState<InvitationRow[]>(initialInvitations);
  const [activeTab,   setActiveTab]   = useState<TabKey>("active");

  // 確認ダイアログ
  const [confirm,       setConfirm]       = useState<ConfirmState | null>(null);
  const [confirmReason, setConfirmReason] = useState("");
  const [isPending,     startTransition]  = useTransition();

  // 招待フォーム
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole,  setInviteRole]  = useState("member");
  const [isInviting,  startInvite]    = useTransition();

  // ステータス別に分類
  const activeUsers   = users.filter((u) => u.status === "active");
  const inactiveUsers = users.filter((u) => u.status === "inactive");
  const deletedUsers  = users.filter((u) => u.status === "deleted");

  // ── ロール変更 ────────────────────────────────
  const handleRoleChange = async (userId: string, newRole: string) => {
    const prevRole = users.find((u) => u.id === userId)?.role ?? "member";
    setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    const result = await updateUserRole(userId, newRole);
    if (result.error) {
      toast.error(result.error);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: prevRole } : u));
    } else {
      toast.success("ロールを変更しました");
    }
  };

  // ── 無効化 ────────────────────────────────────
  const handleDisable = async (userId: string) => {
    const prev = [...users];
    setUsers((u) => u.map((p) => p.id === userId ? { ...p, status: "inactive" as const } : p));
    const result = await disableUser(userId);
    if (result.error) {
      toast.error(result.error);
      setUsers(prev);
    } else {
      toast.success("ユーザーを無効化しました");
    }
  };

  // ── 復活 ──────────────────────────────────────
  const handleRestore = async (userId: string) => {
    const prev = [...users];
    setUsers((u) => u.map((p) => p.id === userId ? { ...p, status: "active" as const } : p));
    const result = await restoreUser(userId);
    if (result.error) {
      toast.error(result.error);
      setUsers(prev);
    } else {
      toast.success("ユーザーを復活しました");
    }
  };

  // ── 退職処理（ダイアログ経由）────────────────
  const openRetireDialog = (user: ProfileWithEmail) => {
    setConfirmReason("");
    setConfirm({ type: "retire", userId: user.id, userName: user.full_name || user.email });
  };

  // ── 完全削除（ダイアログ経由）────────────────
  const openDeleteDialog = (user: ProfileWithEmail) => {
    setConfirm({ type: "delete", userId: user.id, userName: user.full_name || user.email });
  };

  // ── ダイアログ確定 ────────────────────────────
  const handleConfirm = () => {
    if (!confirm) return;

    startTransition(async () => {
      if (confirm.type === "retire") {
        const prev = [...users];
        setUsers((u) => u.map((p) => p.id === confirm.userId
          ? { ...p, status: "deleted" as const, deleted_at: new Date().toISOString() }
          : p
        ));
        const result = await retireUser(confirm.userId, confirmReason || undefined);
        if (result.error) {
          toast.error(result.error);
          setUsers(prev);
        } else {
          toast.success("退職処理が完了しました。30日後に完全削除されます。");
        }

      } else {
        // 完全削除: /api/admin/users/[id] DELETE
        const prev = [...users];
        setUsers((u) => u.filter((p) => p.id !== confirm.userId));
        try {
          const res = await fetch(`/api/admin/users/${confirm.userId}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!res.ok) {
            toast.error(data.error ?? "削除に失敗しました");
            setUsers(prev);
          } else {
            toast.success("ユーザーを完全削除しました");
          }
        } catch {
          toast.error("通信エラーが発生しました");
          setUsers(prev);
        }
      }

      setConfirm(null);
      setConfirmReason("");
    });
  };

  // ── ユーザー招待 ──────────────────────────────
  const handleInvite = () => {
    if (!inviteEmail.trim()) { toast.error("メールアドレスを入力してください"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) { toast.error("有効なメールアドレスを入力してください"); return; }

    startInvite(async () => {
      const result = await inviteUser(inviteEmail.trim(), inviteRole);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${inviteEmail} に招待メールを送信しました`);
        setInviteEmail("");
        setInviteRole("member");
        if (result.invitation) {
          setInvitations((prev) => [result.invitation!, ...prev]);
        }
      }
    });
  };

  // ── 招待キャンセル ────────────────────────────
  const handleCancelInvitation = async (invitationId: string) => {
    const prev = invitations;
    setInvitations((i) => i.filter((inv) => inv.id !== invitationId));
    const result = await cancelInvitation(invitationId);
    if (result.error) {
      toast.error(result.error);
      setInvitations(prev);
    } else {
      toast.success("招待をキャンセルしました");
    }
  };

  // ─────────────────────────────────────────────
  // タブナビゲーション
  // ─────────────────────────────────────────────

  const tabs: { key: TabKey; label: string; icon: React.ElementType; count: number; }[] = [
    { key: "active",   label: "有効",   icon: Users,   count: activeUsers.length   },
    { key: "inactive", label: "無効",   icon: UserX,   count: inactiveUsers.length },
    { key: "deleted",  label: "退職済み", icon: Archive, count: deletedUsers.length  },
  ];

  return (
    <>
      {/* 確認ダイアログ */}
      {confirm && (
        <ConfirmDialog
          state={confirm}
          reason={confirmReason}
          onReasonChange={setConfirmReason}
          onConfirm={handleConfirm}
          onCancel={() => { setConfirm(null); setConfirmReason(""); }}
          isPending={isPending}
        />
      )}

      <div className="space-y-5">
        {/* ── タブナビゲーション ─────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">メンバー管理</h2>
          </div>

          {/* タブボタン */}
          <div className="flex border-b border-border bg-muted/30">
            {tabs.map(({ key, label, icon: Icon, count }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px",
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                <span className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  activeTab === key
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          {/* ── 有効ユーザー一覧 ─────────────────── */}
          {activeTab === "active" && (
            <div className="divide-y divide-border">
              {activeUsers.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  有効なユーザーはいません
                </p>
              ) : activeUsers.map((user) => {
                const RoleIcon = ROLE_ICON[user.role] ?? Shield;
                const isMe     = user.id === currentUserId;

                return (
                  <div key={user.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap">
                    {/* アバター */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold bg-primary/10 text-primary">
                      {(user.full_name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
                    </div>

                    {/* 名前・メール */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate text-foreground">
                          {user.full_name || "（名前未設定）"}
                        </p>
                        {isMe && (
                          <span className="text-[10px] font-semibold bg-primary/10 text-primary rounded-full px-1.5 py-0.5 flex-shrink-0">
                            自分
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>

                    {/* ロールバッジ */}
                    {isMe ? (
                      <div className={cn(
                        "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium flex-shrink-0",
                        ROLE_BADGE[user.role] ?? ROLE_BADGE.member
                      )}>
                        <RoleIcon className="h-3 w-3" />
                        {ROLE_LABEL[user.role] ?? user.role}
                      </div>
                    ) : (
                      <Select value={user.role} onValueChange={(val) => handleRoleChange(user.id, val ?? "member")}>
                        <SelectTrigger size="sm" className={cn(
                          "flex-shrink-0 border rounded-full px-2.5 text-xs font-medium",
                          ROLE_BADGE[user.role] ?? ROLE_BADGE.member
                        )}>
                          <RoleIcon className="h-3 w-3 mr-1" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">一般社員</SelectItem>
                          <SelectItem value="approver">承認者</SelectItem>
                          <SelectItem value="admin">管理者</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {/* 操作ボタン */}
                    {!isMe && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* 無効化 */}
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleDisable(user.id)}
                          className="text-muted-foreground hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                          title="無効化（一時停止）"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                        {/* 退職処理 */}
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => openRetireDialog(user)}
                          className="text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                          title="退職処理（論理削除・30日後に完全削除）"
                        >
                          <LogOut className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 無効ユーザー一覧 ─────────────────── */}
          {activeTab === "inactive" && (
            <div className="divide-y divide-border">
              {inactiveUsers.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  無効化されているユーザーはいません
                </p>
              ) : inactiveUsers.map((user) => {
                const RoleIcon = ROLE_ICON[user.role] ?? Shield;

                return (
                  <div key={user.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap opacity-70">
                    {/* アバター */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold bg-muted text-muted-foreground">
                      {(user.full_name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
                    </div>

                    {/* 名前・メール */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate text-muted-foreground">
                          {user.full_name || "（名前未設定）"}
                        </p>
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 flex-shrink-0">
                          無効
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>

                    {/* ロールバッジ（読み取り専用） */}
                    <div className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium flex-shrink-0 opacity-60",
                      ROLE_BADGE[user.role] ?? ROLE_BADGE.member
                    )}>
                      <RoleIcon className="h-3 w-3" />
                      {ROLE_LABEL[user.role] ?? user.role}
                    </div>

                    {/* 操作ボタン */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* 復活 */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => handleRestore(user.id)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                        title="ユーザーを復活させる"
                      >
                        <UserCheck className="h-4 w-4" />
                      </Button>
                      {/* 退職処理 */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => openRetireDialog(user)}
                        className="text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                        title="退職処理（論理削除・30日後に完全削除）"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 退職済みユーザー一覧 ──────────────── */}
          {activeTab === "deleted" && (
            <div className="divide-y divide-border">
              {/* 注意バナー */}
              <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  退職処理後 <span className="font-semibold">30日</span> が経過したユーザーは自動的に完全削除されます。
                  それ以前であれば「復活」ボタンで復元できます。
                </p>
              </div>

              {deletedUsers.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  退職処理済みのユーザーはいません
                </p>
              ) : deletedUsers.map((user) => {
                const deletedDate = user.deleted_at
                  ? new Date(user.deleted_at)
                  : null;
                const scheduledDelete = deletedDate
                  ? new Date(deletedDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                  : null;
                const daysLeft = scheduledDelete
                  ? Math.max(0, Math.ceil((scheduledDelete.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                  : null;

                return (
                  <div key={user.id} className="flex items-center gap-3 px-5 py-3.5 flex-wrap sm:flex-nowrap opacity-60">
                    {/* アバター */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold bg-muted text-muted-foreground">
                      {(user.full_name ?? user.email)?.[0]?.toUpperCase() ?? "?"}
                    </div>

                    {/* 名前・メール */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium truncate text-muted-foreground line-through">
                          {user.full_name || "（名前未設定）"}
                        </p>
                        <span className="text-[10px] font-semibold bg-destructive/10 text-destructive rounded-full px-1.5 py-0.5 flex-shrink-0 no-underline" style={{ textDecoration: "none" }}>
                          退職済み
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      {daysLeft !== null && (
                        <p className={cn(
                          "text-[10px] mt-0.5",
                          daysLeft <= 7 ? "text-destructive font-semibold" : "text-muted-foreground"
                        )}>
                          {daysLeft > 0
                            ? `完全削除まで残り ${daysLeft} 日`
                            : "まもなく完全削除"}
                        </p>
                      )}
                    </div>

                    {/* 操作ボタン */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* 復活（30日以内のみ） */}
                      {(daysLeft === null || daysLeft > 0) && (
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => handleRestore(user.id)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                          title="退職処理を取り消して復活させる"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {/* 完全削除（管理者による緊急時のみ） */}
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => openDeleteDialog(user)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="今すぐ完全削除（取り消し不可）"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 新規招待フォーム ─────────────────────── */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">新規ユーザーを招待</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            入力したメールアドレスに招待リンクを送信します。有効期限は 7 日間です。
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="inviteEmail">メールアドレス</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="h-9"
                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>ロール</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => setInviteRole(value ?? '')}>
                <SelectTrigger size="default" className="w-36 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">一般社員</SelectItem>
                  <SelectItem value="approver">承認者</SelectItem>
                  <SelectItem value="admin">管理者</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleInvite}
              disabled={isInviting || !inviteEmail.trim()}
              className="h-9 flex-shrink-0"
            >
              {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {isInviting ? "送信中..." : "招待メールを送信"}
            </Button>
          </div>
        </div>

        {/* ── 招待中リスト ─────────────────────────── */}
        {invitations.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">招待中</h2>
              <span className="ml-auto text-xs text-muted-foreground">{invitations.length} 件</span>
            </div>
            <div className="divide-y divide-border">
              {invitations.map((inv) => {
                const isExpired = new Date(inv.expires_at) < new Date();
                return (
                  <div key={inv.id} className="flex items-center gap-3 px-5 py-3 flex-wrap sm:flex-nowrap">
                    <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {isExpired ? (
                          <span className="text-destructive">期限切れ</span>
                        ) : (
                          <>有効期限: {new Date(inv.expires_at).toLocaleDateString("ja-JP")}</>
                        )}
                      </p>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium flex-shrink-0",
                      ROLE_BADGE[inv.role] ?? ROLE_BADGE.member
                    )}>
                      {ROLE_LABEL[inv.role] ?? inv.role}
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      onClick={() => handleCancelInvitation(inv.id)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                      title="招待をキャンセル"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ロール説明 ────────────────────────────── */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            ロールの権限について
          </p>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            {([
              { role: "admin",    label: "管理者",  desc: "全機能へのフルアクセス。設定・ユーザー管理が可能", icon: Crown },
              { role: "approver", label: "承認者",  desc: "経費申請の承認・却下が可能",                     icon: ShieldCheck },
              { role: "member",   label: "一般社員", desc: "自分の経費申請のみ作成・参照可能",               icon: Shield },
            ] as const).map(({ role, label, desc, icon: Icon }) => (
              <div key={role} className="flex items-start gap-2">
                <div className={cn(
                  "mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full",
                  ROLE_BADGE[role]
                )}>
                  <Icon className="h-3 w-3" />
                </div>
                <div>
                  <p className="font-medium text-foreground">{label}</p>
                  <p className="text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
