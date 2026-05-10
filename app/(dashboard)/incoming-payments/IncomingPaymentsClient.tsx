"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import {
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Loader2,
  RotateCcw,
} from "lucide-react";

import CsvUploader from "@/components/incoming-payments/CsvUploader";
import MatchingResultList from "@/components/incoming-payments/MatchingResultList";
import {
  fetchIncomingPayments,
  type MatchedTransaction,
  type StoredTransaction,
} from "@/app/(dashboard)/incoming-payments/actions";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | "unmatched" | "matched" | "ignored";

interface IncomingPaymentsClientProps {
  allStoredTransactions: StoredTransaction[];
  /** サーバーが計算したデフォルト開始日（直近3ヶ月前 YYYY-MM-DD） */
  initialDateFrom: string;
  /** サーバーが計算したデフォルト終了日（今日 YYYY-MM-DD） */
  initialDateTo: string;
}

function formatDateJP(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

export default function IncomingPaymentsClient({
  allStoredTransactions,
  initialDateFrom,
  initialDateTo,
}: IncomingPaymentsClientProps) {
  // ── DB明細のローカルstate（フィルター変更時に更新） ─
  const [storedTransactions, setStoredTransactions] = useState(allStoredTransactions);

  // ── セッション結果（CSVアップロード直後） ────────
  const [sessionResults, setSessionResults] = useState<MatchedTransaction[]>([]);
  const [showUploader, setShowUploader] = useState(allStoredTransactions.length === 0);

  // ── ステータスフィルター ──────────────────────────
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("unmatched");

  // ── 日付フィルター ────────────────────────────────
  /** フォーム入力中の値 */
  const [inputDateFrom, setInputDateFrom] = useState(initialDateFrom);
  const [inputDateTo, setInputDateTo] = useState(initialDateTo);
  /** 現在適用されている値（未設定=""は全期間） */
  const [appliedDateFrom, setAppliedDateFrom] = useState(initialDateFrom);
  const [appliedDateTo, setAppliedDateTo] = useState(initialDateTo);
  const isDefaultRange = appliedDateFrom === initialDateFrom && appliedDateTo === initialDateTo;
  const isAllPeriods = appliedDateFrom === "" && appliedDateTo === "";

  const [isFiltering, startFilterTransition] = useTransition();

  // ── フィルター適用 ────────────────────────────────
  const applyFilter = useCallback(
    (dateFrom: string, dateTo: string) => {
      startFilterTransition(async () => {
        const data = await fetchIncomingPayments({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        });
        setStoredTransactions(data);
        setAppliedDateFrom(dateFrom);
        setAppliedDateTo(dateTo);
      });
    },
    []
  );

  const handleApplyFilter = () => applyFilter(inputDateFrom, inputDateTo);

  const handleShowAllPeriods = () => {
    setInputDateFrom("");
    setInputDateTo("");
    applyFilter("", "");
  };

  const handleResetToDefault = () => {
    setInputDateFrom(initialDateFrom);
    setInputDateTo(initialDateTo);
    applyFilter(initialDateFrom, initialDateTo);
  };

  // ── MatchingResultList からのリフレッシュコールバック ─
  // 現在適用されているフィルターで再取得する
  const handleRefresh = useCallback(() => {
    startFilterTransition(async () => {
      const data = await fetchIncomingPayments({
        dateFrom: appliedDateFrom || undefined,
        dateTo: appliedDateTo || undefined,
      });
      setStoredTransactions(data);
    });
  }, [appliedDateFrom, appliedDateTo]);

  const handleUploadComplete = (results: MatchedTransaction[]) => {
    setSessionResults(results);
    setShowUploader(false);
    setActiveFilter("unmatched");
  };

  // ── 統計（storedTransactions から算出） ──────────
  const stats = useMemo(
    () => ({
      total: storedTransactions.length,
      unmatched: storedTransactions.filter((t) => t.status === "unmatched").length,
      matched: storedTransactions.filter((t) => t.status === "matched").length,
      ignored: storedTransactions.filter((t) => t.status === "ignored").length,
    }),
    [storedTransactions]
  );

  // ── 重複排除・ステータスフィルター ───────────────
  const sessionResultIds = useMemo(
    () => new Set(sessionResults.map((r) => r.id)),
    [sessionResults]
  );

  const dbTransactions = useMemo(
    () => storedTransactions.filter((t) => !sessionResultIds.has(t.id)),
    [storedTransactions, sessionResultIds]
  );

  const filteredDbTransactions = useMemo(() => {
    if (activeFilter === "all") return dbTransactions;
    return dbTransactions.filter((t) => t.status === activeFilter);
  }, [dbTransactions, activeFilter]);

  const showSessionResults =
    sessionResults.length > 0 &&
    (activeFilter === "all" || activeFilter === "unmatched");

  const listTitles: Record<FilterStatus, string> = {
    all: "すべての明細",
    unmatched: "未確認の明細",
    matched: "確定済みの明細",
    ignored: "無視した明細",
  };

  const emptyMessages: Record<FilterStatus, string> = {
    all: "明細データがありません",
    unmatched: "未確認の明細はありません",
    matched: "確定済みの明細はありません",
    ignored: "無視した明細はありません",
  };

  return (
    <div className="space-y-6">
      {/* ── 統計カード（クリックでフィルター切替） ─── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card
          onClick={() => setActiveFilter("all")}
          className={cn(
            "border-border cursor-pointer transition-all duration-150 hover:shadow-sm select-none",
            activeFilter === "all" &&
              "ring-2 ring-primary/30 border-primary/40 bg-primary/[0.03]"
          )}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium">
              合計明細数
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-foreground">
                {stats.total}
              </span>
              <span className="text-sm text-muted-foreground mb-0.5">件</span>
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveFilter("unmatched")}
          className={cn(
            "border-yellow-200 bg-yellow-50/30 cursor-pointer transition-all duration-150 hover:shadow-sm select-none",
            activeFilter === "unmatched" &&
              "ring-2 ring-yellow-400/50 border-yellow-400"
          )}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-yellow-700 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" />
              未確認
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-yellow-800">
                {stats.unmatched}
              </span>
              <span className="text-sm text-yellow-600 mb-0.5">件</span>
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveFilter("matched")}
          className={cn(
            "border-green-200 bg-green-50/30 cursor-pointer transition-all duration-150 hover:shadow-sm select-none",
            activeFilter === "matched" &&
              "ring-2 ring-green-400/50 border-green-400"
          )}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-green-700 font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              確定済み
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-green-800">
                {stats.matched}
              </span>
              <span className="text-sm text-green-600 mb-0.5">件</span>
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setActiveFilter("ignored")}
          className={cn(
            "border-border cursor-pointer transition-all duration-150 hover:shadow-sm select-none",
            activeFilter === "ignored" &&
              "ring-2 ring-primary/30 border-primary/40 bg-primary/[0.03]"
          )}
        >
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <XCircle className="h-3 w-3" />
              無視
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-end gap-1">
              <span className="text-2xl font-bold text-muted-foreground">
                {stats.ignored}
              </span>
              <span className="text-sm text-muted-foreground mb-0.5">件</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 日付範囲フィルター ────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
        {/* 入力行 */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
            <Calendar className="h-3.5 w-3.5" />
            <span>表示期間</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DatePicker
              value={inputDateFrom}
              onChange={setInputDateFrom}
              placeholder="開始日"
              disabled={isFiltering}
              className="w-44"
            />
            <span className="text-muted-foreground text-sm select-none">〜</span>
            <DatePicker
              value={inputDateTo}
              onChange={setInputDateTo}
              placeholder="終了日"
              disabled={isFiltering}
              className="w-44"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={handleApplyFilter}
              disabled={isFiltering}
            >
              {isFiltering && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              絞り込む
            </Button>

            {!isDefaultRange && !isAllPeriods && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground"
                onClick={handleResetToDefault}
                disabled={isFiltering}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                直近3ヶ月
              </Button>
            )}
          </div>

          {/* 全期間トグル */}
          <div className="ml-auto">
            {isAllPeriods ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={handleResetToDefault}
                disabled={isFiltering}
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                直近3ヶ月に戻す
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={handleShowAllPeriods}
                disabled={isFiltering}
              >
                全期間を表示
              </Button>
            )}
          </div>
        </div>

        {/* 現在の表示期間バッジ */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">表示中:</span>
          {isAllPeriods ? (
            <Badge variant="outline" className="text-xs font-normal">
              全期間
            </Badge>
          ) : isDefaultRange ? (
            <Badge variant="outline" className="text-xs font-normal">
              直近3ヶ月（{formatDateJP(appliedDateFrom)} 〜 {formatDateJP(appliedDateTo)}）
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs font-normal">
              {formatDateJP(appliedDateFrom) || "〜"} 〜 {formatDateJP(appliedDateTo) || "〜"}
            </Badge>
          )}
          {isFiltering && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              読み込み中...
            </span>
          )}
        </div>
      </div>

      {/* ── アップロードセクション ─────────────── */}
      {showUploader ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium text-foreground">
              銀行明細をアップロード
            </h2>
            {storedTransactions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUploader(false)}
                className="text-xs text-muted-foreground"
              >
                キャンセル
              </Button>
            )}
          </div>
          <CsvUploader onComplete={handleUploadComplete} />
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {sessionResults.length > 0
              ? `${sessionResults.length}件をマッチングしました`
              : `${storedTransactions.length}件の明細があります`}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowUploader(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            新しいCSVをアップロード
          </Button>
        </div>
      )}

      {/* ── 今回のマッチング結果（アップロード直後） ─ */}
      {showSessionResults && (
        <MatchingResultList
          transactions={sessionResults}
          title="今回のマッチング結果"
          refreshOnAction={false}
        />
      )}

      {/* ── DB 明細（フィルター適用） ────────────── */}
      {showSessionResults && filteredDbTransactions.length > 0 && <Separator />}

      {filteredDbTransactions.length > 0 ? (
        <MatchingResultList
          transactions={filteredDbTransactions}
          title={
            showSessionResults && activeFilter === "unmatched"
              ? "過去の未処理明細"
              : listTitles[activeFilter]
          }
          onRefresh={handleRefresh}
        />
      ) : (
        !showSessionResults && (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-border">
            <p className="text-sm text-muted-foreground">
              {emptyMessages[activeFilter]}
            </p>
            {!isAllPeriods && (
              <button
                className="mt-2 text-xs text-primary hover:underline"
                onClick={handleShowAllPeriods}
              >
                全期間で検索する
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
