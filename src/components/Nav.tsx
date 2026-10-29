"use client";

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSlip } from "@/lib/client/slip";
import { cn } from "./ui";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/board", label: "Odds board" },
  { href: "/parlay", label: "Parlay builder" },
  { href: "/tracker", label: "Tracker" },
  { href: "/settings", label: "Settings" },
  { href: "/learn", label: "How it works" },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-ink shrink-0">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-strong">
        <FlaskConical className="h-4 w-4 text-white" aria-hidden />
      </span>
      <span className="hidden sm:inline">ParlayLab</span>
      <span className="sr-only sm:hidden">ParlayLab</span>
    </Link>
  );
}

export function NavFallback() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center">
        <Brand />
      </div>
    </header>
  );
}

export function Nav() {
  const pathname = usePathname();
  const slip = useSlip();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
        <Brand />
        <nav className="flex items-center gap-1 overflow-x-auto text-sm -mx-1 px-1">
          {LINKS.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "rounded-md px-2.5 py-1.5 whitespace-nowrap transition-colors",
                  active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {l.label}
                {l.href === "/parlay" && slip.legs.length ? (
                  <span className="ml-1.5 rounded-full bg-accent-strong px-1.5 text-[11px] text-white tnum">{slip.legs.length}</span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
