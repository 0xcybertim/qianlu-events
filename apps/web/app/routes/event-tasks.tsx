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
  const rewardTiers = getRewardTiers(loaderData);
  const nextTier = rewardTiers.find((tier) => tier.threshold > session.claimedPoints);
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
      eyebrow="Task list"
      title="Complete tasks and build your score"
      description="This route will become the participant dashboard. It already reflects the intended layout: large task cards, visible statuses, and clear reward progress."
      marketing={{
        analytics: {
          account_connected: isAccountConnected,
          claimed_points: session.claimedPoints,
          next_tier_threshold: nextTier?.threshold ?? null,
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
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Progress
            </p>
            <p className="mt-3 font-display text-4xl font-semibold">
              {session.claimedPoints} points
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {startedCount} of {tasks.length} tasks started.
              {nextTier
                ? ` ${nextTier.label} is ${nextTier.threshold - session.claimedPoints} points away.`
                : " Top tier reached for this event."}
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
          <div className="card-surface rounded-[2rem] p-5 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Verified
            </p>
            <p className="mt-3 font-display text-3xl font-semibold">
              {session.verifiedPoints}
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-600">
              Points confirmed
            </p>
          </div>
        </div>

        <Link
          className="action-link action-link-primary w-full"
          data-analytics-cta-name="scan_stamp_qr"
          data-analytics-event="tasks_cta_click"
          data-analytics-location="primary_actions"
          to={`/${params.eventSlug}/scan`}
        >
          Scan stamp QR
        </Link>

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

        <div className="grid grid-cols-3 gap-3">
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Started
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{startedCount}</p>
          </div>
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Pending
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{pendingReviewCount}</p>
          </div>
          <div className="card-surface rounded-[1.5rem] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Verified
            </p>
            <p className="mt-2 font-display text-2xl font-semibold">{verifiedCount}</p>
          </div>
        </div>

        <div className="space-y-3">
          {tasks.map(({ attempt, status, task }) => (
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
          ))}
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
