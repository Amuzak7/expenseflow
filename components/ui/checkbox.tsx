"use client";

import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// カスタム Checkbox コンポーネント
//
// Base UI の Checkbox の代わりに <button role="checkbox"> を使用
// 理由: @base-ui/react/checkbox の indeterminate サポートが不安定なため
// アクセシビリティ: role="checkbox" + aria-checked="mixed"（indeterminate）
// ─────────────────────────────────────────────

interface CheckboxProps {
  /** 選択状態 */
  checked: boolean;
  /** 部分選択（一括選択の「一部のみ選択中」状態） */
  indeterminate?: boolean;
  /** チェック状態が変わったときのコールバック */
  onCheckedChange?: () => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  (
    {
      checked,
      indeterminate = false,
      onCheckedChange,
      disabled,
      className,
      id,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledby,
    },
    ref
  ) => {
    const isActive = checked || indeterminate;

    return (
      <button
        ref={ref}
        type="button"
        role="checkbox"
        id={id}
        aria-checked={indeterminate ? "mixed" : checked}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        disabled={disabled}
        onClick={() => onCheckedChange?.()}
        className={cn(
          // ベーススタイル
          "h-4 w-4 shrink-0 rounded-sm border transition-colors duration-100",
          "flex items-center justify-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // 状態別スタイル
          isActive
            ? "bg-primary border-primary text-primary-foreground"
            : "border-input bg-background hover:border-primary/60",
          className
        )}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3" strokeWidth={2.5} />
        ) : checked ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : null}
      </button>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
export type { CheckboxProps };
