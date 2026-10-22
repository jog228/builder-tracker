import {
  BadgeCheck,
  CalendarCheck,
  Code,
  Crown,
  Flame,
  Gift,
  GitMerge,
  HandHeart,
  Handshake,
  Heart,
  MonitorPlay,
  Rocket,
  ShieldOff,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Card, SectionTitle } from "@/components/bs/bits";
import { Icon } from "@/components/bs/icon";
import { Eyebrow, PageTitle, Stamp } from "@/components/bs/site";
import { meetingTimeLabel } from "@/lib/attendance/weeks";
import { requireReader } from "@/lib/auth";
import {
  BADGES,
  BONUS,
  BUILDER_OF_THE_MONTH,
  GITHUB,
  STREAK_MIN_SUBSTANCE,
  UPDATE_MIN_SUBSTANCE,
  WEEKLY_MEETING,
  WEIGHTS,
} from "@/lib/scoring/config";

export const metadata = { title: "How it works · Builder Society" };

// Everything numeric on this page is read from lib/scoring/config.ts, so the
// rubric can't drift from what the scorer actually does.

const SUBSTANCE = ["chatter", "a little", "solid", "major"];
const WEEKDAYS = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const pts = (n: number) => `${n} pt${n === 1 ? "" : "s"}`;

type Rule = {
  icon: LucideIcon;
  what: string;
  points: string;
  cap: number | null;
  how: string;
  soon?: boolean;
};

const RULES: Rule[] = [
  {
    icon: TrendingUp,
    what: "Progress update",
    points: `${WEIGHTS.progressUpdate.points} each`,
    cap: WEIGHTS.progressUpdate.cap,
    how: `A GroupMe post about what you're building. Claude rates each post 0–3 for substance; any real update (${UPDATE_MIN_SUBSTANCE}+, “${SUBSTANCE[UPDATE_MIN_SUBSTANCE]}”) earns points. Chatter (0) doesn't.`,
  },
  {
    icon: Rocket,
    what: "Shipped",
    points: `${WEIGHTS.shipped.points} each`,
    cap: WEIGHTS.shipped.cap,
    how: "A launch: something real people can use. Needs an approved permit (below), and counts once per project.",
  },
  {
    icon: Handshake,
    what: "Helping others",
    points: `${WEIGHTS.helpGiven.points} each`,
    cap: WEIGHTS.helpGiven.cap,
    how: "Answering a question, unblocking someone, or sharing a useful article, link or tool, in any channel.",
  },
  {
    icon: Heart,
    what: "Likes received",
    points: `${WEIGHTS.likesReceived.points} each`,
    cap: WEIGHTS.likesReceived.cap,
    how: "Likes on your progress and shipped posts. Liking your own post doesn't count.",
  },
  {
    icon: Flame,
    what: "Streak",
    points: `+${WEIGHTS.streakWeek.points} per week`,
    cap: WEIGHTS.streakWeek.cap,
    how: `Post a detailed update (substance ${STREAK_MIN_SUBSTANCE}+, “${SUBSTANCE[STREAK_MIN_SUBSTANCE]}”: what you built, results, what's next) in back-to-back weeks. Each week that continues a streak adds a bonus. Your profile marks every update “Streak week” or “Too light for streak”.`,
  },
  {
    icon: CalendarCheck,
    what: "Weekly meeting",
    points: `${WEIGHTS.eventAttended.points * WEEKLY_MEETING.weight} each`,
    cap: WEIGHTS.eventAttended.cap,
    how: `Show up ${WEEKDAYS[WEEKLY_MEETING.weekday]}s at ${meetingTimeLabel()}. An exec signs you in at the door.`,
  },
  {
    icon: MonitorPlay,
    what: "Demo",
    points: `+${BONUS.demoPoints}`,
    cap: null,
    how: "Show what you built at a meeting. It also counts as attending.",
  },
  {
    icon: HandHeart,
    what: "Community help",
    points: BONUS.community.amounts.map((n) => `+${n}`).join(" or "),
    cap: null,
    how: `Community help: ${BONUS.community.amounts.map((n) => `+${n}`).join(" or ")} for small tasks like Instagram features. An exec awards it from your profile, with the reason shown there.`,
  },
  {
    icon: Gift,
    what: "Other bonus",
    points: "varies",
    cap: null,
    how: "Exec-awarded for things like helping run a workshop, always with a reason on your profile.",
  },
  {
    icon: Code,
    what: "GitHub active day",
    points: `${WEIGHTS.githubActiveDay.points} per day`,
    cap: WEIGHTS.githubActiveDay.cap,
    how: "A day with commits to a linked GitHub account.",
    soon: !GITHUB.enabled,
  },
  {
    icon: GitMerge,
    what: "GitHub merged PR",
    points: `${WEIGHTS.githubMergedPr.points} each`,
    cap: WEIGHTS.githubMergedPr.cap,
    how: "A pull request merged on a linked GitHub account.",
    soon: !GITHUB.enabled,
  },
];

const cappedMax = RULES.filter((r) => !r.soon && r.cap !== null).reduce(
  (sum, r) => sum + (r.cap ?? 0),
  0,
);

