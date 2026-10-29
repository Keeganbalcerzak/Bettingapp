"use client";

import { ChevronRight, Layers, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatSignedPct } from "@/lib/odds/convert";
import { ParlaySummary, useSlipPricing } from "./ParlaySummary";
import { cn, useDecimalOdds } from "./ui";

/** Floating betslip available on every page except the full builder. */
export function SlipDock() {
  const pathname = usePathname();
  const { slip, pricing } = useSlipPricing();
  const [openRaw, setOpen] = useState(false);
  const decOdds = useDecimalOdds();
  const open = openRaw && slip.legs.length > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname.startsWith("/parlay") || !slip.legs.length || !pricing) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded-xl border border-[#244680] bg-accent-strong px-4 py-3 text-white shadow-2xl hover:bg-[#1d4ed8]"
      >
        <Layers className="h-5 w-5" aria-hidden />
        <span className="text-left leading-tight">
          <span className="block text-sm font-semibold">
            {slip.legs.length} leg{slip.legs.length > 1 ? "s" : ""} · {decOdds(pricing.boostedDecimal)}
          </span>
          <span className="block text-xs text-white/80 tnum">{formatSignedPct(pricing.ev)} EV</span>
        </span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Betslip">
          <button type="button" aria-label="Close betslip" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className={cn("relative h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl")}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Betslip</h2>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-ink-2 hover:text-ink">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ParlaySummary compact />
            <Link href="/parlay" onClick={() => setOpen(false)} className="mt-5 flex items-center justify-between rounded-lg border border-line-2 px-3 py-2.5 text-sm text-ink-2 hover:text-ink hover:bg-surface-2">
              Open the full parlay builder and auto-optimizer
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
