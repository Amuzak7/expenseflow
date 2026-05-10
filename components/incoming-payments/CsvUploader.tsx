"use client";

import { useCallback, useRef, useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import { parseCSV, type ParsedBankTransaction } from "@/lib/csv-parser";
import { processCSVUpload, type MatchedTransaction } from "@/app/(dashboard)/incoming-payments/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

type Step = "idle" | "preview" | "processing" | "done" | "error";

interface CsvUploaderProps {
  onComplete: (transactions: MatchedTransaction[]) => void;
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────

export default function CsvUploader({ onComplete }: CsvUploaderProps) {
  const [step, setStep] = useState<Step>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [detectedFormat, setDetectedFormat] = useState("");
  const [parsedRows, setParsedRows] = useState<ParsedBankTransaction[]>([]);
  const [batchId] = useState(() => uuidv4()); // 重複アップロード防止用
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── ファイル読み込み & CSVパース ──────────────
  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      toast.error("CSVファイルを選択してください", {
        description: ".csv 形式のファイルのみ対応しています",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("ファイルサイズが大きすぎます", {
        description: "5MB以下のCSVファイルを選択してください",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);

      setDetectedFormat(result.detectedFormat);
      setWarnings(result.warnings);

      if (result.transactions.length === 0) {
        setStep("error");
        toast.error("入金明細が見つかりませんでした", {
          description:
            result.warnings[0] ?? "CSVのフォーマットを確認してください",
        });
        return;
      }

      setParsedRows(result.transactions);
      setStep("preview");
    };
    reader.onerror = () => {
      toast.error("ファイルの読み込みに失敗しました");
      setStep("error");
    };
    // UTF-8で試みる（Shift-JISの場合はブラウザが自動変換）
    reader.readAsText(file, "UTF-8");
  }, []);

  // ─── ドラッグ & ドロップ ───────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  // ─── マッチング実行 ────────────────────────────
  const handleRunMatching = async () => {
    setStep("processing");
    setProgress(20);

    const uploadData = {
      batchId,
      rows: parsedRows.map((r) => ({
        date: r.date,
        amount: r.amount,
        senderName: r.senderName,
        description: r.description,
        accountLast4: r.accountLast4,
        remittanceCode: r.remittanceCode,
      })),
    };

    setProgress(50);
    const result = await processCSVUpload(uploadData);
    setProgress(90);

    if ("error" in result) {
      setStep("error");
      toast.error("処理に失敗しました", { description: result.error });
      return;
    }

    setProgress(100);
    setStep("done");
    toast.success(`${result.uploadedCount}件の明細をマッチングしました`);
    onComplete(result.transactions);
  };

  // ─── リセット ───────────────────────────────────
  const handleReset = () => {
    setStep("idle");
    setParsedRows([]);
    setWarnings([]);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─────────────────────────────────────────────
  // レンダリング
  // ─────────────────────────────────────────────

  if (step === "done") return null; // 完了後は非表示（結果リストに切り替わる）

  return (
    <div className="space-y-4">
      {/* ── ドロップゾーン ─────────────────────── */}
      {(step === "idle" || step === "error") && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200",
            isDragging
              ? "border-brand-teal bg-brand-teal/5 scale-[1.01]"
              : "border-border hover:border-brand-teal/50 hover:bg-muted/30"
          )}
        >
          <div className="rounded-full bg-muted p-4">
            <Upload className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-base font-medium text-foreground">
              CSVファイルをドロップ
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              または <span className="text-brand-teal underline">クリックして選択</span>
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              三菱UFJ / みずほ / SMBC など主要銀行のCSVに対応 · 最大5MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}

      {/* ── プレビュー & 警告 ─────────────────── */}
      {step === "preview" && (
        <div className="space-y-3">
          {/* 検出フォーマット & 件数サマリー */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <FileText className="h-4 w-4 text-brand-teal flex-shrink-0" />
            <span className="text-sm text-muted-foreground">
              検出フォーマット:{" "}
              <strong className="text-foreground">{detectedFormat}</strong>
            </span>
            <span className="text-muted-foreground/50">|</span>
            <span className="text-sm text-muted-foreground">
              入金行:{" "}
              <strong className="text-foreground">{parsedRows.length}件</strong>
            </span>
          </div>

          {/* 警告メッセージ */}
          {warnings.length > 0 && (
            <Alert variant="default" className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-800">パース時の注意</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-0.5 text-sm text-yellow-700">
                  {warnings.map((w, i) => (
                    <li key={i}>・{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* プレビューテーブル（最大10件） */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    取引日
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                    金額
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                    振込人名義
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground hidden sm:table-cell">
                    摘要
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parsedRows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                      {row.date}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-medium">
                      ¥{row.amount.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-foreground max-w-[180px] truncate">
                      {row.senderName}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate hidden sm:table-cell">
                      {row.description ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 10 && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                ほか {parsedRows.length - 10} 件（全 {parsedRows.length} 件）
              </p>
            )}
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleRunMatching}
              className="bg-primary hover:bg-primary/90"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {parsedRows.length}件のマッチングを実行
            </Button>
            <Button variant="outline" onClick={handleReset}>
              別のファイルを選択
            </Button>
          </div>
        </div>
      )}

      {/* ── 処理中 ────────────────────────────── */}
      {step === "processing" && (
        <div className="rounded-lg border border-border p-8 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-teal" />
            <span className="text-sm font-medium">
              取引先マスタとマッチング中...
            </span>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground">
            振込名義・口座番号で自動マッチングしています
          </p>
        </div>
      )}
    </div>
  );
}
