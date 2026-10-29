"use client";

import { Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import { decimalToAmerican, formatAmerican, formatDecimal } from "@/lib/odds/convert";
import { useSettings } from "@/lib/client/settings";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-line bg-surface", className)}>{children}</div>;
}

export function SectionTitle({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="text-sm text-ink-2 mt-0.5">{subtitle}</p> : null}
      </div>
      {right}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-white hover:bg-[#1d4ed8] disabled:bg-surface-3 disabled:text-ink-3",
  secondary: "bg-surface-2 text-ink border border-line-2 hover:bg-surface-3 disabled:text-ink-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-neg-bg text-neg border border-[#5a2326] hover:bg-[#3a1a1d]",
};

export function Button({
  children,
  onClick,
  variant = "secondary",
  size = "md",
  disabled,
  title,
  className,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm",
        BUTTON[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ExternalButton({ href, children, disabled, title, className }: { href: string | null; children: ReactNode; disabled?: boolean; title?: string; className?: string }) {
  if (!href || disabled) {
    return (
      <span title={title} className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium bg-surface-3 text-ink-3 cursor-not-allowed", className)}>
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium bg-accent-strong text-white hover:bg-[#1d4ed8]", className)}
    >
      {children}
    </a>
  );
}

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "pos" | "neg" | "warn" | "accent"; className?: string; title?: string }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2 border-line-2",
    pos: "bg-pos-bg text-pos border-[#1d4d2f]",
    neg: "bg-neg-bg text-neg border-[#5a2326]",
    warn: "bg-warn-bg text-warn border-[#5a4517]",
    accent: "bg-accent-bg text-[#8ab4ff] border-[#244680]",
  };
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

/** EV shown with an explicit sign so the color never carries meaning alone. */
export function EvBadge({ ev, className }: { ev: number; className?: string }) {
  const pct = (ev * 100).toFixed(1);
  const tone = ev >= 0.005 ? "pos" : ev <= -0.03 ? "neg" : "neutral";
  return (
    <Badge tone={tone} className={cn("tnum", className)} title="Expected value per $1 at FanDuel's price">
      {ev > 0 ? "+" : ""}
      {pct}% EV
    </Badge>
  );
}

export function confidenceLabel(c: number): { label: string; tone: "pos" | "accent" | "neutral" | "neg" } {
  if (c >= 70) return { label: "Strong", tone: "pos" };
  if (c >= 55) return { label: "Lean", tone: "accent" };
  if (c >= 40) return { label: "Neutral", tone: "neutral" };
  return { label: "Pass", tone: "neg" };
}

export function ConfidenceMeter({ value, compact }: { value: number; compact?: boolean }) {
  const { label, tone } = confidenceLabel(value);
  const fill = { pos: "bg-pos", accent: "bg-accent", neutral: "bg-ink-3", neg: "bg-neg" }[tone];
  return (
    <div className="flex items-center gap-2" title={`Confidence ${value}/100 (${label})`}>
      <div className={cn("h-1.5 rounded-full bg-surface-3 overflow-hidden", compact ? "w-10" : "w-16")}>
        <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
      <span className="text-xs text-ink-2 tnum">
        {value}
        {compact ? "" : ` ${label}`}
      </span>
    </div>
  );
}

export function useOdds() {
  const { oddsFormat } = useSettings();
  return (american: number) => (oddsFormat === "decimal" ? formatDecimal(american > 0 ? 1 + american / 100 : 1 + 100 / -american) : formatAmerican(american));
}

export function useDecimalOdds() {
  const { oddsFormat } = useSettings();
  return (decimal: number) => (oddsFormat === "decimal" ? formatDecimal(decimal) : formatAmerican(decimalToAmerican(decimal)));
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 rounded-lg bg-surface-2 animate-pulse-soft" />
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line-2 p-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children ? <div className="mt-1 text-sm text-ink-2">{children}</div> : null}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label="More info"
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-ink-3 hover:text-ink-2"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <span id={id} role="tooltip" className="absolute z-50 left-1/2 -translate-x-1/2 top-5 w-64 rounded-lg border border-line-2 bg-surface-2 p-2.5 text-xs font-normal text-ink-2 shadow-xl">
          {children}
        </span>
      ) : null}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pos" | "neg" }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold", tone === "pos" ? "text-pos" : tone === "neg" ? "text-neg" : "text-ink")}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-ink-2">{sub}</p> : null}
    </Card>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cn("text-[#8ab4ff] hover:underline", className)}>
      {children}
    </Link>
  );
}

export function Segmented<T extends string>({ value, options, onChange, size = "md" }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className="inline-flex rounded-lg border border-line-2 bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
            value === o.value ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-medium text-ink-2 mb-1">
        {label}
        {hint ? <Hint>{hint}</Hint> : null}
      </span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-line-2 bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent/50";
