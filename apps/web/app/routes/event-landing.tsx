import { Link } from "react-router";

import type { Route } from "./+types/event-landing";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import {
  getInstantRewardStates,
  getPrizeDrawDescription,
  getPrizeDrawItems,
  getPrizeDrawLabel,
  getRewardTiers,
  getRewardTypes,
  mapTaskAttempts,
} from "../lib/experience";
import { buildPageTitle, humanizeSlug } from "../lib/meta";
import { summarizeAnalyticsCounts } from "../lib/marketing";
import { ScreenShell } from "../components/screen-shell";

function formatVerificationCode(code: string) {
  return code.replace(/(.{3})/g, "$1 ").trim();
}

function InstantRewardStateIcon({
  eligible,
  verified,
}: {
  eligible: boolean;
  verified: boolean;
}) {
  const toneClass = verified
    ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
    : eligible
      ? "bg-amber-100 text-amber-900"
      : "bg-slate-100 text-slate-500";

  return (
    <span
      className={`absolute right-4 top-4 inline-flex size-10 items-center justify-center rounded-full ${toneClass}`}
    >
      {verified ? (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 20 20">
          <path
            d="m5 10 3 3 7-7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        </svg>
      ) : eligible ? (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 20 20">
          <path
            d="M10 5.5v4l2.5 2.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <circle
            cx="10"
            cy="10"
            fill="none"
            r="6.5"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      ) : (
        <svg aria-hidden="true" className="size-5" viewBox="0 0 20 20">
          <rect
            fill="none"
            height="7"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
            width="10"
            x="5"
            y="9"
          />
          <path
            d="M7.5 9V7.6a2.5 2.5 0 0 1 5 0V9"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      )}
    </span>
  );
}

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("Overview", params.eventSlug) }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventLanding({ loaderData, params }: Route.ComponentProps) {
  const eventName = loaderData.event.name || humanizeSlug(params.eventSlug);
  const themeStyle = getBrandingStyle(loaderData);
  const rewardTiers = [...getRewardTiers(loaderData)].sort(
    (firstTier, secondTier) => firstTier.threshold - secondTier.threshold,
  );
  const rewardTypes = getRewardTypes(loaderData);
  const rewardTypeSummary = summarizeAnalyticsCounts(
    loaderData.event.settingsJson?.rewardTypes ?? [],
  );
  const taskTypeSummary = summarizeAnalyticsCounts(
    loaderData.event.tasks.map((task) => task.type),
  );
  const taskPlatformSummary = summarizeAnalyticsCounts(
    loaderData.event.tasks.map((task) => task.platform),
  );
  const session = loaderData.session;

  if (!session) {
    return (
      <ScreenShell
        eyebrow="Scan. Complete. Show. Win."
        title={eventName}
        description="Visitors complete social and lead activities, collect points, and show this experience to staff for reward verification."
        marketing={{
          analytics: {
            has_session: false,
            reward_tier_count: rewardTiers.length,
            reward_type_summary: rewardTypeSummary || null,
            task_platform_summary: taskPlatformSummary || null,
            task_type_summary: taskTypeSummary || null,
            total_tasks: loaderData.event.tasks.length,
          },
          eventName,
          eventSlug: loaderData.event.slug,
          page: "landing",
          settings: loaderData.event.settingsJson,
        }}
        style={themeStyle}
      >
        <div className="space-y-4">
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Reward structure
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">
                  Earn points across socials, leads, and booth activities
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
                Live event
              </span>
            </div>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
              <li>{loaderData.event.tasks.length} active activities configured for this event</li>
              <li>
                {rewardTiers.length > 0
                  ? `Reward tiers start at ${rewardTiers[0]?.threshold} points`
                  : "Reward tiers will be configured per event"}
              </li>
              <li>Participant session: not started</li>
            </ul>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                className="action-link action-link-primary"
                data-analytics-cta-name="start_tasks"
                data-analytics-event="landing_cta_click"
                data-analytics-location="hero"
                to={`/${params.eventSlug}/tasks`}
              >
                Start activities
              </Link>
              <Link
                className="action-link action-link-secondary"
                data-analytics-cta-name="scan_stamp_qr"
                data-analytics-event="landing_cta_click"
                data-analytics-location="hero"
                to={`/${params.eventSlug}/scan`}
              >
                Scan stamp QR
              </Link>
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  const tasks = mapTaskAttempts(loaderData);
  const instantRewards = getInstantRewardStates(loaderData);
  const unlockedInstantRewards = instantRewards.filter((reward) => reward.verified);
  const pendingInstantRewards = instantRewards.filter(
    (reward) => reward.eligible && !reward.verified,
  );
  const hasPrizeDraw = rewardTypes.includes("DAILY_PRIZE_DRAW");
  const prizeDrawLabel = getPrizeDrawLabel(loaderData.event.settingsJson);
  const prizeDrawDescription = getPrizeDrawDescription(loaderData.event.settingsJson);
  const prizeDrawItems = getPrizeDrawItems(loaderData.event.settingsJson);
  const startedCount = tasks.filter(
    (item) => item.attempt && item.attempt.status !== "NOT_STARTED",
  ).length;
  const progressPct = tasks.length > 0 ? Math.round((startedCount / tasks.length) * 100) : 0;
  const totalAvailablePoints = tasks.reduce((sum, item) => sum + item.task.points, 0);
  const pointsProgressPct =
    totalAvailablePoints > 0
      ? Math.min(100, Math.round((session.claimedPoints / totalAvailablePoints) * 100))
      : 0;
  const verifiedTaskIds = tasks
    .filter((item) => item.attempt?.status === "VERIFIED")
    .map((item) => item.task.id);

  return (
    <ScreenShell
      eyebrow="Overview"
      title={eventName}
      description="Track your points, rewards, and raffle entries from one place."
      marketing={{
        analytics: {
          has_session: true,
          claimed_points: session.claimedPoints,
          reward_tier_count: rewardTiers.length,
          reward_type_summary: rewardTypeSummary || null,
          task_platform_summary: taskPlatformSummary || null,
          task_type_summary: taskTypeSummary || null,
          total_tasks: loaderData.event.tasks.length,
          verified_points: session.verifiedPoints,
        },
        eventName,
        eventSlug: loaderData.event.slug,
        page: "landing",
        sessionKey: session.verificationCode,
        settings: loaderData.event.settingsJson,
        verifiedTaskIds,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="rounded-[2rem] bg-[var(--color-primary)] p-5 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-34px_rgba(15,109,83,0.72)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_74%,transparent)]">
            Your event code
          </p>
          <div className="mt-3 rounded-[1.5rem] bg-white/14 px-4 py-4 text-center">
            <p className="font-display text-4xl font-semibold tracking-[0.18em]">
              {formatVerificationCode(session.verificationCode)}
            </p>
          </div>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold opacity-86">Points earned</p>
                <p className="font-display text-2xl font-semibold">
                  {session.claimedPoints}/{totalAvailablePoints}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-[var(--color-secondary)]"
                  style={{ width: `${pointsProgressPct}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm font-semibold opacity-86">Activities completed</p>
                <p className="font-display text-2xl font-semibold">
                  {startedCount}/{tasks.length}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-[var(--color-secondary)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/16 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
              Tier: {session.rewardTier ?? "Not unlocked"}
            </span>
            {hasPrizeDraw ? (
              <span className="rounded-full bg-white/16 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {prizeDrawLabel}: {session.claimedPoints} entr{session.claimedPoints === 1 ? "y" : "ies"}
              </span>
            ) : null}
          </div>
        </div>

        {instantRewards.length > 0 ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Instant rewards
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  Instant rewards
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-contrast)]">
                {unlockedInstantRewards.length} unlocked
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {instantRewards.map((reward) => (
                <div
                  className={[
                    "relative rounded-2xl border px-4 py-3 pr-16",
                    reward.verified
                      ? "border-[var(--color-primary)] bg-[color:color-mix(in_srgb,var(--color-primary)_10%,white)]"
                      : reward.eligible
                        ? "border-amber-200 bg-amber-50"
                        : "border-[var(--color-border)] bg-white/70",
                  ].join(" ")}
                  key={reward.rewardKey}
                >
                  <InstantRewardStateIcon
                    eligible={reward.eligible}
                    verified={reward.verified}
                  />
                  <div>
                    <p className="font-semibold text-slate-950">{reward.label}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {reward.linkedTasks.length > 0
                        ? reward.taskMatchMode === "ALL"
                          ? "Complete all of these tasks"
                          : "Complete any of these tasks"
                        : reward.taskIds.length > 0
                          ? "Linked task is currently unavailable"
                          : "No tasks linked yet"}
                    </p>
                    {reward.linkedTasks.length > 0 ? (
                      <div className="mt-4 grid gap-3">
                        {reward.linkedTasks.map((task) => (
                          <Link
                            className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[1.1rem] bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-[var(--color-primary-contrast)] shadow-[0_16px_32px_-20px_rgba(15,109,83,0.7)] transition-transform duration-150 hover:-translate-y-0.5"
                            data-analytics-event="instant_reward_task_link_click"
                            data-analytics-location="landing_instant_reward_card"
                            data-analytics-reward-key={reward.rewardKey}
                            key={`${reward.rewardKey}-${task.id}`}
                            to={`/${params.eventSlug}/tasks/${task.id}`}
                          >
                            <span className="min-w-0 flex-1 text-left text-base leading-6">
                              {task.title}
                            </span>
                            <span className="shrink-0 text-xs uppercase tracking-[0.14em] opacity-80">
                              Open
                            </span>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {reward.taskIds.length > 0
                          ? "Reactivate or relink this task from the rewards setup."
                          : "Add task links from the rewards setup."}
                      </p>
                    )}
                    {reward.description ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {reward.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {pendingInstantRewards.length > 0 ? (
              <p className="mt-4 text-sm leading-6 text-slate-700">
                Some booth rewards are waiting for verification before staff can hand them out.
              </p>
            ) : null}
          </div>
        ) : null}

        {hasPrizeDraw ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Raffle
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  {prizeDrawLabel}
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-contrast)]">
                {session.claimedPoints} entr{session.claimedPoints === 1 ? "y" : "ies"}
              </span>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-700">
              {prizeDrawDescription}
            </p>
            {prizeDrawItems.length > 0 ? (
              <div className="mt-4 rounded-2xl bg-white/70 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                  Prizes
                </p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  {prizeDrawItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
              {session.claimedPoints > 0
                ? "Keep earning points to increase your chance of winning."
                : "Complete your first activity to start collecting raffle entries."}
            </p>
          </div>
        ) : null}

        {rewardTiers.length > 0 ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Rewards
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  What you unlocked
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-contrast)]">
                {session.claimedPoints} pts
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {rewardTiers.map((tier) => {
                const isUnlocked = session.claimedPoints >= tier.threshold;
                const pointsRemaining = Math.max(
                  tier.threshold - session.claimedPoints,
                  0,
                );

                return (
                  <div
                    className={[
                      "rounded-2xl border px-4 py-3",
                      isUnlocked
                        ? "border-[var(--color-primary)] bg-[color:color-mix(in_srgb,var(--color-primary)_10%,white)]"
                        : "border-[var(--color-border)] bg-white/70",
                    ].join(" ")}
                    key={tier.key}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {tier.label}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {tier.threshold} points needed
                        </p>
                        {tier.description ? (
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {tier.description}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
                          isUnlocked
                            ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                            : "bg-slate-950/7 text-slate-600",
                        ].join(" ")}
                      >
                        {isUnlocked ? "Unlocked" : `${pointsRemaining} to go`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-primary"
            data-analytics-cta-name="open_activities"
            data-analytics-event="landing_cta_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/tasks`}
          >
            Open activities
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
