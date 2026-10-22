import Link from "next/link";
import { CautionTape, Eyebrow } from "@/components/bs/site";
import { GoogleButton } from "@/app/login/login-form";

export const metadata = { title: "Not on the roster · Builder Society" };

// Lehigh Google accounts that aren't on the roster land here (already signed out).
export default function NotAMemberPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <CautionTape />
      <main className="flex min-h-dvh items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-md">
          <div className="bg-paper border-ink border-[3px] p-6 shadow-[8px_8px_0_var(--ink)] sm:p-8">
            <Eyebrow>Site access · authorized crew only</Eyebrow>
            <h1 className="font-display mt-3 text-[2.5rem] leading-[0.95] uppercase">
              You&apos;re not on the crew list yet
            </h1>
            <p className="text-slate mt-4 text-lg leading-snug">
              Thanks for stopping by! Your Lehigh account worked, but it
              isn&apos;t on the Builder Society roster, so there&apos;s no
              leaderboard spot for you yet.
            </p>
            <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-lg leading-snug">
              <li>
                Already in the GroupMe? Ask an exec board member to add your
                Lehigh email to the roster.
              </li>
              <li>
                Want to join? Come to a meeting and post what you&apos;re
                building.
              </li>
              <li>
                Signed in with the wrong account? Pick a different one below.
              </li>
            </ul>
            <div className="mt-6">
              <GoogleButton />
            </div>
            <Link
              href="/login"
              className="text-slate hover:text-rust mt-4 inline-block text-sm font-bold tracking-widest uppercase"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
