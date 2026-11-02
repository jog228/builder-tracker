import Link from "next/link";
import { ArrowLeft, UserX } from "lucide-react";
import { Card, EmptyState } from "@/components/bs/bits";
import { Icon } from "@/components/bs/icon";
import { Eyebrow, PageTitle } from "@/components/bs/site";
import { RespondButtons } from "@/components/teammates/respond-buttons";
import { requireViewer } from "@/lib/auth";
import { tokenProblem, type TokenResult } from "@/lib/teammates/rules";
import { hashToken, isTokenShape } from "@/lib/teammates/token";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Teammate request · Builder Society" };

/**
 * Where teammate emails link. Signed in as the recipient, it shows the
 * request and Confirm / Decline buttons; nothing happens on page load, so
 * link scanners can't use up the token. Bad, used, expired or someone else's
 * links get a friendly explanation.
 */
export default async function RespondPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; action?: string }>;
}) {
  const viewer = await requireViewer();
  const { token, action } = await searchParams;

  let result: TokenResult = "invalid";
  let info: {
    status?: string;
    requesterName?: string | null;
    requesterId?: string;
  } = {};
  if (isTokenShape(token)) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("teammate_token_status", {
      p_token_hash: hashToken(token),
    });
    if (error) throw error;
    result = data.result;
    info = {
      status: data.status,
      requesterName: data.requester_name,
      requesterId: data.requester_id,
    };
  }
  const problem = tokenProblem(result, info);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
        <Eyebrow>Teammate request</Eyebrow>
        <PageTitle className="mt-2 text-[clamp(2rem,7vw,3.25rem)]">
          {problem ? problem.title : `${info.requesterName} added you`}
        </PageTitle>
      </div>
      <Card>
        {problem ? (
          <EmptyState icon={UserX}>
            <p className="text-ink max-w-md text-lg">{problem.body}</p>
          </EmptyState>
        ) : (
          <RespondButtons
            token={token!}
            requesterName={info.requesterName ?? "They"}
            preferred={action === "decline" ? "decline" : "confirm"}
          />
        )}
      </Card>
      <Link
        href={`/builders/${viewer.memberId}`}
        className="text-slate hover:text-rust inline-flex items-center gap-1.5 self-start font-bold tracking-wider uppercase"
      >
        <Icon icon={ArrowLeft} /> Your builder file
      </Link>
    </div>
  );
}
