import { CautionTape, Eyebrow } from "@/components/bs/site";
import { GoogleButton, LoginForm } from "./login-form";

export const metadata = { title: "Log in · Builder Society" };

const ERRORS: Record<string, string> = {
  domain:
    "Use your @lehigh.edu Google account. Personal Google accounts can't sign in.",
  "admins-only":
    "Email links are only for exec board members. Sign in with Google instead.",
  "linked-elsewhere":
    "Your roster entry is already linked to a different login. Ask an exec board member to reset it.",
  google: "Couldn't reach Google sign-in. Try again in a minute.",
  link: "That sign-in didn't go through or the link expired. Try again.",
  "not-member":
    "That login isn't on the Builder Society roster. Ask an exec board member to add you.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-dvh overflow-x-clip">
      <CautionTape />
      <main className="flex min-h-dvh items-center justify-center px-4 pt-24 pb-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <Eyebrow>Site access · members only</Eyebrow>
            <h1 className="font-display mt-3 text-5xl leading-[0.95] uppercase">
              Builder Society
            </h1>
            <p className="text-slate mt-3 text-lg leading-snug">
              The members-only leaderboard. Sign in with your Lehigh Google
              account.
            </p>
          </div>
          <div className="bg-paper border-ink border-[3px] p-6 shadow-[8px_8px_0_var(--ink)]">
            {error && ERRORS[error] && (
              <p className="border-bad text-bad mb-4 border-2 px-3 py-2 font-semibold">
                {ERRORS[error]}
              </p>
            )}
            <GoogleButton />
            <details className="group border-dash mt-6 border-t border-dashed pt-4">
              <summary className="text-slate hover:text-rust cursor-pointer text-sm font-bold tracking-widest uppercase select-none">
                Exec board: email me a link instead
              </summary>
              <div className="mt-4">
                <LoginForm />
              </div>
            </details>
          </div>
        </div>
      </main>
    </div>
  );
}
