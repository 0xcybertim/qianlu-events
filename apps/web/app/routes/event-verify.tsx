import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/event-verify";
import {
  fetchExperience,
  parseParticipantSessionResponse,
  postApi,
} from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getStatusMeta, mapTaskAttempts } from "../lib/experience";
import { ScreenShell } from "../components/screen-shell";

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const pin = formData.get("pin")?.toString() ?? "";
  const taskAttemptIds = formData
    .getAll("taskAttemptId")
    .map((value) => value.toString())
    .filter(Boolean);

  if (!pin) {
    return {
      error: "Staff PIN is required.",
    };
  }

  try {
    if (intent === "verify-pin") {
      await postApi(
        "/verification/pin/verify",
        {
          pin,
        },
        request,
      );

      return {
        success: "PIN accepted.",
      };
    }

    if (taskAttemptIds.length === 0) {
      return {
        error: "Select at least one task to review.",
      };
    }

    const routeSuffix = intent === "reject-selected" ? "reject" : "approve";

    for (const taskAttemptId of taskAttemptIds) {
      const response = await postApi(
        `/verification/task-attempts/${taskAttemptId}/${routeSuffix}`,
        {
          eventSlug: params.eventSlug,
          pin,
        },
        request,
      );

      await parseParticipantSessionResponse(response);
    }

    return redirect(`/${params.eventSlug}/summary`);
  } catch {
    return {
      error: "Verification failed. Check the staff PIN and try again.",
    };
  }
}

export default function EventVerify({ actionData, loaderData, params }: Route.ComponentProps) {
  const session = loaderData.session;

  if (!session) {
    throw new Response("Participant session could not be created.", {
      status: 500,
    });
  }

  const reviewableTasks = mapTaskAttempts(loaderData).filter(({ attempt }) =>
    ["COMPLETED_BY_USER", "PENDING_STAFF_CHECK"].includes(attempt?.status ?? ""),
  );
  const reviewedTasks = mapTaskAttempts(loaderData).filter(({ attempt }) =>
    ["VERIFIED", "REJECTED"].includes(attempt?.status ?? ""),
  );
  const themeStyle = getBrandingStyle(loaderData);

  return (
    <ScreenShell
      eyebrow="Staff-only action"
      title="PIN-protected verification"
      description="Staff can verify or reject the participant’s claimed tasks here. Decisions are stored and immediately update reward eligibility."
      style={themeStyle}
    >
      <div className="space-y-4">
        <Form className="space-y-4" method="post">
          <div className="rounded-[2rem] bg-[var(--color-primary)] p-5 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-32px_rgba(15,109,83,0.8)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_78%,transparent)]">
              Booth review
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-75">Claimed</p>
                <p className="mt-2 font-display text-3xl font-semibold">
                  {session.claimedPoints}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-75">Verified</p>
                <p className="mt-2 font-display text-3xl font-semibold">
                  {session.verifiedPoints}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] opacity-75">Code</p>
                <p className="mt-2 font-display text-3xl font-semibold">
                  {session.id.slice(-4).toUpperCase()}
                </p>
              </div>
            </div>
          </div>

          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Verification mode
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">
                  Staff review flow
                </h2>
              </div>
              <StatusBadge label="PIN required" tone="warning" />
            </div>
            <div className="mt-5 rounded-2xl bg-white/70 p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Staff PIN
              </label>
              <input
                className="mt-3 w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-base outline-none ring-[var(--color-primary)] focus:ring-2"
                inputMode="numeric"
                name="pin"
                placeholder="1234"
                type="password"
              />
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
              <button
                className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)] underline decoration-dotted underline-offset-4"
                name="intent"
                type="submit"
                value="verify-pin"
              >
                Check PIN first
              </button>
            </div>
          </div>

          <div className="card-surface rounded-[2rem] p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Ready for review
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                Claimed tasks
              </h2>
            </div>
            <div className="mt-5 space-y-3">
              {reviewableTasks.length > 0 ? (
                reviewableTasks.map(({ attempt, status, task }) => (
                  <label
                    className="flex items-start gap-3 rounded-2xl bg-white/70 px-4 py-3"
                    key={task.id}
                  >
                    <input
                      className="mt-1 size-4 accent-[var(--color-primary)]"
                      defaultChecked
                      name="taskAttemptId"
                      type="checkbox"
                      value={attempt?.id}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{task.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                            {attempt?.status}
                          </p>
                        </div>
                        <StatusBadge label={status.label} tone={status.tone} />
                      </div>
                    </div>
                  </label>
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  No tasks are currently waiting for staff review.
                </p>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button name="intent" type="submit" value="approve-selected">
                Approve selected tasks
              </Button>
              <Button name="intent" tone="secondary" type="submit" value="reject-selected">
                Reject selected tasks
              </Button>
            </div>
          </div>

          <div className="card-surface rounded-[2rem] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
              Already reviewed
            </p>
            <div className="mt-4 space-y-3">
              {reviewedTasks.length > 0 ? (
                reviewedTasks.map(({ attempt, status, task }) => (
                  <div
                    className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3"
                    key={task.id}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{task.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                        {attempt?.status}
                      </p>
                    </div>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-600">No reviewed tasks yet.</p>
              )}
            </div>
          </div>
        </Form>

        <Link className="action-link action-link-secondary" to={`/${params.eventSlug}/summary`}>
          Back to summary
        </Link>
      </div>
    </ScreenShell>
  );
}
