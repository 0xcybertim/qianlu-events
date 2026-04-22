import { Link } from "react-router";
import { StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-summary";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import {
  getInstantRewardStates,
  getPrizeDrawDescription,
  getPrizeDrawItems,
  getPrizeDrawLabel,
  getRewardTypes,
  mapTaskAttempts,
} from "../lib/experience";
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

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventSummary({ loaderData, params }: Route.ComponentProps) {
  const session = loaderData.session;

  if (!session) {
    throw new Response("Participant session could not be created.", {
      status: 500,
    });
  }

  const allRows = mapTaskAttempts(loaderData);
  const rewardTypes = getRewardTypes(loaderData);
  const instantRewards = getInstantRewardStates(loaderData);
  const unlockedInstantRewards = instantRewards.filter((reward) => reward.verified);
  const pendingInstantRewards = instantRewards.filter(
    (reward) => reward.eligible && !reward.verified,
  );
  const hasPrizeDraw = rewardTypes.includes("DAILY_PRIZE_DRAW");
  const prizeDrawLabel = getPrizeDrawLabel(loaderData.event.settingsJson);
  const prizeDrawDescription = getPrizeDrawDescription(loaderData.event.settingsJson);
  const prizeDrawItems = getPrizeDrawItems(loaderData.event.settingsJson);
  const summaryRows = allRows.slice(0, 6);
  const themeStyle = getBrandingStyle(loaderData);
  const needsReviewCount = summaryRows.filter((row) =>
    [
      "COMPLETED_BY_USER",
      "PENDING_STAFF_CHECK",
      "PENDING_AUTO_VERIFICATION",
    ].includes(row.attempt?.status ?? ""),
  ).length;
  const rejectedCount = summaryRows.filter(
    (row) => row.attempt?.status === "REJECTED",
  ).length;
  const verifiedCount = summaryRows.filter(
    (row) => row.attempt?.status === "VERIFIED",
  ).length;
  const verifiedTaskIds = mapTaskAttempts(loaderData)
    .filter((row) => row.attempt?.status === "VERIFIED")
    .map((row) => row.task.id);
  const allNeedsReviewCount = allRows.filter((row) =>
    [
      "COMPLETED_BY_USER",
      "PENDING_STAFF_CHECK",
      "PENDING_AUTO_VERIFICATION",
    ].includes(row.attempt?.status ?? ""),
  ).length;
  const allRejectedCount = allRows.filter(
    (row) => row.attempt?.status === "REJECTED",
  ).length;
  const allVerifiedCount = allRows.filter(
    (row) => row.attempt?.status === "VERIFIED",
  ).length;
  const taskStatusSummary = summarizeAnalyticsCounts(
    allRows.map((row) => row.attempt?.status ?? "NOT_STARTED"),
  );

  return (
    <ScreenShell
      eyebrow="Verification summary"
      title="Show this screen to staff"
      description="This is the participant-facing checkpoint where staff can quickly verify social actions, lead activities, and booth proofs."
      marketing={{
        analytics: {
          claimed_points: session.claimedPoints,
          daily_draw_eligible: session.dailyDrawEligible,
          reward_tier: session.rewardTier ?? null,
          task_status_summary: taskStatusSummary || null,
          total_tasks: allRows.length,
          verification_pending_count: allNeedsReviewCount,
          verification_rejected_count: allRejectedCount,
          verification_verified_count: allVerifiedCount,
          verified_points: session.verifiedPoints,
        },
        eventName: loaderData.event.name,
        eventSlug: loaderData.event.slug,
        page: "summary",
        sessionKey: session.verificationCode,
        settings: loaderData.event.settingsJson,
        verifiedTaskIds,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="rounded-[2rem] bg-[var(--color-primary)] p-6 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-32px_rgba(15,109,83,0.8)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_74%,transparent)]">
            Show this code to staff
          </p>
          <div className="mt-4 rounded-2xl bg-white/14 px-4 py-5 text-center">
            <p className="font-display text-5xl font-semibold tracking-[0.18em]">
              {formatVerificationCode(session.verificationCode)}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
              Staff enter this on their device
            </p>
          </div>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-sm opacity-80">Claimed points</p>
              <p className="font-display text-5xl font-semibold">
                {session.claimedPoints}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-80">Verified points</p>
              <p className="font-display text-4xl font-semibold">
                {session.verifiedPoints}
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              Tier unlocked: {session.rewardTier ?? "Not unlocked"}
            </span>
            {hasPrizeDraw ? (
              <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                {prizeDrawLabel}: {session.claimedPoints} entr{session.claimedPoints === 1 ? "y" : "ies"}
              </span>
            ) : null}
            {unlockedInstantRewards.length > 0 ? (
              <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                Instant rewards: {unlockedInstantRewards.length}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pending
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{needsReviewCount}</p>
          </div>
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Verified
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{verifiedCount}</p>
          </div>
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Rejected
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{rejectedCount}</p>
          </div>
        </div>

        {hasPrizeDraw ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Raffle
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">
                  {prizeDrawLabel}
                </h2>
              </div>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
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
              Every point increases the chance of winning.
            </p>
          </div>
        ) : null}

        <div className="card-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Activity states
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                Claimed versus verified
              </h2>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
              Code {formatVerificationCode(session.verificationCode)}
            </span>
          </div>
          <div className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-700">
            {needsReviewCount > 0
              ? "There are still activities waiting for review or automatic verification."
              : verifiedCount > 0
                ? "All reviewed activities are already reflected below."
                : "No activity has been reviewed yet."}
          </div>
          <div className="mt-5 space-y-3">
            {summaryRows.map((row) => (
              <div
                className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3"
                key={row.task.id}
              >
                <span className="text-sm font-medium text-slate-800">{row.task.title}</span>
                <StatusBadge label={row.status.label} tone={row.status.tone} />
              </div>
            ))}
          </div>
        </div>

        {instantRewards.length > 0 ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Booth rewards
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">
                  Show unlocked instant rewards
                </h2>
              </div>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                {unlockedInstantRewards.length} ready
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {instantRewards.map((reward) => (
                <div
                  className="relative rounded-2xl bg-white/70 px-4 py-3 pr-16"
                  key={reward.rewardKey}
                >
                  <InstantRewardStateIcon
                    eligible={reward.eligible}
                    verified={reward.verified}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{reward.label}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
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
                Rewards marked pending still need review before staff should hand them out.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="account_from_summary"
            data-analytics-event="summary_navigation_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/account`}
          >
            {session.participantAccountUuid ? "Account connected" : "Save progress with email"}
          </Link>
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="back_to_task_list"
            data-analytics-event="summary_navigation_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/tasks`}
          >
            Back to activities
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
