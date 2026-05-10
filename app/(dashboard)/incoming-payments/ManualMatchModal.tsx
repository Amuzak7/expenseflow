"use client";

import { useState, useEffect, useTransition } from "react";
import { Loader2, UserCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TradingPartnerSearch from "@/components/incoming-payments/TradingPartnerSearch";
import {
  manualMatchTransaction,
  type TradingPartnerSearchResult,
} from "./actions";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** モーダルに渡す明細情報（表示用サマリー） */
export interface TransactionSummary {
  id: string;
  transactionDate: string;
  amount: number;
  senderName: string;
  description: string | null;
}

interface ManualMatchModalProps {
  /** モーダルの開閉状態 */
  open: boolean;
  /** 閉じるときに呼ばれる */
  onClose: () => void;
  /** 対象の入金明細 */
  transaction: TransactionSummary;
  /**
   * 確定処理が成功したときに呼ばれるコールバック
   * 親コンポーネントが楽観的 UI 更新やページリフレッシュをここで行う
   */
  onConfirmed: (partnerName: string) => void;
}

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function formatAmount(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function ManualMatchModal({
  open,
  onClose,
  transaction,
  onConfirmed,
}: ManualMatchModalProps) {
  const [selected, setSelected] = useState<TradingPartnerSearchResult | null>(
    null
  );
  const [searchKey, setSearchKey] = useState(0);
  const [isPending, startTransition] = useTransition();

  // モーダルが開くたびに検索コンポーネントをリセット（前回の選択・検索状態をクリア）
  useEffect(() => {
    if (open) {
      setSelected(null);
      setSearchKey((k) => k + 1);
    }
  }, [open]);

  const handleConfirm = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await manualMatchTransaction(transaction.id, selected.id);
      if ("error" in result) {
        toast.error("手動マッチングに失敗しました", {
          description: result.error,
        });
      } else {
        toast.success(`「${selected.name}」として確定しました`);
        onConfirmed(selected.name);
        onClose();
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[480px]" showCloseButton={!isPending}>
        {/* ── ヘッダー ───────────────────────── */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <UserCheck className="h-4 w-4 text-primary flex-shrink-0" />
            手動で取引先を選択
          </DialogTitle>
          <DialogDescription>
            以下の入金明細を対応する取引先に手動でマッチングします。
          </DialogDescription>
        </DialogHeader>

        {/* ── 対象明細サマリー ────────────────── */}
        <div className="rounded-lg bg-muted/40 border border-border px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {formatDate(transaction.transactionDate)}
            </span>
            <span className="font-mono font-semibold text-foreground text-sm">
              {formatAmount(transaction.amount)}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground leading-tight">
            {transaction.senderName}
          </p>
          {transaction.description && (
            <p className="text-xs text-muted-foreground truncate">
              {transaction.description}
            </p>
          )}
        </div>

        {/* ── 取引先検索 ──────────────────────── */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-foreground">取引先を選択</p>
          {/* key を変えることでモーダルを開くたびに検索コンポーネントをリマウント */}
          <TradingPartnerSearch
            key={searchKey}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        </div>

        {/* ── 選択中の取引先プレビュー ────────── */}
        {selected ? (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2">
            <UserCheck className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <span className="text-xs text-muted-foreground">確定先:</span>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
              {selected.name}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground">
              リストから取引先を選択してください
            </span>
          </div>
        )}

        {/* ── フッターボタン ──────────────────── */}
        <DialogFooter>
          <DialogClose
            render={
              <Button
                variant="outline"
                disabled={isPending}
                onClick={onClose}
              />
            }
          >
            キャンセル
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={!selected || isPending}
            className="gap-1.5"
          >
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            {isPending ? "処理中..." : "確定"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
