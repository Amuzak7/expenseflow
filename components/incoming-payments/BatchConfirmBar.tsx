"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

interface BatchConfirmBarProps {
  /** 選択できる明細の総数（高信頼度の未確定明細） */
  totalSelectable: number;
  /** 現在選択中の件数 */
  selectedCount: number;
  /** すべて選択ボタンを押したとき */
  onSelectAll: () => void;
  /** すべて解除ボタンを押したとき */
  onDeselectAll: () => void;
  /** 「選択したX件を確定」ボタンを押したとき */
  onBatchConfirm: () => void;
  /** 一括確定処理中かどうか */
  isActing: boolean;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function BatchConfirmBar({
  totalSelectable,
  selectedCount,
  onSelectAll,
  onDeselectAll,
  onBatchConfirm,
  isActing,
}: BatchConfirmBarProps) {
  const isAllSelected =
    selectedCount === totalSelectable && totalSelectable > 0;
  const isSomeSelected = selectedCount > 0 && !isAllSelected;

  // クリック時の動作: 全選択 ↔ 全解除 のトグル
  // - 全選択状態 → 全解除
  // - 一部選択 or 未選択 → 全選択
  const handleCheckboxChange = () => {
    if (isAllSelected) {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 border border-primary/20 px-4 py-3">
      {/* 左: 全選択チェックボックス + 説明ラベル */}
      <div className="flex items-center gap-2.5">
        <Checkbox
          id="batch-select-all"
          checked={isAllSelected}
          indeterminate={isSomeSelected}
          onCheckedChange={handleCheckboxChange}
          disabled={isActing}
          aria-label={isAllSelected ? "すべて解除" : "すべて選択"}
        />
        <label
          htmlFor="batch-select-all"
          className="text-sm cursor-pointer select-none"
        >
          {/* 選択状況に応じてラベルを動的に変更 */}
          {isAllSelected ? (
            <span className="font-medium text-primary">すべて解除</span>
          ) : isSomeSelected ? (
            <>
              <span className="font-medium text-foreground">
                {selectedCount}件選択中
              </span>
              <span className="ml-1.5 text-muted-foreground text-xs">
                / {totalSelectable}件
              </span>
            </>
          ) : (
            <span className="font-medium text-foreground">すべて選択</span>
          )}
        </label>

        {/* 高信頼度バッジ */}
        <span className="hidden sm:inline-flex items-center text-xs text-muted-foreground">
          — 高信頼度マッチ {totalSelectable}件
        </span>
      </div>

      {/* 右: 一括確定ボタン */}
      <Button
        size="sm"
        onClick={onBatchConfirm}
        disabled={selectedCount === 0 || isActing}
        className="gap-1.5 shrink-0"
      >
        {isActing ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            処理中...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {selectedCount > 0
              ? `選択した ${selectedCount}件 を確定`
              : "一括確定"}
          </>
        )}
      </Button>
    </div>
  );
}
