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
    <nav className="flex items-center gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "relative rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "text-foreground bg-white/10"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
            {!!l.badge && (
              <span className="bg-primary text-primary-foreground tabular ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold">
                {l.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
