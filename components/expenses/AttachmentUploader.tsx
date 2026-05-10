"use client";

import { useRef, useState, useCallback } from "react";
import {
  Paperclip,
  X,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** ファイル選択ダイアログの accept 属性 */
const ACCEPT = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
].join(",");

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.ms-excel",
  "text/csv",
  "text/plain",
]);

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/** MIMEタイプ → ラベル */
const TYPE_LABEL: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "image/gif": "GIF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "application/msword": "DOC",
  "application/vnd.ms-excel": "XLS",
  "text/csv": "CSV",
  "text/plain": "TXT",
};

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    return <FileSpreadsheet className={className} />;
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return <FileText className={className} />;
  }
  return <File className={className} />;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AttachmentUploaderProps {
  files:      File[];
  onChange:   (files: File[]) => void;
  /** 最大ファイル数（デフォルト 10） */
  maxFiles?:  number;
  disabled?:  boolean;
  className?: string;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function AttachmentUploader({
  files,
  onChange,
  maxFiles = 10,
  disabled = false,
  className,
}: AttachmentUploaderProps) {
  const inputRef        = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropError,  setDropError]  = useState<string | null>(null);

  // ── ファイル追加共通処理 ──────────────────────
  const processFiles = useCallback(
    (incoming: File[]) => {
      setDropError(null);

      const invalid = incoming.filter((f) => !ALLOWED_TYPES.has(f.type));
      const tooLarge = incoming.filter(
        (f) => ALLOWED_TYPES.has(f.type) && f.size > MAX_SIZE_BYTES
      );
      const valid = incoming.filter(
        (f) => ALLOWED_TYPES.has(f.type) && f.size <= MAX_SIZE_BYTES
      );

      if (invalid.length > 0) {
        setDropError(
          `対応していない形式: ${invalid.map((f) => f.name).join(", ")}`
        );
      } else if (tooLarge.length > 0) {
        setDropError(
          `20MB超のファイル: ${tooLarge.map((f) => f.name).join(", ")}`
        );
      }

      if (valid.length === 0) return;

      // 重複除去（ファイル名＋サイズが同じものは除く）
      const existing = new Set(files.map((f) => `${f.name}:${f.size}`));
      const unique   = valid.filter((f) => !existing.has(`${f.name}:${f.size}`));
      onChange([...files, ...unique].slice(0, maxFiles));
    },
    [files, onChange, maxFiles]
  );

  // ── ファイル input 変更 ───────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const added = Array.from(e.target.files ?? []);
    if (added.length) processFiles(added);
    e.target.value = ""; // 同じファイルを再選択できるようにリセット
  };

  // ── ドラッグイベント ─────────────────────────
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 子要素へのmouseleaveを無視（currentTargetで判定）
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    const dropped = Array.from(e.dataTransfer.files);
    processFiles(dropped);
  };

  // ── 削除 ────────────────────────────────────
  const handleRemove = (index: number) => {
    setDropError(null);
    onChange(files.filter((_, i) => i !== index));
  };

  const canAdd = files.length < maxFiles && !disabled;

  return (
    <div className={cn("space-y-2", className)}>
      {/* ドラッグゾーン */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-lg border-2 border-dashed transition-all duration-150 p-3",
          isDragOver && canAdd
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border hover:border-border/80",
          disabled && "opacity-50 pointer-events-none"
        )}
      >
        {/* ドラッグ中のオーバーレイ */}
        {isDragOver && canAdd && (
          <div className="absolute inset-0 rounded-lg flex items-center justify-center bg-primary/10 pointer-events-none z-10">
            <div className="flex flex-col items-center gap-1 text-primary">
              <Upload className="h-6 w-6" />
              <span className="text-sm font-medium">ここにドロップ</span>
            </div>
          </div>
        )}

        {/* ファイルリスト */}
        {files.length > 0 && (
          <ul className="space-y-1.5 mb-2">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${file.size}-${i}`}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm"
              >
                <FileTypeIcon
                  mimeType={file.type}
                  className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground"
                />
                <span className="flex-1 min-w-0 truncate text-foreground">
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {TYPE_LABEL[file.type] ?? "FILE"}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums shrink-0">
                  {formatBytes(file.size)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(i)}
                    className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label={`${file.name} を削除`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* 追加エリア */}
        {canAdd ? (
          <div className="flex flex-col items-center gap-2 py-2 text-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              <span className="text-xs">
                ここにファイルをドラッグ＆ドロップ
              </span>
            </div>
            <span className="text-xs text-muted-foreground opacity-60">または</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="gap-1.5 h-7 text-xs"
            >
              <Paperclip className="h-3.5 w-3.5" />
              ファイルを選択
              {files.length > 0 && (
                <span className="text-[10px] opacity-60">
                  （{files.length}/{maxFiles}）
                </span>
              )}
            </Button>
            <p className="text-[10px] text-muted-foreground opacity-70">
              PDF・画像・Word・Excel・CSV（1ファイル最大20MB／最大{maxFiles}件）
            </p>
          </div>
        ) : !disabled ? (
          <p className="text-xs text-muted-foreground text-center py-1">
            最大 {maxFiles} ファイルまで添付できます
          </p>
        ) : null}

        {/* hidden input */}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>

      {/* バリデーションエラー */}
      {dropError && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <X className="h-3 w-3 flex-shrink-0" />
          {dropError}
        </p>
      )}
    </div>
  );
}
