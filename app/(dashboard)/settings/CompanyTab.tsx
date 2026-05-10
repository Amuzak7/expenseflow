"use client";

import { useState, useRef, useTransition } from "react";
import { Building2, Upload, X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { CompanyInfo } from "./actions";
import { updateCompanyInfo, updateLogoUrl } from "./actions";

interface CompanyTabProps {
  company: CompanyInfo;
}

export default function CompanyTab({ company }: CompanyTabProps) {
  const [form, setForm] = useState({
    name:                company.name               ?? "",
    postal_code:         company.postal_code        ?? "",
    address:             company.address            ?? "",
    phone:               company.phone              ?? "",
    representative_name: company.representative_name ?? "",
  });

  const [logoUrl,    setLogoUrl]    = useState<string | null>(company.logo_url ?? null);
  const [logoPreview, setLogoPreview] = useState<string | null>(company.logo_url ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending,   startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── フォーム変更 ────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // ── ロゴアップロード ────────────────────────
  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error("ファイルサイズは 2MB 以下にしてください");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();

      // プレビュー表示
      const objectUrl = URL.createObjectURL(file);
      setLogoPreview(objectUrl);

      // Storage にアップロード
      const ext      = file.name.split(".").pop() ?? "png";
      const filePath = `${company.id}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("company-logos")
        .getPublicUrl(filePath);

      // キャッシュバスティング付きで保存
      const urlWithTs = `${publicUrl}?t=${Date.now()}`;
      setLogoUrl(urlWithTs);

      const result = await updateLogoUrl(urlWithTs);
      if (result.error) throw new Error(result.error);

      toast.success("ロゴを保存しました");
    } catch (err) {
      console.error("[handleLogoChange]", err);
      setLogoPreview(company.logo_url ?? null);
      toast.error("ロゴのアップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  // ── ロゴ削除 ─────────────────────────────────
  const handleLogoRemove = async () => {
    setIsUploading(true);
    try {
      const result = await updateLogoUrl(null);
      if (result.error) throw new Error(result.error);
      setLogoUrl(null);
      setLogoPreview(null);
      toast.success("ロゴを削除しました");
    } catch {
      toast.error("ロゴの削除に失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  // ── フォーム保存 ─────────────────────────────
  const handleSave = () => {
    startTransition(async () => {
      const result = await updateCompanyInfo(form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("会社情報を保存しました");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* ── ロゴセクション ──────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">会社ロゴ</h2>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          月次レポートに表示されます（PNG / JPG / WEBP / SVG、最大 2MB）
        </p>

        <div className="flex items-center gap-4">
          {/* プレビュー */}
          <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden flex-shrink-0">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoPreview}
                alt="会社ロゴ"
                className="h-full w-full object-contain"
              />
            ) : (
              <Building2 className="h-8 w-8 text-muted-foreground/30" />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              className="sr-only"
              onChange={handleLogoChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isUploading ? "アップロード中..." : "ロゴをアップロード"}
            </Button>
            {logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogoRemove}
                disabled={isUploading}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4" />
                削除
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── 会社情報フォーム ────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">基本情報</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* 会社名 */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="name">
              会社名 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="株式会社〇〇"
              className="h-9"
            />
          </div>

          {/* 代表者名 */}
          <div className="space-y-1.5">
            <Label htmlFor="representative_name">代表者名</Label>
            <Input
              id="representative_name"
              name="representative_name"
              value={form.representative_name}
              onChange={handleChange}
              placeholder="山田 太郎"
              className="h-9"
            />
          </div>

          {/* 電話番号 */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">電話番号</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={handleChange}
              placeholder="03-0000-0000"
              className="h-9"
            />
          </div>

          {/* 郵便番号 */}
          <div className="space-y-1.5">
            <Label htmlFor="postal_code">郵便番号</Label>
            <Input
              id="postal_code"
              name="postal_code"
              value={form.postal_code}
              onChange={handleChange}
              placeholder="100-0001"
              className="h-9"
            />
          </div>

          {/* 住所 */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="address">住所</Label>
            <Input
              id="address"
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="東京都千代田区〇〇1-2-3"
              className="h-9"
            />
          </div>
        </div>

        {/* 保存ボタン */}
        <div className="flex justify-end pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={isPending} size="default">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isPending ? "保存中..." : "変更を保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}
