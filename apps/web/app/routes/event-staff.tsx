import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, Link } from "react-router";

import type { Route } from "./+types/event-staff";
import {
  fetchEvent,
  fetchStaffSession,
  postStaffTaskDecision,
} from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getStatusMeta, mapTaskAttempts } from "../lib/experience";
import {
  getTaskCategoryLabel,
  getTaskProofHint,
} from "../lib/task-presentation";
import { ScreenShell } from "../components/screen-shell";

function normalizeCodeInput(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function formatVerificationCode(code: string) {
  return normalizeCodeInput(code).replace(/(.{3})/g, "$1 ").trim();
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchEvent(params.eventSlug, request);
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() ?? "lookup";
  const pin = formData.get("pin")?.toString() ?? "";
  const verificationCode = normalizeCodeInput(
    formData.get("verificationCode")?.toString() ?? "",
  );

  const fields = {
    pin,
    verificationCode,
  };

  if (!pin || !verificationCode) {
    return {
      error: "Enter the staff PIN and participant code.",
      fields,
    };
  }

  try {
    if (intent === "approve-task" || intent === "reject-task") {
      const taskAttemptId = formData.get("taskAttemptId")?.toString() ?? "";

      if (!taskAttemptId) {
        return {
          error: "Choose a task to review.",
          fields,
        };
      }

      const staffSession = await postStaffTaskDecision({
        action: intent === "approve-task" ? "approve" : "reject",
        eventSlug: params.eventSlug,
        pin,
        request,
        taskAttemptId,
        verificationCode,
      });

      return {
        fields,
        staffSession,
        success:
          intent === "approve-task"
            ? "Task approved."
            : "Task rejected.",
      };
    }

    const staffSession = await fetchStaffSession({
      eventSlug: params.eventSlug,
      pin,
      request,
      verificationCode,
    });

    return {
      fields,
      staffSession,
      success: "Participant loaded.",
    };
  } catch {
    return {
      error: "Lookup failed. Check the staff PIN and participant code.",
      fields,
    };
  }
}

export default function EventStaff({
  actionData,
  loaderData,
  params,
}: Route.ComponentProps) {
  const staffSession =
    actionData && "staffSession" in actionData ? actionData.staffSession : null;
  const session = staffSession?.session ?? null;
  const rows = staffSession ? mapTaskAttempts(staffSession) : [];
  const reviewableCount = rows.filter(({ attempt }) =>
    ["COMPLETED_BY_USER", "PENDING_STAFF_CHECK"].includes(attempt?.status ?? ""),
  ).length;
  const verifiedCount = rows.filter(
    ({ attempt }) => attempt?.status === "VERIFIED",
  ).length;
  const rewardTierLabel =
    loaderData.settingsJson?.rewardTiers.find(
      (tier) => tier.key === session?.rewardTier,
    )?.label ??
    session?.rewardTier ??
    "Not unlocked";
  const themeStyle = getBrandingStyle({
    event: loaderData,
    session,
  });
  const fields =
    actionData && "fields" in actionData
      ? actionData.fields
      : { pin: "", verificationCode: "" };

  return (
    <ScreenShell
      eyebrow="Staff panel"
      title="Verify a participant"
      description="Enter the participant code, check proof on their phone, then approve or reject each claimed task."
      style={themeStyle}
      width="wide"
    >
      <div className="space-y-4">
        <Form className="card-surface rounded-[2rem] p-5" method="post">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Participant lookup
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                Staff PIN and code
              </h2>
            </div>
            <StatusBadge label="PIN required" tone="warning" />
          </div>
          <div className="mt-5 grid gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Staff PIN
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none ring-[var(--color-primary)] focus:ring-2"
                defaultValue={fields.pin}
                inputMode="numeric"
                name="pin"
                placeholder="1234"
                type="password"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Participant code
              </span>
              <input
                className="mt-2 w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 font-display text-2xl font-semibold uppercase tracking-[0.18em] outline-none ring-[var(--color-primary)] focus:ring-2"
                defaultValue={formatVerificationCode(fields.verificationCode)}
                name="verificationCode"
                placeholder="ABC 123"
                spellCheck={false}
              />
            </label>
          </div>
          {actionData && "error" in actionData ? (
            <p className="mt-4 text-sm font-medium text-rose-700">{actionData.error}</p>
          ) : null}
          {actionData && "success" in actionData ? (
            <p className="mt-4 text-sm font-medium text-emerald-700">
              {actionData.success}
            </p>
          ) : null}
          <div className="mt-5">
            <Button name="intent" type="submit" value="lookup">
              Look up participant
            </Button>
          </div>
        </Form>

        {session ? (
          <>
            <div className="rounded-[2rem] bg-[var(--color-primary)] p-5 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-32px_rgba(15,109,83,0.8)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-75">
                    Participant
                  </p>
                  <h2 className="mt-2 font-display text-3xl font-semibold">
                    {session.name ?? "Unnamed participant"}
                  </h2>
                  {session.email ? (
                    <p className="mt-1 text-sm opacity-80">{session.email}</p>
                  ) : null}
                </div>
                <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                  {formatVerificationCode(session.verificationCode)}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/14 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] opacity-75">
                    Claimed
                  </p>
                  <p className="mt-2 font-display text-3xl font-semibold">
                    {session.claimedPoints}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/14 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] opacity-75">
                    Verified
                  </p>
                  <p className="mt-2 font-display text-3xl font-semibold">
                    {session.verifiedPoints}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                  Tier: {rewardTierLabel}
                </span>
                <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                  {session.instantRewardEligible
                    ? "Instant reward eligible"
                    : "Instant reward locked"}
                </span>
                <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]">
                  {session.dailyDrawEligible
                    ? "Daily draw eligible"
                    : "Daily draw locked"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="card-surface rounded-[1.5rem] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Ready
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {reviewableCount}
                </p>
              </div>
              <div className="card-surface rounded-[1.5rem] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Verified
                </p>
                <p className="mt-2 font-display text-2xl font-semibold">
                  {verifiedCount}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {rows.map(({ attempt, status, task }) => {
                const taskStatus = attempt?.status ?? "NOT_STARTED";
                const canReview = !["NOT_STARTED", "IN_PROGRESS"].includes(taskStatus);
                const proofHint = getTaskProofHint(task);

                return (
                  <div className="card-surface rounded-[1.5rem] p-4" key={task.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {task.title}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {getTaskCategoryLabel(task)} - {task.points} pts
                        </p>
                      </div>
                      <StatusBadge
                        label={attempt ? status.label : getStatusMeta("NOT_STARTED").label}
                        tone={attempt ? status.tone : "neutral"}
                      />
                    </div>
                    {proofHint ? (
                      <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm leading-6 text-slate-700">
                        {proofHint}
                      </p>
                    ) : null}
                    {canReview && attempt ? (
                      <Form className="mt-4 grid grid-cols-2 gap-3" method="post">
                        <input name="pin" type="hidden" value={fields.pin} />
                        <input
                          name="verificationCode"
                          type="hidden"
                          value={session.verificationCode}
                        />
                        <input name="taskAttemptId" type="hidden" value={attempt.id} />
                        <Button name="intent" type="submit" value="approve-task">
                          Approve
                        </Button>
                        <Button
                          name="intent"
                          tone="secondary"
                          type="submit"
                          value="reject-task"
                        >
                          Reject
                        </Button>
                      </Form>
                    ) : (
                      <p className="mt-3 text-sm text-slate-600">
                        No participant claim for this task yet.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        <Link className="action-link action-link-secondary" to={`/${params.eventSlug}`}>
          Back to event
        </Link>
      </div>
    </ScreenShell>
  );
}
