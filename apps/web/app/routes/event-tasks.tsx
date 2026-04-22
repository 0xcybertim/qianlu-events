import { Link } from "react-router";
import { StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-tasks";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import {
  getParticipantContactBannerText,
  getRewardTiers,
  mapTaskAttempts,
} from "../lib/experience";
import {
  getTaskAnalyticsParams,
  summarizeAnalyticsCounts,
} from "../lib/marketing";
import { getTaskCategoryLabel } from "../lib/task-presentation";
import { ScreenShell } from "../components/screen-shell";

function formatVerificationCode(code: string) {
  return code.replace(/(.{3})/g, "$1 ").trim();
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventTasks({ loaderData, params }: Route.ComponentProps) {
  const session = loaderData.session;

  if (!session) {
    throw new Response("Participant session could not be created.", {
      status: 500,
    });
  }

  const tasks = mapTaskAttempts(loaderData);
  const socialFollowItems = tasks.filter(
    (item) => item.task.type === "SOCIAL_FOLLOW",
  );
  type TaskAttemptItem = (typeof tasks)[number];
  type RenderedTaskCard =
    | { item: TaskAttemptItem; kind: "task" }
    | { items: TaskAttemptItem[]; kind: "social-follow" };
  const renderedTaskCards: RenderedTaskCard[] = [];

  for (const item of tasks) {
    if (item.task.type !== "SOCIAL_FOLLOW") {
      renderedTaskCards.push({ item, kind: "task" });
      continue;
    }

    if (item.task.id !== socialFollowItems[0]?.task.id) {
      continue;
    }

    renderedTaskCards.push({ items: socialFollowItems, kind: "social-follow" });
  }
  const rewardTiers = [...getRewardTiers(loaderData)].sort(
    (firstTier, secondTier) => firstTier.threshold - secondTier.threshold,
  );
  const nextRewardTier =
    rewardTiers.find((tier) => session.claimedPoints < tier.threshold) ?? null;
  const themeStyle = getBrandingStyle(loaderData);
  const startedCount = tasks.filter(
    (item) => item.attempt && item.attempt.status !== "NOT_STARTED",
  ).length;
  const pendingReviewCount = tasks.filter((item) =>
    [
      "COMPLETED_BY_USER",
      "PENDING_STAFF_CHECK",
      "PENDING_AUTO_VERIFICATION",
    ].includes(item.attempt?.status ?? ""),
  ).length;
  const verifiedCount = tasks.filter((item) => item.attempt?.status === "VERIFIED").length;
  const progressPct = tasks.length > 0 ? Math.round((startedCount / tasks.length) * 100) : 0;
  const totalAvailablePoints = tasks.reduce((sum, item) => sum + item.task.points, 0);
  const pointsProgressPct =
    totalAvailablePoints > 0
      ? Math.min(100, Math.round((session.claimedPoints / totalAvailablePoints) * 100))
      : 0;
  const contactBannerText = getParticipantContactBannerText(
    loaderData.event.settingsJson,
  );
  const isAccountConnected = Boolean(session.participantAccountUuid);
  const verifiedTaskIds = tasks
    .filter((item) => item.attempt?.status === "VERIFIED")
    .map((item) => item.task.id);
  const taskTypeSummary = summarizeAnalyticsCounts(
    tasks.map((item) => item.task.type),
  );
  const taskStatusSummary = summarizeAnalyticsCounts(
    tasks.map((item) => item.attempt?.status ?? "NOT_STARTED"),
  );

  return (
    <ScreenShell
      eyebrow="Activities"
      title="Complete activities and build your score"
      description="Choose activities, collect points, and keep your progress clear while you move through the event."
      marketing={{
        analytics: {
          account_connected: isAccountConnected,
          claimed_points: session.claimedPoints,
          next_tier_threshold: nextRewardTier?.threshold ?? null,
          pending_review_count: pendingReviewCount,
          progress_percent: progressPct,
          started_count: startedCount,
          task_status_summary: taskStatusSummary || null,
          task_type_summary: taskTypeSummary || null,
          total_tasks: tasks.length,
          verified_count: verifiedCount,
          verified_points: session.verifiedPoints,
        },
        eventName: loaderData.event.name,
        eventSlug: loaderData.event.slug,
        page: "tasks",
        sessionKey: session.verificationCode,
        settings: loaderData.event.settingsJson,
        verifiedTaskIds,
      }}
      style={themeStyle}
      topContent={
        isAccountConnected ? null : (
          <div className="sticky top-0 z-40 -mx-5 -mt-8 mb-10">
            <div className="relative left-1/2 w-screen -translate-x-1/2 bg-[var(--color-primary)] px-5 py-3 text-[var(--color-primary-contrast)] shadow-[0_10px_24px_-16px_rgba(15,109,83,0.65)]">
              <div className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium leading-5">
                  {contactBannerText}
                </p>
                <Link
                  className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full bg-white/16 px-4 py-2 text-sm font-semibold text-[var(--color-primary-contrast)] transition-colors hover:bg-white/24"
                  data-analytics-cta-name="sticky_account_banner"
                  data-analytics-event="tasks_cta_click"
                  data-analytics-location="sticky_banner"
                  to={`/${params.eventSlug}/account`}
                >
                  Set you email
                </Link>
              </div>
            </div>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
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
            <span className="rounded-full bg-white/16 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
              Raffle: {session.dailyDrawEligible ? "Active" : "Locked"}
            </span>
          </div>
        </div>

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

        <div className="card-surface rounded-[2rem] p-5">
          <p className="text-sm leading-6 text-slate-700">{contactBannerText}</p>
          <Link
            className="action-link action-link-secondary mt-4 w-full"
            data-analytics-cta-name="account_entry"
            data-analytics-event="tasks_cta_click"
            data-analytics-location="contact_card"
            to={`/${params.eventSlug}/account`}
          >
            {isAccountConnected ? "Account connected" : "Set you email"}
          </Link>
        </div>

        <div className="space-y-3">
          {renderedTaskCards.map((card) => {
            if (card.kind === "social-follow") {
              const firstItem = card.items[0];

              if (!firstItem) {
                return null;
              }

              const startedFollowCount = card.items.filter(
                (item) => item.attempt && item.attempt.status !== "NOT_STARTED",
              ).length;
              const verifiedFollowCount = card.items.filter(
                (item) => item.attempt?.status === "VERIFIED",
              ).length;
              const followVerificationRequired = card.items.some(
                (item) => item.task.requiresVerification,
              );
              const totalFollowPoints = card.items.reduce(
                (sum, item) => sum + item.task.points,
                0,
              );
              const groupStatus =
                followVerificationRequired
                  ? verifiedFollowCount === card.items.length
                    ? { label: "Verified", tone: "verified" as const }
                    : startedFollowCount > 0
                      ? {
                          label: `${startedFollowCount}/${card.items.length} done`,
                          tone: "claimed" as const,
                        }
                      : { label: "Open", tone: "neutral" as const }
                  : startedFollowCount === card.items.length
                    ? { label: "Claimed", tone: "claimed" as const }
                    : startedFollowCount > 0
                      ? {
                          label: `${startedFollowCount}/${card.items.length} done`,
                          tone: "claimed" as const,
                        }
                      : { label: "Open", tone: "neutral" as const };

              return (
                <Link
                  className="card-surface block rounded-[2rem] p-5 transition-transform duration-150 hover:-translate-y-0.5"
                  data-analytics-event="task_card_click"
                  data-analytics-location="task_list"
                  key="social-follow-group"
                  to={`/${params.eventSlug}/tasks/${firstItem.task.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                        social follow • {card.items.length} platform
                        {card.items.length === 1 ? "" : "s"} • {totalFollowPoints} point
                        {totalFollowPoints === 1 ? "" : "s"}
                      </p>
                      <h2 className="mt-3 font-display text-2xl font-semibold">
                        Follow us on socials
                      </h2>
                      <p className="mt-2 text-sm leading-6 text-slate-700">
                        {firstItem.task.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <StatusBadge {...groupStatus} />
                      <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        {followVerificationRequired
                          ? `${verifiedFollowCount}/${card.items.length} verified`
                          : `${startedFollowCount}/${card.items.length} claimed`}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            }

            const { attempt, status, task } = card.item;

            return (
              <Link
                className="card-surface block rounded-[2rem] p-5 transition-transform duration-150 hover:-translate-y-0.5"
                data-analytics-attempt-status={attempt?.status ?? "NOT_STARTED"}
                data-analytics-event="task_card_click"
                data-analytics-location="task_list"
                data-analytics-task-status={attempt?.status ?? "NOT_STARTED"}
                {...Object.fromEntries(
                  Object.entries(getTaskAnalyticsParams(task)).map(([key, value]) => [
                    `data-analytics-${key.replace(/_/g, "-")}`,
                    String(value),
                  ]),
                )}
                key={task.id}
                to={`/${params.eventSlug}/tasks/${task.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                      {getTaskCategoryLabel(task)} • {task.points} point{task.points === 1 ? "" : "s"}
                    </p>
                    <h2 className="mt-3 font-display text-2xl font-semibold">
                      {task.title}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {task.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge {...status} />
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      {attempt?.status ?? "NOT_STARTED"}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          className="action-link action-link-primary"
          data-analytics-cta-name="show_summary_screen"
          data-analytics-event="tasks_cta_click"
          data-analytics-location="footer"
          to={`/${params.eventSlug}/summary`}
        >
          Show summary screen
        </Link>
      </div>
    </ScreenShell>
  );
}
