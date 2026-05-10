import { Clock, CheckCircle2, XCircle, FileText, BadgeCheck, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// ステータス定義
// ─────────────────────────────────────────────

export type ExpenseStatus = "draft" | "submitted" | "approved" | "rejected" | "paid" | "returned";

interface StatusConfig {
  label: string;
  icon: React.ElementType;
  className: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  draft: {
    label: "下書き",
    icon: FileText,
    className: "bg-muted text-muted-foreground border-transparent",
  },
  submitted: {
    label: "承認待ち",
    icon: Clock,
    className: "bg-yellow-50 text-yellow-700 border-yellow-200",
  },
  approved: {
    label: "承認済み",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-700 border-green-200",
  },
  rejected: {
    label: "却下",
    icon: XCircle,
    className: "bg-red-50 text-red-700 border-red-200",
  },
  paid: {
    label: "支払済み",
    icon: BadgeCheck,
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  returned: {
    label: "差し戻し",
    icon: RotateCcw,
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
};

const FALLBACK: StatusConfig = {
  label: "不明",
  icon: FileText,
  className: "bg-muted text-muted-foreground border-transparent",
};

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

interface ExpenseStatusBadgeProps {
  status: string;
  className?: string;
}

export default function ExpenseStatusBadge({ status, className }: ExpenseStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? FALLBACK;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

// ─────────────────────────────────────────────
// ステータスラベルのみ返すユーティリティ
// ─────────────────────────────────────────────

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? "不明";
}