export default async function HowItWorksPage() {
  await requireReader(); // members, or a read-only guest

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Eyebrow>Site rules · scoring rubric</Eyebrow>
        <PageTitle className="mt-3">How it works</PageTitle>
        <p className="text-slate mt-3 max-w-2xl text-xl leading-snug">
          You earn points for building in public: posting progress, shipping,
          helping, and showing up. Scores reset on the 1st of each month
          (Eastern time; weeks start Monday). All-time totals keep everything.
        </p>
        <p className="border-ink bg-paper mt-4 max-w-2xl border-l-[6px] px-4 py-3 text-xl leading-snug font-semibold">
          Any real update earns points. Detailed updates (what you built,
          results, what&apos;s next) keep your streak alive.
        </p>
      </div>

      <section className="bg-paper border-ink border-[3px] p-4 sm:p-6">
        <SectionTitle hint="per month">What earns points</SectionTitle>
        <div
          aria-hidden="true"
          className="border-ink hidden grid-cols-[minmax(0,14rem)_8rem_6rem_minmax(0,1fr)] gap-4 border-b-[3px] py-2 text-[0.8rem] font-bold tracking-widest uppercase sm:grid"
        >
          <span>Work</span>
          <span>Points</span>
          <span>Cap</span>
          <span>How it counts</span>
        </div>
        <ul>
          {RULES.map((r) => (
            <li
              key={r.what}
              className="border-rule grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-b py-3 sm:grid-cols-[minmax(0,14rem)_8rem_6rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
            >
              <span className="flex items-center gap-2 text-lg font-bold">
                <Icon icon={r.icon} tone={r.soon ? "ink" : "accent"} />
                {r.what}
              </span>
              <span className="font-display text-right text-xl sm:text-left">
                {r.points}
              </span>
              <span className="text-slate col-span-2 text-sm font-bold tracking-wider uppercase sm:col-span-1 sm:text-base">
                {r.cap === null ? "No cap" : `Cap ${r.cap}`}
              </span>
              <span className="col-span-2 leading-snug sm:col-span-1">
                {r.soon && (
                  <span className="bg-ink text-safety mr-2 px-1.5 text-xs font-bold tracking-wider uppercase">
                    Coming soon
                  </span>
                )}
                {r.how}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-slate mt-4">
          Caps keep any one thing from dominating: capped work tops out at{" "}
          <strong className="text-ink">{pts(cappedMax)}</strong> a month.
          Meetings, demos and bonuses have no cap.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <SectionTitle>Permits</SectionTitle>
          <p className="leading-snug">
            Shipping is worth the most, so a person checks it. When Claude
            thinks a post is a launch, it files a permit for the exec board.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            <li className="flex items-start gap-3">
              <Stamp tone="pending">Pending</Stamp>
              <span className="leading-snug">
                Waiting for review. It counts as a progress update meanwhile.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <Stamp tone="approved">Approved</Stamp>
              <span className="leading-snug">
                Shipped: {pts(WEIGHTS.shipped.points)}, once per project, up to{" "}
                {WEIGHTS.shipped.cap} a month.
              </span>
            </li>
          </ul>
          <p className="text-slate mt-4 text-sm leading-snug">
            Renamed your project? The same project under a new name still counts
            once.
          </p>
        </Card>

        <Card>
          <SectionTitle>Builder of the Month</SectionTitle>
          <p className="flex items-start gap-2 leading-snug">
            <Icon icon={Crown} tone="accent" className="mt-0.5 text-xl" />
            <span>
              The leaderboard shows who&apos;s leading this month. At month end,
              the exec board looks at the top {BUILDER_OF_THE_MONTH.finalists}{" "}
              on the monthly leaderboard and picks the winner, weighing what
              they built, not just the points.
            </span>
          </p>
          <div className="mt-6" />
          <SectionTitle>Who&apos;s ranked</SectionTitle>
          <p className="flex items-start gap-2 leading-snug">
            <Icon icon={ShieldOff} className="mt-0.5 text-xl" />
            <span>
              Exec board members run the club, so they&apos;re never ranked,
              scored, badged or eligible for awards. Their likes on your posts
              still count for you.
            </span>
          </p>
          <p className="text-slate mt-4 flex items-start gap-2 text-sm leading-snug">
            <Icon icon={BadgeCheck} className="mt-0.5" />
            Scores update nightly, and right after an exec takes attendance or
            approves a permit. Tap anyone on the leaderboard to see exactly
            where their points came from.
          </p>
        </Card>
      </div>

      <Card>
        <SectionTitle hint="more coming soon">Badges</SectionTitle>
        <ul className="flex flex-col gap-3">
          <li className="flex items-start gap-3">
            <Icon
              icon={CalendarCheck}
              tone="accent"
              className="mt-0.5 text-2xl"
            />
            <span className="leading-snug">
              <strong>Never Misses: {BADGES.neverMisses.description}</strong>{" "}
              <span className="text-slate">
                Earned for each month you attend every weekly meeting held (at
                least {BADGES.neverMisses.minMeetings}). During the month your
                tile shows “On track · 4 of 4”; the badge is awarded once the
                month ends and it&apos;s yours for good (“Never Misses · Oct
                2026”).
              </span>
            </span>
          </li>
          <li className="text-slate leading-snug">
            Shipper, On Fire, Night Owl, Crowd Favorite, Helper and Demo Day are
            coming soon.
          </li>
        </ul>
      </Card>
    </div>
  );
}
