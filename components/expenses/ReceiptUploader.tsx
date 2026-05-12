"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, FileText, ImageIcon, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { analyzeReceipt, type AnalyzeReceiptResult } from "@/app/(dashboard)/expenses/actions";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

interface ReceiptUploaderProps {
  onAnalyzed: (result: AnalyzeReceiptResult) => void;
  initialUsed?: number;
  dailyLimit?: number;
}

type UploaderState = "idle" | "preview" | "error";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_SIZE_MB = 10;

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function ReceiptUploader({
  onAnalyzed,
  initialUsed = 0,
  dailyLimit = 5,
}: ReceiptUploaderProps) {
  const [state, setState] = useState<UploaderState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [usedCount, setUsedCount] = useState(initialUsed);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    // バリデーション
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage("対応していないファイル形式です。JPEG・PNG・WEBP・GIF・PDF を選択してください。");
      setState("error");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`ファイルサイズが ${MAX_SIZE_MB}MB を超えています。`);
      setState("error");
      return;
    }

    // プレビュー URL 生成（画像のみ）
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    setSelectedFile(file);
    setErrorMessage("");
    setState("preview");
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setErrorMessage("");
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = () => {
    if (!selectedFile) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const result = await analyzeReceipt(formData);

      if (!result.ok) {
        setErrorMessage(result.error);
        setState("error");
        return;
      }

      // プレビュー URL をクリーン
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUsedCount((c) => c + 1);
      onAnalyzed(result.data);
    });
  };

  // ── ドラッグ&ドロップハンドラー ───────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  // ── ローディング中（解析中） ────────────────────
  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-primary/40 bg-primary/5 py-16 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <div>
          <p className="font-semibold text-foreground">AIが領収書を解析中...</p>
          <p className="text-sm text-muted-foreground mt-1">数秒かかる場合があります</p>
        </div>
      </div>
    );
  }

  // ── エラー状態 ────────────────────────────────
  if (state === "error") {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-destructive text-sm">エラーが発生しました</p>
            <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="mt-4"
        >
          もう一度試す
        </Button>
      </div>
    );
  }

  // ── プレビュー状態（ファイル選択済み） ────────────
  if (state === "preview" && selectedFile) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-start gap-4">
          {/* プレビュー */}
          <div className="flex-shrink-0 w-24 h-24 rounded-lg border border-border bg-muted overflow-hidden flex items-center justify-center">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="領収書プレビュー"
                className="w-full h-full object-cover"
              />
            ) : (
              <FileText className="h-10 w-10 text-muted-foreground" />
            )}
          </div>

          {/* ファイル情報 */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {(selectedFile.size / 1024).toFixed(0)} KB ·{" "}
              {selectedFile.type === "application/pdf" ? "PDF" : "画像"}
            </p>

            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={handleAnalyze}>
                <ImageIcon className="h-3.5 w-3.5" />
                AIで解析する
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                aria-label="ファイルを削除"
              >
                <X className="h-3.5 w-3.5" />
                削除
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── アイドル状態（ドロップゾーン） ──────────────
  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 border-dashed transition-colors duration-150 cursor-pointer",
        isDragOver
          ? "border-primary bg-primary/10"
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.gif,.pdf"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
        }}
      />

      <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Upload className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-foreground">
            領収書をドラッグ&amp;ドロップ
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            またはクリックしてファイルを選択
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG · PNG · WEBP · GIF · PDF（最大 10MB）
        </p>
        <p className={cn(
          "text-xs font-medium",
          usedCount >= dailyLimit ? "text-destructive" : "text-muted-foreground"
        )}>
          本日の残り解析回数：{Math.max(0, dailyLimit - usedCount)} / {dailyLimit} 回
        </p>
      </div>
    </div>
  );
}
