import { Link } from "react-router";
import { StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-tasks";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getRewardTiers, mapTaskAttempts } from "../lib/experience";
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

  return (
    <ScreenShell
      eyebrow="Task list"
      title="Complete tasks and build your score"
      description="This route will become the participant dashboard. It already reflects the intended layout: large task cards, visible statuses, and clear reward progress."
      style={themeStyle}
    >
      <div className="space-y-4">
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

        <Link className="action-link action-link-primary w-full" to={`/${params.eventSlug}/scan`}>
          Scan stamp QR
        </Link>

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

        <Link className="action-link action-link-primary" to={`/${params.eventSlug}/summary`}>
          Show summary screen
        </Link>
      </div>
    </ScreenShell>
  );
}
