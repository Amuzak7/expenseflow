"use client";

import { useState, useEffect, useTransition } from "react";
import {
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  Trash2,
  Loader2,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchExpenseAttachments,
  getAttachmentSignedUrl,
  deleteExpenseAttachment,
  type AttachmentRow,
} from "@/app/(dashboard)/expenses/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024)      return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function FileTypeIcon({ mimeType, className }: { mimeType: string | null; className?: string }) {
  if (!mimeType) return <File className={className} />;
  if (mimeType.startsWith("image/")) return <FileImage className={className} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") {
    return <FileSpreadsheet className={className} />;
  }
  if (mimeType.includes("word") || mimeType.includes("document")) {
    return <FileText className={className} />;
  }
  return <FileText className={className} />;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface AttachmentListProps {
  expenseId:   string;
  /** 削除ボタンを表示するか（submitted 状態の申請のみ true） */
  canDelete?:  boolean;
  /** 削除後に呼び出すコールバック */
  onDeleted?:  () => void;
  className?:  string;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export default function AttachmentList({
  expenseId,
  canDelete = false,
  onDeleted,
  className,
}: AttachmentListProps) {
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // マウント時に取得
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchExpenseAttachments(expenseId).then((rows) => {
      if (!cancelled) {
        setAttachments(rows);
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [expenseId]);

  // ── ダウンロード ───────────────────────────
  const handleDownload = async (attachment: AttachmentRow) => {
    setDownloadingId(attachment.id);
    const result = await getAttachmentSignedUrl(attachment.file_path);
    setDownloadingId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    // <a> タグでダウンロード
    const a = document.createElement("a");
    a.href = result.data;
    a.download = attachment.file_name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── 削除 ─────────────────────────────────
  const handleDelete = (attachment: AttachmentRow) => {
    setDeletingId(attachment.id);
    startTransition(async () => {
      const result = await deleteExpenseAttachment(attachment.id);
      setDeletingId(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("添付ファイルを削除しました");
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
      onDeleted?.();
    });
  };

  // ── ローディング ──────────────────────────
  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground py-2", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        添付ファイルを読み込み中…
      </div>
    );
  }

  // ── 添付なし ──────────────────────────────
  if (attachments.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground py-1", className)}>
        <Paperclip className="h-3.5 w-3.5" />
        添付ファイルなし
      </div>
    );
  }

  // ── リスト表示 ────────────────────────────
  return (
    <ul className={cn("space-y-1.5", className)}>
      {attachments.map((attachment) => {
        const isDownloading = downloadingId === attachment.id;
        const isDeleting    = deletingId === attachment.id;
        const isBusy        = isDownloading || isDeleting;

        return (
          <li
            key={attachment.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm"
          >
            <FileTypeIcon
              mimeType={attachment.mime_type}
              className="h-4 w-4 flex-shrink-0 text-muted-foreground"
            />
            <span className="flex-1 min-w-0 truncate font-medium text-foreground">
              {attachment.file_name}
            </span>
            {attachment.file_size != null && (
              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums hidden sm:block">
                {formatBytes(attachment.file_size)}
              </span>
            )}

            {/* ダウンロード */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDownload(attachment)}
              disabled={isBusy}
              className="h-7 w-7 p-0 flex-shrink-0"
              aria-label="ダウンロード"
            >
              {isDownloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </Button>

            {/* 削除（canDelete が true のときのみ） */}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(attachment)}
                disabled={isBusy}
                className="h-7 w-7 p-0 flex-shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                aria-label="削除"
              >
                {isDeleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
