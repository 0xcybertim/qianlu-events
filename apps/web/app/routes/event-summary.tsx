import { Link } from "react-router";
import { StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-summary";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { mapTaskAttempts } from "../lib/experience";
import { summarizeAnalyticsCounts } from "../lib/marketing";
import { ScreenShell } from "../components/screen-shell";

function formatVerificationCode(code: string) {
  return code.replace(/(.{3})/g, "$1 ").trim();
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
            <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              {session.dailyDrawEligible
                ? "Daily draw eligible"
                : "Daily draw locked"}
            </span>
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
