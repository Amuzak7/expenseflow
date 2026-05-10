"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  CreditCard,
  Pencil,
  User,
  Phone,
  Mail,
  Hash,
  ChevronLeft,
  ChevronRight,
  SearchX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EditTradingPartnerModal, {
  type TradingPartnerForEdit,
} from "./EditTradingPartnerModal";

// ─────────────────────────────────────────────
// ページネーションバー
// ─────────────────────────────────────────────

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "...")[] = [1];
  const left = current - 2;
  const right = current + 2;
  if (left > 2) pages.push("...");
  for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) {
    pages.push(i);
  }
  if (right < total - 1) pages.push("...");
  if (total > 1) pages.push(total);
  return pages;
}

function PaginationBar({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-center gap-1 pt-4 pb-2">
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="前のページ"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="w-8 text-center text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === currentPage ? "default" : "outline"}
            size="sm"
            className="h-8 w-8 p-0 text-xs"
            onClick={() => onPageChange(p as number)}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="sm"
        className="h-8 w-8 p-0"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="次のページ"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

interface TradingPartnersClientProps {
  partners: TradingPartnerForEdit[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  perPage: number;
  searchQuery: string;
}

export default function TradingPartnersClient({
  partners,
  totalCount,
  currentPage,
  totalPages,
  perPage,
  searchQuery,
}: TradingPartnersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [editingPartner, setEditingPartner] =
    useState<TradingPartnerForEdit | null>(null);

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`${pathname}?${params.toString()}`);
  };

  // 表示範囲テキスト
  const rangeStart = totalCount === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const rangeEnd = Math.min(currentPage * perPage, totalCount);

  return (
    <>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base text-muted-foreground font-medium">
              {searchQuery ? (
                <>
                  <span className="text-foreground font-semibold">
                    「{searchQuery}」
                  </span>
                  の検索結果：{totalCount.toLocaleString("ja-JP")}件
                </>
              ) : (
                `${totalCount.toLocaleString("ja-JP")}社登録済み`
              )}
            </CardTitle>
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                表示件数：{rangeStart.toLocaleString("ja-JP")}〜
                {rangeEnd.toLocaleString("ja-JP")} / 全
                {totalCount.toLocaleString("ja-JP")}件
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {partners.length === 0 ? (
            /* 検索結果0件 */
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <SearchX className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                「{searchQuery}」に一致する取引先が見つかりませんでした
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="pl-6">会社名</TableHead>
                    <TableHead>振込名義</TableHead>
                    <TableHead>銀行・支店</TableHead>
                    <TableHead>口座情報</TableHead>
                    <TableHead>最終更新</TableHead>
                    <TableHead className="pr-6 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => {
                    const primaryAlias = partner.trading_partner_aliases.find(
                      (a) => a.is_primary
                    );
                    const aliasCount = partner.trading_partner_aliases.length;

                    return (
                      <TableRow
                        key={partner.id}
                        className="border-border hover:bg-muted/30"
                      >
                        {/* 会社名 */}
                        <TableCell className="pl-6 font-medium text-foreground">
                          <div className="space-y-0.5">
                            <span>{partner.name}</span>
                            {partner.corporate_number && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal font-mono">
                                <Hash className="h-3 w-3 flex-shrink-0" />
                                {partner.corporate_number}
                              </span>
                            )}
                            {(partner.contact_person ||
                              partner.phone ||
                              partner.email) && (
                              <div className="flex flex-col gap-0.5 mt-0.5">
                                {partner.contact_person && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                                    <User className="h-3 w-3 flex-shrink-0" />
                                    {partner.contact_person}
                                    {partner.department && (
                                      <span className="text-muted-foreground/60">
                                        · {partner.department}
                                      </span>
                                    )}
                                  </span>
                                )}
                                {partner.phone && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                                    <Phone className="h-3 w-3 flex-shrink-0" />
                                    {partner.phone}
                                  </span>
                                )}
                                {partner.email && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
                                    <Mail className="h-3 w-3 flex-shrink-0" />
                                    {partner.email}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* 振込名義 */}
                        <TableCell>
                          {aliasCount === 0 ? (
                            <span className="text-muted-foreground text-sm">
                              未登録
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {primaryAlias && (
                                <Badge
                                  variant="secondary"
                                  className="text-xs bg-primary/10 text-primary border-0"
                                >
                                  {primaryAlias.alias_name}
                                </Badge>
                              )}
                              {aliasCount > 1 && (
                                <Badge
                                  variant="outline"
                                  className="text-xs text-muted-foreground"
                                >
                                  +{aliasCount - (primaryAlias ? 1 : 0)}件
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* 銀行・支店 */}
                        <TableCell className="text-sm text-muted-foreground">
                          {partner.bank_name ? (
                            <>
                              {partner.bank_name}
                              {partner.branch_name
                                ? ` ${partner.branch_name}支店`
                                : ""}
                            </>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </TableCell>

                        {/* 口座情報（下4桁のみ） */}
                        <TableCell>
                          <div className="space-y-0.5">
                            {partner.account_number_last4 ? (
                              <div className="flex items-center gap-1.5 text-sm">
                                <CreditCard className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                <span className="text-muted-foreground font-mono">
                                  ****{partner.account_number_last4}
                                </span>
                                {partner.account_type && (
                                  <Badge
                                    variant="outline"
                                    className="text-xs ml-1"
                                  >
                                    {partner.account_type}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground/50 text-sm">
                                -
                              </span>
                            )}
                            {partner.remittance_code && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                                <Hash className="h-3 w-3 flex-shrink-0" />
                                {partner.remittance_code}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 最終更新 */}
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(partner.updated_at).toLocaleDateString(
                            "ja-JP"
                          )}
                        </TableCell>

                        {/* 操作 */}
                        <TableCell className="pr-6 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setEditingPartner(partner)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            編集
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ページネーションバー */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </CardContent>
      </Card>

      {editingPartner && (
        <EditTradingPartnerModal
          partner={editingPartner}
          open={true}
          onClose={() => setEditingPartner(null)}
        />
      )}
    </>
  );
}
