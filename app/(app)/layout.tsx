import Link from "next/link";
import { MemberAvatar } from "@/components/bs/avatar";
import { NavLinks } from "@/components/bs/nav-links";
import { CautionTape } from "@/components/bs/site";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const viewer = await requireViewer();

  let pending = 0;
  if (viewer.isAdmin) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("shipped_approvals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    pending = count ?? 0;
  }

  const links = [
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/stats", label: "Stats" },
    ...(viewer.isAdmin
      ? [
          { href: "/admin/checkin", label: "Check-in" },
          { href: "/admin/shipped", label: "Permits", badge: pending },
        ]
      : []),
  ];

  const badgeLine = `${viewer.isAdmin ? "Foreman" : "Crew"}: ${viewer.displayName}${viewer.isExcluded ? " · exec, not ranked" : ""}`;

  return (
    <div className="min-h-dvh overflow-x-clip">
      <CautionTape />
      <div className="mx-auto flex min-h-dvh max-w-[1200px] flex-col px-4 pt-20 sm:px-6 sm:pt-[100px]">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <Link
            href="/leaderboard"
            className="font-display text-[1.6rem] leading-none uppercase sm:text-3xl"
          >
            Builder Society
          </Link>
          <NavLinks links={links} />
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href={`/builders/${viewer.memberId}`}
              className="text-slate hover:text-rust flex min-w-0 items-center gap-2 font-semibold uppercase"
              title="Your profile"
            >
              <MemberAvatar
                name={viewer.displayName}
                url={viewer.avatarUrl}
                size={30}
              />
              <span className="truncate">{badgeLine}</span>
            </Link>
            <form action="/auth/signout" method="post">
              <button className="text-slate hover:text-rust min-h-11 px-1 text-sm font-bold tracking-wider whitespace-nowrap uppercase underline-offset-4 hover:underline">
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 py-8 sm:py-10">{children}</main>
        <footer className="text-slate border-dash border-t border-dashed py-6 text-center text-sm font-semibold tracking-[0.2em] uppercase">
          Builder Society · members only · hard hats required
        </footer>
      </div>
    </div>
  );
}
