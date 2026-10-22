"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavLinks({
  links,
}: {
  links: { href: string; label: string; badge?: number }[];
}) {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="flex flex-wrap gap-1.5 text-[0.9rem] font-bold tracking-[0.08em] uppercase"
    >
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-ink inline-flex min-h-11 items-center border-2 px-3 whitespace-nowrap transition-colors sm:px-4",
              active ? "bg-ink text-paper" : "hover:bg-paper",
            )}
          >
            {l.label}
            {!!l.badge && (
              <span
                className={cn(
                  "tabular ml-1.5",
                  active ? "text-safety" : "text-rust",
                )}
              >
                ({l.badge})
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
