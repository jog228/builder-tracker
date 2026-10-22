import { LoginForm } from "./login-form";

export const metadata = { title: "Log in · Builder Society" };

const ERRORS: Record<string, string> = {
  "not-member":
    "That login isn't linked to a Builder Society member. Ask an organizer to add your email.",
  link: "That login link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-5xl">🛠️</div>
          <h1 className="text-3xl font-black tracking-tight">
            Builder Society
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            The members-only leaderboard. Sign in with the email an organizer
            added for you.
          </p>
        </div>
        <div className="bg-card/80 rounded-2xl border p-6 shadow-2xl shadow-black/30 backdrop-blur">
          {error && ERRORS[error] && (
            <p className="mb-4 rounded-lg bg-rose-400/10 px-3 py-2 text-sm text-rose-300">
              {ERRORS[error]}
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
