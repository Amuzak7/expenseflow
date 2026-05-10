"use client";

import { useState, useEffect, useTransition } from "react";
import { Search, Loader2, Check, Building2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  searchTradingPartners,
  type TradingPartnerSearchResult,
} from "@/app/(dashboard)/incoming-payments/actions";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

interface TradingPartnerSearchProps {
  /** 選択中の取引先 ID（外部から制御） */
  selectedId: string | null;
  /** 取引先が選択されたときに呼ばれるコールバック */
  onSelect: (partner: TradingPartnerSearchResult) => void;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function TradingPartnerSearch({
  selectedId,
  onSelect,
}: TradingPartnerSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TradingPartnerSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [hasFetched, setHasFetched] = useState(false);

  // クエリ変更時はデバウンス（300ms）して検索
  // 空クエリの初回フェッチは遅延なし（モーダル表示時に即座に全件表示）
  useEffect(() => {
    const delay = hasFetched && query.trim() ? 300 : 0;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const data = await searchTradingPartners(query.trim());
        setResults(data);
        setHasFetched(true);
      });
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const isEmpty = results.length === 0;
  const showEmpty = !isPending && hasFetched && isEmpty;

  return (
    <div className="space-y-2">
      {/* 検索入力フィールド */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="会社名・振込名義で絞り込み..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-8 h-8 text-sm"
          autoComplete="off"
        />
        {isPending && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* 検索結果リスト */}
      <div
        className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background"
        role="listbox"
        aria-label="取引先一覧"
      >
        {/* ローディング中（初回のみスケルトン表示） */}
        {isPending && !hasFetched && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">読み込み中...</span>
          </div>
        )}

        {/* 結果なし */}
        {showEmpty && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {query.trim()
                ? `「${query}」に一致する取引先が見つかりません`
                : "取引先が登録されていません"}
            </p>
            {!query.trim() && (
              <p className="text-xs text-muted-foreground/70 mt-1">
                先に取引先マスタに登録してください
              </p>
            )}
          </div>
        )}

        {/* 取引先リスト */}
        {results.map((partner) => {
          const isSelected = partner.id === selectedId;
          return (
            <button
              key={partner.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(partner)}
              className={cn(
                "w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left",
                "border-b border-border last:border-b-0 transition-colors",
                isSelected
                  ? "bg-primary/8 text-primary"
                  : "hover:bg-muted/50 text-foreground"
              )}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium truncate",
                    isSelected ? "text-primary" : "text-foreground"
                  )}
                >
                  {partner.name}
                </p>
                {partner.aliasNames.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    振込名義: {partner.aliasNames.join(" / ")}
                  </p>
                )}
              </div>
              {isSelected && (
                <Check className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* 件数表示 */}
      {hasFetched && !isEmpty && (
        <p className="text-xs text-muted-foreground text-right">
          {results.length}件
        </p>
      )}
    </div>
  );
}
