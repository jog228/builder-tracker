import Link from "next/link";
import { MemberAvatar } from "@/components/bs/avatar";
import { NavLinks } from "@/components/bs/nav-links";
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
      ? [{ href: "/admin/shipped", label: "Shipped review", badge: pending }]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 sm:px-6">
      <header className="bg-background/70 sticky top-0 z-20 -mx-4 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <Link
          href="/leaderboard"
          className="mr-1 flex items-center gap-2 font-bold tracking-tight"
        >
          <span className="text-xl">🛠️</span>
          <span className="hidden sm:inline">Builder Society</span>
        </Link>
        <NavLinks links={links} />
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/builders/${viewer.memberId}`}
            className="flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-sm hover:bg-white/5"
            title="Your profile"
          >
            <span className="text-muted-foreground hidden md:inline">
              {viewer.displayName}
            </span>
            <MemberAvatar
              name={viewer.displayName}
              url={viewer.avatarUrl}
              size={30}
            />
          </Link>
          <form action="/auth/signout" method="post">
            <button className="text-muted-foreground hover:text-foreground rounded-full px-2.5 py-1.5 text-xs hover:bg-white/5">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 py-8">{children}</main>
      <footer className="text-muted-foreground/60 py-6 text-center text-xs">
        Builder Society · members only
      </footer>
    </div>
  );
}
