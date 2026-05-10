"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// 型・定数
// ─────────────────────────────────────────────

type ViewMode = "day" | "month" | "year";

const MONTHS_JP = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];
const DAYS_JP = ["日", "月", "火", "水", "木", "金", "土"];

function toEraLabel(year: number): string {
  if (year >= 2019) return `令和${year - 2018}年`;
  if (year >= 1989) return `平成${year - 1988}年`;
  return `昭和${year - 1925}年`;
}

function parseDate(value: string) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function formatDisplay(value: string): string {
  const d = parseDate(value);
  if (!d) return "";
  return `${d.year}年${d.month + 1}月${d.day}日`;
}

/** 12年ページの先頭年（例: 2025 → 2024, 12年単位）*/
function yearPageStart(year: number): number {
  return Math.floor(year / 12) * 12;
}

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// ─────────────────────────────────────────────
// コンポーネント
// ─────────────────────────────────────────────

export function DatePicker({
  value,
  onChange,
  placeholder = "日付を選択",
  disabled,
  className,
}: DatePickerProps) {
  const today = new Date();
  const parsed = parseDate(value);

  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
  const [yrPageStart, setYrPageStart] = useState(
    yearPageStart(parsed?.year ?? today.getFullYear())
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // value 変化時に表示月を同期
  useEffect(() => {
    const d = parseDate(value);
    if (d) { setViewYear(d.year); setViewMonth(d.month); }
  }, [value]);

  const openPicker = () => {
    setViewMode("day");
    setOpen((v) => !v);
  };

  // ── Day ビュー ────────────────────────────────

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const selectDay = (day: number) => {
    onChange(
      `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    );
    setOpen(false);
  };

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const dayCells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (dayCells.length % 7 !== 0) dayCells.push(null);

  const selectedDay =
    parsed?.year === viewYear && parsed?.month === viewMonth ? parsed.day : null;
  const isToday = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === day;

  // ── Month ビュー ──────────────────────────────

  const selectMonth = (month: number) => {
    setViewMonth(month);
    setViewMode("day");
  };

  // ── Year ビュー ───────────────────────────────

  const yearCells = Array.from({ length: 12 }, (_, i) => yrPageStart + i);

  const selectYear = (year: number) => {
    setViewYear(year);
    setViewMode("month");
  };

  // ─────────────────────────────────────────────
  // レンダー
  // ─────────────────────────────────────────────

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* トリガーボタン */}
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors",
          "hover:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-ring ring-2 ring-ring/30",
          !value && "text-muted-foreground"
        )}
      >
        <Calendar className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">{formatDisplay(value) || placeholder}</span>
        {value && (
          <span
            role="button"
            aria-label="クリア"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* ドロップダウン */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-lg border border-border bg-background shadow-lg select-none">

          {/* ══ 年選択ビュー ══════════════════════════════ */}
          {viewMode === "year" && (
            <>
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setYrPageStart((s) => s - 12)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-semibold">
                  {yrPageStart}年 〜 {yrPageStart + 11}年
                </span>
                <button
                  type="button"
                  onClick={() => setYrPageStart((s) => s + 12)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 p-3">
                {yearCells.map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => selectYear(yr)}
                    className={cn(
                      "rounded-md py-2 text-sm transition-colors hover:bg-muted",
                      yr === viewYear && "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold",
                      yr === today.getFullYear() && yr !== viewYear && "ring-1 ring-primary text-primary font-semibold"
                    )}
                  >
                    <div>{yr}年</div>
                    <div className="text-xs opacity-70">{toEraLabel(yr)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ══ 月選択ビュー ══════════════════════════════ */}
          {viewMode === "month" && (
            <>
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y - 1)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => { setYrPageStart(yearPageStart(viewYear)); setViewMode("year"); }}
                  className="rounded px-2 py-1 text-sm font-semibold hover:bg-muted transition-colors"
                >
                  {viewYear}年
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    {toEraLabel(viewYear)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y + 1)}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 p-3">
                {MONTHS_JP.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectMonth(idx)}
                    className={cn(
                      "rounded-md py-2.5 text-sm transition-colors hover:bg-muted",
                      idx === viewMonth && "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold",
                      idx === today.getMonth() && viewYear === today.getFullYear() && idx !== viewMonth &&
                        "ring-1 ring-primary text-primary font-semibold"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ══ 日付ビュー ════════════════════════════════ */}
          {viewMode === "day" && (
            <>
              <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                <button
                  type="button"
                  onClick={prevMonth}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {/* 年クリック → 年選択 / 月クリック → 月選択 */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setYrPageStart(yearPageStart(viewYear)); setViewMode("year"); }}
                    className="rounded px-1.5 py-1 text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    {toEraLabel(viewYear)}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({viewYear})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("month")}
                    className="rounded px-1.5 py-1 text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    {MONTHS_JP[viewMonth]}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={nextMonth}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* 曜日 */}
              <div className="grid grid-cols-7 px-2 pt-2">
                {DAYS_JP.map((d, i) => (
                  <div
                    key={d}
                    className={cn(
                      "py-1 text-center text-xs font-medium",
                      i === 0 && "text-red-500",
                      i === 6 && "text-blue-500",
                      i > 0 && i < 6 && "text-muted-foreground"
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              <div className="grid grid-cols-7 px-2 pb-3">
                {dayCells.map((day, idx) => (
                  <div key={idx} className="flex items-center justify-center py-0.5">
                    {day !== null ? (
                      <button
                        type="button"
                        onClick={() => selectDay(day)}
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-xs transition-colors hover:bg-muted",
                          day === selectedDay &&
                            "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold",
                          isToday(day) && day !== selectedDay &&
                            "ring-1 ring-primary text-primary font-semibold",
                          idx % 7 === 0 && day !== selectedDay && "text-red-500",
                          idx % 7 === 6 && day !== selectedDay && "text-blue-500"
                        )}
                      >
                        {day}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
