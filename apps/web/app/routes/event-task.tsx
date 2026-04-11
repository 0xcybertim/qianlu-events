import { useState } from "react";
import { Form, Link, redirect } from "react-router";
import {
  buildFacebookCommentText,
  getFacebookCommentTaskConfig,
} from "@qianlu-events/domain";
import { Button, StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-task";
import {
  fetchExperience,
  parseParticipantSessionResponse,
  postApi,
} from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getStatusMeta, mapTaskAttempts } from "../lib/experience";
import {
  getTaskActionLinks,
  getTaskCategoryLabel,
  getTaskInstructions,
  getTaskPrimaryActionLabel,
  getTaskProofHint,
  getTaskSecondaryActionLabel,
} from "../lib/task-presentation";
import { ScreenShell } from "../components/screen-shell";

function humanizeTaskId(taskId: string) {
  return taskId
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function CopyCommentButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      tone="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      type="button"
    >
      {copied ? "Copied" : "Copy comment text"}
    </Button>
  );
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "claim") {
    const response = await postApi(
      `/task-attempts/${params.taskId}/claim`,
      {
        eventSlug: params.eventSlug,
        status: formData.get("status"),
      },
      request,
    );

    await parseParticipantSessionResponse(response);

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  if (intent === "form-submit") {
    const response = await postApi(
      `/task-attempts/${params.taskId}/form-submit`,
      {
        eventSlug: params.eventSlug,
        name: formData.get("name")?.toString() || undefined,
        email: formData.get("email")?.toString() || undefined,
        answer1: formData.get("answer1")?.toString() || undefined,
        answer2: formData.get("answer2")?.toString() || undefined,
        answer3: formData.get("answer3")?.toString() || undefined,
        phone: formData.get("phone")?.toString() || undefined,
        optIn: formData.get("optIn") === "on",
      },
      request,
    );

    await parseParticipantSessionResponse(response);

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  if (intent === "await-auto-verification") {
    const response = await postApi(
      `/task-attempts/${params.taskId}/await-auto-verification`,
      {
        eventSlug: params.eventSlug,
      },
      request,
    );

    await parseParticipantSessionResponse(response);

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  return null;
}

export default function EventTask({ loaderData, params }: Route.ComponentProps) {
  const session = loaderData.session;

  if (!session) {
    throw new Response("Participant session could not be created.", {
      status: 500,
    });
  }

  const taskItem = mapTaskAttempts(loaderData).find(
    ({ task }) => task.id === params.taskId,
  );

  if (!taskItem) {
    throw new Response("Task not found.", { status: 404 });
  }

  const taskLabel = taskItem.task.title || humanizeTaskId(params.taskId);
  const status = getStatusMeta(taskItem.attempt?.status ?? "NOT_STARTED");
  const actionLinks = getTaskActionLinks(taskItem.task);
  const instructions = getTaskInstructions(taskItem.task);
  const proofHint = getTaskProofHint(taskItem.task);
  const facebookCommentConfig = getFacebookCommentTaskConfig(taskItem.task);
  const requiredCommentText = buildFacebookCommentText({
    task: taskItem.task,
    verificationCode: session.verificationCode,
  });
  const isFacebookCommentTask =
    Boolean(facebookCommentConfig?.autoVerify) && Boolean(requiredCommentText);
  const handlesInlineForm = [
    "LEAD_FORM",
    "QUIZ",
    "NEWSLETTER_OPT_IN",
    "WHATSAPP_OPT_IN",
  ].includes(
    taskItem.task.type,
  );
  const isLeadForm = taskItem.task.type === "LEAD_FORM";
  const isQuiz = taskItem.task.type === "QUIZ";
  const isWhatsApp = taskItem.task.type === "WHATSAPP_OPT_IN";
  const isStampScan = taskItem.task.type === "STAMP_SCAN";
  const themeStyle = getBrandingStyle(loaderData);

  return (
    <ScreenShell
      eyebrow="Task detail"
      title={taskLabel}
      description={
        isFacebookCommentTask
          ? "Open the Facebook post, leave the exact comment text shown below, then let the app wait for automatic verification."
          : "Complete the task on this screen, submit your claim, and return to the summary when you are ready for staff verification."
      }
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                {getTaskCategoryLabel(taskItem.task)}
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold">
                {taskItem.task.type}
              </h2>
            </div>
            <StatusBadge label={status.label} tone={status.tone} />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            {taskItem.task.description}
          </p>
          <div className="mt-5 rounded-2xl bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {isFacebookCommentTask ? "Automatic verification" : "Staff will check"}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {isFacebookCommentTask
                ? "After you post the exact comment, this task waits for Facebook comment verification and updates automatically."
                : taskItem.task.requiresVerification
                  ? "This task needs a visible proof step before it counts for instant rewards."
                  : "This task updates your claimed score as soon as you submit it."}
            </p>
            {proofHint ? (
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Proof to show: {proofHint}
              </p>
            ) : null}
          </div>
          {actionLinks.length > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              {actionLinks.map((link) => (
                <a
                  key={link.href}
                  className={
                    link.tone === "primary"
                      ? "action-link action-link-primary"
                      : "action-link action-link-secondary"
                  }
                  href={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
          {handlesInlineForm ? (
            <Form className="mt-6 space-y-4" method="post">
              <input name="intent" type="hidden" value="form-submit" />
              {isLeadForm ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Name
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                      defaultValue={session.name ?? ""}
                      name="name"
                      placeholder="Your name"
                      required
                      type="text"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Email
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                      defaultValue={session.email ?? ""}
                      name="email"
                      placeholder="you@example.com"
                      required
                      type="email"
                    />
                  </label>
                  <label className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-700">
                    <input className="size-4 accent-[var(--color-primary)]" name="optIn" type="checkbox" />
                    Keep me informed about future events and offers.
                  </label>
                </>
              ) : null}

              {isQuiz ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Question 1
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                      name="answer1"
                      placeholder="Your answer"
                      required
                      type="text"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Question 2
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                      name="answer2"
                      placeholder="Your answer"
                      required
                      type="text"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                      Question 3
                    </span>
                    <input
                      className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                      name="answer3"
                      placeholder="Your answer"
                      required
                      type="text"
                    />
                  </label>
                </>
              ) : null}

              {isWhatsApp ? (
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Phone number
                  </span>
                  <input
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
                    name="phone"
                    placeholder="+31 ..."
                    required
                    type="tel"
                  />
                </label>
              ) : null}

              {taskItem.task.type === "NEWSLETTER_OPT_IN" ? (
                <label className="flex items-center gap-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-slate-700">
                  <input className="size-4 accent-[var(--color-primary)]" name="optIn" type="checkbox" />
                  I want to receive campaign and event updates.
                </label>
              ) : null}

              <Button type="submit">
                Submit task
              </Button>
            </Form>
          ) : isStampScan ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                Scan this stamp QR code at the event. The task updates
                automatically when the stamp is accepted.
              </div>
              <Link className="action-link action-link-primary w-full" to={`/${params.eventSlug}/scan`}>
                Open scanner
              </Link>
            </div>
          ) : isFacebookCommentTask && facebookCommentConfig && requiredCommentText ? (
            <>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                {instructions.map((instruction, index) => (
                  <li key={instruction}>
                    {index + 1}. {instruction}
                  </li>
                ))}
              </ol>
              <div className="mt-5 rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Exact comment text
                </p>
                <p className="mt-3 font-display text-2xl font-semibold tracking-[0.08em] text-slate-950">
                  {requiredCommentText}
                </p>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  {facebookCommentConfig.commentInstructions ??
                    "Use this exact text so the system can match your Facebook comment to this session automatically."}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <CopyCommentButton value={requiredCommentText} />
                <Form method="post">
                  <input name="intent" type="hidden" value="await-auto-verification" />
                  <Button type="submit">
                    {taskItem.attempt?.status === "PENDING_AUTO_VERIFICATION"
                      ? "Check again"
                      : "I've commented"}
                  </Button>
                </Form>
              </div>
              <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                {taskItem.attempt?.status === "VERIFIED"
                  ? "Your Facebook comment has been verified automatically."
                  : taskItem.attempt?.status === "PENDING_AUTO_VERIFICATION"
                    ? "The app is waiting for your Facebook comment to arrive. Verification can take a short time."
                    : "Once you comment and confirm here, the task will switch to waiting for Facebook comment verification."}
              </div>
            </>
          ) : (
            <>
              <ol className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                {instructions.map((instruction, index) => (
                  <li key={instruction}>
                    {index + 1}. {instruction}
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap gap-3">
                <Form method="post">
                  <input name="intent" type="hidden" value="claim" />
                  <input name="status" type="hidden" value="COMPLETED_BY_USER" />
                  <Button type="submit">
                    {getTaskPrimaryActionLabel(taskItem.task)}
                  </Button>
                </Form>
                <Form method="post">
                  <input name="intent" type="hidden" value="claim" />
                  <input name="status" type="hidden" value="PENDING_STAFF_CHECK" />
                  <Button tone="secondary" type="submit">
                    {getTaskSecondaryActionLabel(taskItem.task)}
                  </Button>
                </Form>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Link className="action-link action-link-primary" to={`/${params.eventSlug}/summary`}>
            Continue to summary
          </Link>
          <Link className="action-link action-link-secondary" to={`/${params.eventSlug}/tasks`}>
            Back to task list
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
