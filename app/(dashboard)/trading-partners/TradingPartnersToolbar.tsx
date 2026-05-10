"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useTransition, useState, useEffect } from "react";
import { Search, X, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function TradingPartnersToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");

  // 検索はデバウンス（300ms）でURL更新
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (inputValue) {
        params.set("q", inputValue);
      } else {
        params.delete("q");
      }
      params.set("page", "1");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  // searchParamsが外から変わったとき（ブラウザバックなど）に同期
  useEffect(() => {
    setInputValue(searchParams.get("q") ?? "");
  }, [searchParams]);

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set("page", "1");
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams]
  );

  const sort = searchParams.get("sort") ?? "updated_desc";
  const perPage = searchParams.get("per_page") ?? "20";
  // null を型的に排除（?? でデフォルト値を与えているが SelectValue の型に合わせる）
  const sortValue: string = sort;
  const perPageValue: string = perPage;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* 検索ボックス */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="会社名、振込名義、担当者名、連絡先で検索..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="pl-9 pr-9"
        />
        {inputValue && (
          <button
            onClick={() => setInputValue("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="検索クリア"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ソート */}
      <Select value={sortValue} onValueChange={(v) => updateParam("sort", v ?? "")}>
        <SelectTrigger className="w-full sm:w-[210px]">
          <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="updated_desc">更新日（新しい順）</SelectItem>
          <SelectItem value="updated_asc">更新日（古い順）</SelectItem>
          <SelectItem value="created_desc">登録日（新しい順）</SelectItem>
          <SelectItem value="created_asc">登録日（古い順）</SelectItem>
          <SelectItem value="name_asc">会社名（五十音順）</SelectItem>
          <SelectItem value="name_desc">会社名（逆順）</SelectItem>
        </SelectContent>
      </Select>

      {/* 表示件数 */}
      <Select value={perPageValue} onValueChange={(v) => updateParam("per_page", v ?? "")}>
        <SelectTrigger className="w-full sm:w-[120px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="20">20件表示</SelectItem>
          <SelectItem value="50">50件表示</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
