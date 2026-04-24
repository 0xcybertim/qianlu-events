import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect, useFetcher } from "react-router";
import {
  buildSocialCommentText,
  getSocialCommentTaskConfig,
} from "@qianlu-events/domain";
import type { FormQuestion } from "@qianlu-events/schemas";
import { Button, StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-task";
import {
  fetchExperience,
  parseParticipantSessionResponse,
  postApi,
} from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import { getTaskInstantRewardState, mapTaskAttempts } from "../lib/experience";
import {
  getTaskAnalyticsParams,
  summarizeAnalyticsCounts,
  trackParticipantAnalyticsEvent,
} from "../lib/marketing";
import { getSocialFollowGroupKey } from "../lib/social-follow";
import {
  getTaskActionLinks,
  getTaskCategoryLabel,
  getTaskFormGroupIntroLabel,
  getTaskFormGroups,
  getTaskFormQuestions,
  getTaskInstructions,
  getTaskPrimaryActionLabel,
  getTaskProofHint,
  getTaskSecondaryActionLabel,
} from "../lib/task-presentation";
import { CheckmarkBurst } from "../components/checkmark-burst";
import { ScreenShell } from "../components/screen-shell";

function humanizeTaskId(taskId: string) {
  return taskId
    .split("-")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function taskStatusCountsAsClaimed(status: string | undefined) {
  return [
    "COMPLETED_BY_USER",
    "PENDING_STAFF_CHECK",
    "PENDING_AUTO_VERIFICATION",
    "VERIFIED",
  ].includes(status ?? "");
}

function getCompletedTaskActionLabel(args: {
  requiresVerification: boolean;
  status: string;
  taskType: string;
}) {
  const isSocialCommentTask = [
    "SOCIAL_COMMENT",
    "SOCIAL_COMMENT_SELF_CLAIM",
  ].includes(args.taskType);

  if (args.status === "VERIFIED") {
    return isSocialCommentTask ? "Activity completed" : "Completed";
  }

  if (args.status === "PENDING_STAFF_CHECK") {
    return isSocialCommentTask ? "Activity completed" : "Waiting for review";
  }

  if (args.status === "PENDING_AUTO_VERIFICATION") {
    return isSocialCommentTask ? "Activity completed" : "Checking";
  }

  if (args.status === "COMPLETED_BY_USER") {
    if (isSocialCommentTask) {
      return "Activity completed";
    }

    return "Completed";
  }

  return null;
}

function CopyCommentButton({
  analyticsParams,
  value,
}: {
  analyticsParams: Record<string, string | number | boolean | null | undefined>;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      tone="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          trackParticipantAnalyticsEvent({
            googleEventName: "comment_copy_success",
            params: analyticsParams,
          });
          window.setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
          trackParticipantAnalyticsEvent({
            googleEventName: "comment_copy_failed",
            params: analyticsParams,
          });
        }
      }}
      type="button"
    >
      {copied ? "Copied" : "Copy comment text"}
    </Button>
  );
}

type TaskSubmissionResponseValue = string | boolean | string[];
type TaskFormStep = {
  groupId?: string;
  groupTitle?: string;
  question: FormQuestion;
};
const taskFormPayloadFieldName = "form-payload";

function normalizeResponseValues(
  value: TaskSubmissionResponseValue | undefined,
): string[] {
  if (typeof value === "string") {
    return value ? [value] : [];
  }

  if (typeof value === "boolean") {
    return value ? ["true"] : ["false"];
  }

  return value ?? [];
}

function isQuestionVisible(
  question: FormQuestion,
  responses: Record<string, TaskSubmissionResponseValue>,
) {
  const showWhen = question.showWhen;

  if (!showWhen) {
    return true;
  }

  const actualValues = normalizeResponseValues(responses[showWhen.questionId]);

  if (actualValues.length === 0) {
    return false;
  }

  return showWhen.answers.some((answer) => actualValues.includes(answer));
}

function getInitialQuestionResponse(
  question: FormQuestion,
  session: {
    email?: string | null;
    name?: string | null;
  },
) {
  if (question.fieldKey === "NAME") {
    return session.name ?? "";
  }

  if (question.fieldKey === "EMAIL") {
    return session.email ?? "";
  }

  if (question.type === "MULTI_SELECT") {
    return [];
  }

  if (question.type === "BOOLEAN") {
    return "";
  }

  return "";
}

type TaskActionFetcherData = {
  animationId?: string;
  intent?: string;
  ok?: boolean;
  pointsAwarded?: number;
  slotId?: string;
  taskId?: string;
};

function TaskRewardAnimation({
  activeReward,
  slotId,
}: {
  activeReward: { key: string; points: number; slotId: string } | null;
  slotId: string;
}) {
  if (!activeReward || activeReward.slotId !== slotId) {
    return null;
  }

  return (
    <div className="task-reward-animation">
      <CheckmarkBurst
        columns={12}
        durationScale={1.35}
        key={activeReward.key}
        pieceCount={72}
        pieceScale={1.7}
        showMark={false}
        spread={5}
        variant="button"
      />
      <span className="task-points-bubble" key={`${activeReward.key}:points`}>
        + {activeReward.points}
      </span>
    </div>
  );
}

function LinkedInstantRewardCard({
  reward,
}: {
  reward: NonNullable<ReturnType<typeof getTaskInstantRewardState>>;
}) {
  return (
    <div className="rounded-[1.5rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
        Linked instant reward
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{reward.label}</p>
          {reward.description ? (
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {reward.description}
            </p>
          ) : null}
        </div>
        <StatusBadge
          label={
            reward.verified ? "Unlocked" : reward.eligible ? "Pending" : "Locked"
          }
          tone={
            reward.verified
              ? "verified"
              : reward.eligible
                ? "warning"
                : "neutral"
          }
        />
      </div>
    </div>
  );
}

function createInitialQuestionResponses(
  questions: FormQuestion[],
  session: {
    email?: string | null;
    name?: string | null;
  },
) {
  return Object.fromEntries(
    questions.map((question) => [
      question.id,
      getInitialQuestionResponse(question, session),
    ]),
  ) as Record<string, TaskSubmissionResponseValue>;
}

function isQuestionAnswered(args: {
  otherValue?: string;
  question: FormQuestion;
  responseValue: TaskSubmissionResponseValue | undefined;
}) {
  const { otherValue = "", question, responseValue } = args;

  if (!question.required) {
    return true;
  }

  if (question.type === "BOOLEAN") {
    return typeof responseValue === "boolean";
  }

  if (question.type === "MULTI_SELECT") {
    return Array.isArray(responseValue) && responseValue.length > 0;
  }

  if (typeof responseValue !== "string" || responseValue.trim().length === 0) {
    return false;
  }

  if (question.allowOther && responseValue === "Other") {
    return otherValue.trim().length > 0;
  }

  return true;
}

function getChoiceBlockClass(isSelected: boolean) {
  return [
    "min-h-28 rounded-[1.5rem] border px-4 py-4 text-left text-base font-semibold transition-colors duration-150",
    "flex items-end justify-start",
    isSelected
      ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
      : "border-[var(--color-border)] bg-white/80 text-[var(--color-text)]",
  ].join(" ");
}

function buildTaskFormPayload(formData: FormData) {
  const payloadJson = formData.get(taskFormPayloadFieldName)?.toString();

  if (payloadJson) {
    try {
      const parsedPayload = JSON.parse(payloadJson) as ReturnType<
        typeof buildTaskFormPayloadFromState
      >;

      return parsedPayload;
    } catch {
      // Fall back to reading individual form controls below.
    }
  }

  const responses: Record<string, TaskSubmissionResponseValue> = {};
  const otherResponses: Record<string, string> = {};
  const groupSelections: Record<string, boolean> = {};
  const keys = new Set(Array.from(formData.keys()));

  for (const key of keys) {
    if (key.startsWith("group-toggle:")) {
      const groupId = key.slice("group-toggle:".length);
      const value = formData.get(key)?.toString().trim();

      if (value === "true" || value === "false") {
        groupSelections[groupId] = value === "true";
      }
    }

    if (key.startsWith("response-multi:")) {
      const questionId = key.slice("response-multi:".length);
      const values = formData
        .getAll(key)
        .map((entry) => entry.toString().trim())
        .filter(Boolean);

      if (values.length > 0) {
        responses[questionId] = values;
      }
    }

    if (key.startsWith("response-bool:")) {
      const questionId = key.slice("response-bool:".length);
      const values = formData
        .getAll(key)
        .map((entry) => entry.toString().trim())
        .filter(Boolean);

      if (values.length > 0) {
        responses[questionId] = values.at(-1) === "true";
      }
    }

    if (key.startsWith("response-other:")) {
      const questionId = key.slice("response-other:".length);
      const value = formData.get(key)?.toString().trim();

      if (value) {
        otherResponses[questionId] = value;
      }
    }

    if (key.startsWith("response:")) {
      const questionId = key.slice("response:".length);
      const value = formData.get(key)?.toString().trim();

      if (value) {
        responses[questionId] = value;
      }
    }
  }

  return {
    groupSelections:
      Object.keys(groupSelections).length > 0 ? groupSelections : undefined,
    responses: Object.keys(responses).length > 0 ? responses : undefined,
    otherResponses:
      Object.keys(otherResponses).length > 0 ? otherResponses : undefined,
  };
}

function buildTaskFormPayloadFromState(args: {
  draftOtherResponses: Record<string, string>;
  draftResponses: Record<string, TaskSubmissionResponseValue>;
  groupSelections: Record<string, boolean>;
  visibleFormSteps: TaskFormStep[];
}) {
  const responses: Record<string, TaskSubmissionResponseValue> = {};
  const otherResponses: Record<string, string> = {};

  for (const step of args.visibleFormSteps) {
    const responseValue = args.draftResponses[step.question.id];
    const otherValue = args.draftOtherResponses[step.question.id]?.trim();

    if (typeof responseValue === "string" && responseValue.trim().length > 0) {
      responses[step.question.id] = responseValue.trim();
    }

    if (typeof responseValue === "boolean") {
      responses[step.question.id] = responseValue;
    }

    if (Array.isArray(responseValue) && responseValue.length > 0) {
      responses[step.question.id] = responseValue;
    }

    if (otherValue) {
      otherResponses[step.question.id] = otherValue;
    }
  }

  return {
    groupSelections:
      Object.keys(args.groupSelections).length > 0
        ? args.groupSelections
        : undefined,
    responses: Object.keys(responses).length > 0 ? responses : undefined,
    otherResponses:
      Object.keys(otherResponses).length > 0 ? otherResponses : undefined,
  };
}

function getQuestionInputName(question: FormQuestion) {
  switch (question.type) {
    case "MULTI_SELECT":
      return `response-multi:${question.id}`;
    case "BOOLEAN":
      return `response-bool:${question.id}`;
    default:
      return `response:${question.id}`;
  }
}

function getQuestionOtherInputName(question: FormQuestion) {
  return `response-other:${question.id}`;
}

function renderHiddenQuestionInputs(args: {
  otherValue?: string;
  question: FormQuestion;
  responseValue: TaskSubmissionResponseValue | undefined;
}) {
  const { otherValue = "", question, responseValue } = args;
  const inputName = getQuestionInputName(question);
  const otherInputName = getQuestionOtherInputName(question);

  if (question.type === "MULTI_SELECT") {
    if (!Array.isArray(responseValue) || responseValue.length === 0) {
      return otherValue ? (
        <input key={`${question.id}-other`} name={otherInputName} type="hidden" value={otherValue} />
      ) : null;
    }

    return (
      <>
        {responseValue.map((value) => (
          <input key={`${question.id}-${value}`} name={inputName} type="hidden" value={value} />
        ))}
        {otherValue ? (
          <input name={otherInputName} type="hidden" value={otherValue} />
        ) : null}
      </>
    );
  }

  if (question.type === "BOOLEAN") {
    if (typeof responseValue !== "boolean") {
      return null;
    }

    return (
      <input
        key={`${question.id}-bool`}
        name={inputName}
        type="hidden"
        value={responseValue ? "true" : "false"}
      />
    );
  }

  if (typeof responseValue === "string" && responseValue) {
    return (
      <>
        <input key={`${question.id}-value`} name={inputName} type="hidden" value={responseValue} />
        {otherValue ? (
          <input key={`${question.id}-other`} name={otherInputName} type="hidden" value={otherValue} />
        ) : null}
      </>
    );
  }

  return otherValue ? (
    <input key={`${question.id}-other`} name={otherInputName} type="hidden" value={otherValue} />
  ) : null;
}

function getQuestionDefaultValue(
  question: FormQuestion,
  session: {
    email?: string | null;
    name?: string | null;
  },
) {
  if (question.fieldKey === "NAME") {
    return session.name ?? "";
  }

  if (question.fieldKey === "EMAIL") {
    return session.email ?? "";
  }

  return "";
}

function TaskFormQuestionField({
  onOtherChange,
  onResponseChange,
  otherValue,
  question,
  responseValue,
  session,
}: {
  onOtherChange: (value: string) => void;
  onResponseChange: (value: TaskSubmissionResponseValue) => void;
  otherValue: string;
  question: FormQuestion;
  responseValue: TaskSubmissionResponseValue;
  session: {
    email?: string | null;
    name?: string | null;
  };
}) {
  const inputName = getQuestionInputName(question);
  const otherInputName = getQuestionOtherInputName(question);
  const defaultValue =
    typeof responseValue === "string"
      ? responseValue
      : getQuestionDefaultValue(question, session);

  if (question.type === "BOOLEAN") {
    return (
      <div>
        <span className="mb-4 block font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
          {question.label}
        </span>
        <input
          name={inputName}
          type="hidden"
          value={
            typeof responseValue === "boolean"
              ? responseValue
                ? "true"
                : "false"
              : ""
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <button
            className={getChoiceBlockClass(responseValue === true)}
            onClick={() => onResponseChange(true)}
            type="button"
          >
            Yes
          </button>
          <button
            className={getChoiceBlockClass(responseValue === false)}
            onClick={() => onResponseChange(false)}
            type="button"
          >
            No
          </button>
        </div>
        {question.helperText ? (
          <p className="text-sm leading-6 text-slate-600">{question.helperText}</p>
        ) : null}
      </div>
    );
  }

  if (question.type === "TEXTAREA") {
    return (
      <label className="block">
        <span className="mb-4 block font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
          {question.label}
        </span>
        <textarea
          className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
          name={inputName}
          onChange={(event) => onResponseChange(event.target.value)}
          required={question.required}
          rows={4}
          value={defaultValue}
        />
        {question.helperText ? (
          <span className="text-sm leading-6 text-slate-600">{question.helperText}</span>
        ) : null}
      </label>
    );
  }

  if (question.type === "SINGLE_SELECT") {
    return (
      <div>
        <span className="mb-4 block font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
          {question.label}
        </span>
        <input
          name={inputName}
          type="hidden"
          value={typeof responseValue === "string" ? responseValue : ""}
        />
        <div className="grid grid-cols-2 gap-3">
          {question.options?.map((option) => (
            <button
              className={getChoiceBlockClass(responseValue === option)}
              key={option}
              onClick={() => onResponseChange(option)}
              type="button"
            >
              {option}
            </button>
          ))}
          {question.allowOther ? (
            <button
              className={getChoiceBlockClass(responseValue === "Other")}
              onClick={() => onResponseChange("Other")}
              type="button"
            >
              Other
            </button>
          ) : null}
        </div>
        {question.allowOther ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
              Other
            </span>
            <input
              className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
              name={otherInputName}
              onChange={(event) => onOtherChange(event.target.value)}
              placeholder="Type your answer"
              type="text"
              value={otherValue}
            />
          </label>
        ) : null}
        {question.helperText ? (
          <p className="text-sm leading-6 text-slate-600">{question.helperText}</p>
        ) : null}
      </div>
    );
  }

  if (question.type === "MULTI_SELECT") {
    const selectedValues = Array.isArray(responseValue) ? responseValue : [];

    return (
      <div>
        <span className="mb-4 block font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
          {question.label}
        </span>
        <div className="grid grid-cols-2 gap-3">
          {question.options?.map((option) => (
            <label key={option}>
              <input
                checked={selectedValues.includes(option)}
                className="sr-only"
                name={inputName}
                onChange={(event) => {
                  if (event.target.checked) {
                    onResponseChange([...selectedValues, option]);
                  } else {
                    onResponseChange(
                      selectedValues.filter((value) => value !== option),
                    );
                  }
                }}
                type="checkbox"
                value={option}
              />
              <span className={getChoiceBlockClass(selectedValues.includes(option))}>
                {option}
              </span>
            </label>
          ))}
          {question.allowOther ? (
            <label>
              <input
                checked={selectedValues.includes("Other")}
                className="sr-only"
                name={inputName}
                onChange={(event) => {
                  if (event.target.checked) {
                    onResponseChange([...selectedValues, "Other"]);
                  } else {
                    onResponseChange(
                      selectedValues.filter((value) => value !== "Other"),
                    );
                  }
                }}
                type="checkbox"
                value="Other"
              />
              <span className={getChoiceBlockClass(selectedValues.includes("Other"))}>
                Other
              </span>
            </label>
          ) : null}
        </div>
        {question.allowOther ? (
          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
              Other
            </span>
            <input
              className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
              name={otherInputName}
              onChange={(event) => onOtherChange(event.target.value)}
              placeholder="Type your answer"
              type="text"
              value={otherValue}
            />
          </label>
        ) : null}
        {question.helperText ? (
          <p className="text-sm leading-6 text-slate-600">{question.helperText}</p>
        ) : null}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-4 block font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
        {question.label}
      </span>
      <input
        className="w-full rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 text-sm outline-none ring-[var(--color-primary)] focus:ring-2"
        onChange={(event) => onResponseChange(event.target.value)}
        name={inputName}
        placeholder={question.label}
        required={question.required}
        type={
          question.type === "EMAIL"
            ? "email"
            : question.type === "PHONE"
              ? "tel"
              : "text"
        }
        value={defaultValue}
      />
      {question.helperText ? (
        <span className="text-sm leading-6 text-slate-600">{question.helperText}</span>
      ) : null}
    </label>
  );
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");
  const isFetcherRequest = formData.get("mode") === "fetcher";
  const shouldAnimate = formData.get("animate") === "true";
  const pointsAwarded = Number(formData.get("pointsAwarded")?.toString() ?? 0);
  const slotId =
    formData.get("slotId")?.toString().trim() || params.taskId;

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

    if (isFetcherRequest) {
      return {
        animationId: shouldAnimate ? `${slotId}:${Date.now()}` : undefined,
        intent: "claim",
        ok: true,
        pointsAwarded: shouldAnimate ? pointsAwarded : undefined,
        slotId,
        taskId: params.taskId,
      };
    }

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  if (intent === "reset") {
    const response = await postApi(
      `/task-attempts/${params.taskId}/reset`,
      {
        eventSlug: params.eventSlug,
      },
      request,
    );

    await parseParticipantSessionResponse(response);

    if (isFetcherRequest) {
      return { intent: "reset", ok: true, taskId: params.taskId };
    }

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  if (intent === "form-submit") {
    const payload = buildTaskFormPayload(formData);
    const response = await postApi(
      `/task-attempts/${params.taskId}/form-submit`,
      {
        eventSlug: params.eventSlug,
        ...payload,
      },
      request,
    );

    await parseParticipantSessionResponse(response);

    return redirect(`/${params.eventSlug}`);
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

    if (isFetcherRequest) {
      return {
        animationId: shouldAnimate ? `${slotId}:${Date.now()}` : undefined,
        intent: "await-auto-verification",
        ok: true,
        pointsAwarded: shouldAnimate ? pointsAwarded : undefined,
        slotId,
        taskId: params.taskId,
      };
    }

    return redirect(`/${params.eventSlug}/tasks/${params.taskId}`);
  }

  return null;
}

export default function EventTask({ loaderData, params }: Route.ComponentProps) {
  const session = loaderData.session;
  const taskActionFetcher = useFetcher();
  const taskActionFetcherData = taskActionFetcher.data as
    | TaskActionFetcherData
    | undefined;
  const lastRewardAnimationId = useRef<string | null>(null);
  const [activeReward, setActiveReward] = useState<{
    key: string;
    points: number;
    slotId: string;
  } | null>(null);

  if (!session) {
    throw new Response("Participant session could not be created.", {
      status: 500,
    });
  }

  const taskItems = mapTaskAttempts(loaderData);
  const taskItem = taskItems.find(
    ({ task }) => task.id === params.taskId,
  );

  if (!taskItem) {
    throw new Response("Task not found.", { status: 404 });
  }

  const socialFollowGroupKey = getSocialFollowGroupKey(taskItem.task);
  const socialFollowItems =
    taskItem.task.type === "SOCIAL_FOLLOW" && socialFollowGroupKey
      ? taskItems.filter(
          (item) => getSocialFollowGroupKey(item.task) === socialFollowGroupKey,
        )
      : [];
  const taskInstantReward = getTaskInstantRewardState(
    loaderData,
    taskItem.task.id,
  );
  const currentTaskStatus = taskItem.attempt?.status ?? "NOT_STARTED";
  const currentTaskAlreadyClaimed = taskStatusCountsAsClaimed(
    currentTaskStatus,
  );
  const isAwaitingAutoVerification =
    currentTaskStatus === "PENDING_AUTO_VERIFICATION";
  const isAutoVerified = currentTaskStatus === "VERIFIED";
  const completedTaskActionLabel = getCompletedTaskActionLabel({
    requiresVerification: taskItem.task.requiresVerification,
    status: currentTaskStatus,
    taskType: taskItem.task.type,
  });
  const socialFollowRequiresVerification = socialFollowItems.some(
    (followItem) => followItem.task.requiresVerification,
  );
  const claimedSocialFollowCount = socialFollowItems.filter((followItem) =>
    ["COMPLETED_BY_USER", "PENDING_STAFF_CHECK", "VERIFIED"].includes(
      followItem.attempt?.status ?? "NOT_STARTED",
    ),
  ).length;
  const verifiedSocialFollowCount = socialFollowItems.filter(
    (followItem) => followItem.attempt?.status === "VERIFIED",
  ).length;
  const isSocialFollowGroup = socialFollowItems.length > 1;
  const taskLabel = isSocialFollowGroup
    ? "Follow us on socials"
    : taskItem.task.title || humanizeTaskId(params.taskId);
  const actionLinks = isSocialFollowGroup
    ? []
    : getTaskActionLinks(taskItem.task);
  const instructions = getTaskInstructions(taskItem.task);
  const proofHint = getTaskProofHint(taskItem.task);
  const socialCommentConfig = getSocialCommentTaskConfig(taskItem.task);
  const requiredCommentText = buildSocialCommentText({
    task: taskItem.task,
    verificationCode: session.verificationCode,
  });
  const isAutoVerifiableSocialCommentTask =
    Boolean(socialCommentConfig?.autoVerify) && Boolean(requiredCommentText);
  const socialPlatformLabel =
    taskItem.task.platform === "INSTAGRAM" ? "Instagram" : "Facebook";
  const handlesInlineForm = [
    "LEAD_FORM",
    "QUIZ",
    "NEWSLETTER_OPT_IN",
    "WHATSAPP_OPT_IN",
  ].includes(
    taskItem.task.type,
  );
  const showRewardBelowContent = handlesInlineForm && Boolean(taskInstantReward);
  const isStampScan = taskItem.task.type === "STAMP_SCAN";
  const formQuestions = getTaskFormQuestions(taskItem.task);
  const formGroups = getTaskFormGroups(taskItem.task);
  const hasInterestExplorer = formGroups.length > 0;
  const groupIntroLabel = getTaskFormGroupIntroLabel(taskItem.task);
  const [groupSelections, setGroupSelections] = useState<Record<string, boolean>>(
    () =>
      Object.fromEntries(formGroups.map((group) => [group.id, false])) as Record<
        string,
        boolean
      >,
  );
  const [interestStep, setInterestStep] = useState<"explore" | "details">(
    hasInterestExplorer ? "explore" : "details",
  );
  const [currentFormStepIndex, setCurrentFormStepIndex] = useState(0);
  const [draftResponses, setDraftResponses] = useState(() =>
    createInitialQuestionResponses(
      [...formQuestions, ...formGroups.flatMap((group) => group.questions)],
      session,
    ),
  );
  const [draftOtherResponses, setDraftOtherResponses] = useState<
    Record<string, string>
  >({});
  const visibleFormQuestions = formQuestions.filter((question) =>
    isQuestionVisible(question, draftResponses),
  );
  const visibleFormGroups = formGroups.filter(
    (group) => groupSelections[group.id] === true,
  );
  const visibleFormSteps: TaskFormStep[] = [
    ...visibleFormGroups.flatMap((group) =>
      group.questions.map((question) => ({
        groupId: group.id,
        groupTitle: group.title,
        question,
      })),
    ),
    ...visibleFormQuestions.map((question) => ({ question })),
  ];
  const currentFormStep = visibleFormSteps.at(currentFormStepIndex) ?? null;
  const isLastFormStep =
    visibleFormSteps.length === 0 ||
    currentFormStepIndex === visibleFormSteps.length - 1;
  const submittedInlineForm = handlesInlineForm
    ? ["COMPLETED_BY_USER", "PENDING_STAFF_CHECK", "VERIFIED"].includes(
        taskItem.attempt?.status ?? "NOT_STARTED",
      )
    : false;
  const canAdvanceCurrentStep = currentFormStep
    ? isQuestionAnswered({
        otherValue: draftOtherResponses[currentFormStep.question.id] ?? "",
        question: currentFormStep.question,
        responseValue: draftResponses[currentFormStep.question.id],
      })
    : true;
  const draftFormPayload = buildTaskFormPayloadFromState({
    draftOtherResponses,
    draftResponses,
    groupSelections,
    visibleFormSteps,
  });
  const themeStyle = getBrandingStyle(loaderData);
  const taskAnalyticsParams = getTaskAnalyticsParams(taskItem.task);
  const taskAnalyticsAttributes = Object.fromEntries(
    Object.entries(taskAnalyticsParams).map(([key, value]) => [
      `data-analytics-${key.replace(/_/g, "-")}`,
      String(value),
    ]),
  );
  const actionLinkSummary = summarizeAnalyticsCounts(
    actionLinks.map((link) => link.label),
  );
  const taskRouteAnalytics = {
    ...taskAnalyticsParams,
    action_link_count: actionLinks.length,
    action_link_summary: actionLinkSummary || null,
    has_inline_form: handlesInlineForm,
    instructions_count: instructions.length,
    is_auto_verifiable_social_comment_task: isAutoVerifiableSocialCommentTask,
    task_status: taskItem.attempt?.status ?? "NOT_STARTED",
  };

  useEffect(() => {
    setCurrentFormStepIndex((currentIndex) =>
      Math.min(currentIndex, Math.max(visibleFormSteps.length - 1, 0)),
    );
  }, [visibleFormSteps.length]);

  useEffect(() => {
    if (
      taskActionFetcher.state !== "idle" ||
      !taskActionFetcherData?.ok ||
      !taskActionFetcherData.animationId ||
      !taskActionFetcherData.slotId
    ) {
      return;
    }

    if (lastRewardAnimationId.current === taskActionFetcherData.animationId) {
      return;
    }

    lastRewardAnimationId.current = taskActionFetcherData.animationId;
    setActiveReward({
      key: taskActionFetcherData.animationId,
      points: taskActionFetcherData.pointsAwarded ?? 0,
      slotId: taskActionFetcherData.slotId,
    });
  }, [taskActionFetcher.state, taskActionFetcherData]);

  useEffect(() => {
    if (!activeReward) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveReward(null);
    }, 2100);

    return () => window.clearTimeout(timeout);
  }, [activeReward]);

  return (
    <ScreenShell
      eyebrow="Activity"
      headerSize={handlesInlineForm ? "compact" : "default"}
      title={taskLabel}
      description={
        isAutoVerifiableSocialCommentTask
          ? `Open the ${socialPlatformLabel} post, leave the exact comment text shown below, then let the app wait for automatic verification.`
          : taskItem.task.requiresVerification
            ? "Complete this activity on this screen, submit your claim, and return to the summary when you are ready for staff verification."
            : "Complete this activity on this screen and confirm it here to update your score immediately."
      }
      fixedHeader={
        <Link
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-5 py-2 text-sm font-semibold text-[var(--color-text)] shadow-[0_10px_24px_-18px_rgba(15,109,83,0.45)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          data-analytics-cta-name="back_to_task_list"
          data-analytics-event="task_navigation_click"
          data-analytics-location="fixed_header"
          {...taskAnalyticsAttributes}
          to={`/${params.eventSlug}/tasks`}
        >
          Back to activities
        </Link>
      }
      marketing={{
        analytics: taskRouteAnalytics,
        eventName: loaderData.event.name,
        eventSlug: loaderData.event.slug,
        page: "task-detail",
        sessionKey: session.verificationCode,
        settings: loaderData.event.settingsJson,
        task: taskItem.task,
        taskStatus: taskItem.attempt?.status ?? "NOT_STARTED",
        verifiedTaskIds:
          taskItem.attempt?.status === "VERIFIED" ? [taskItem.task.id] : [],
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
        <div className="card-surface rounded-[2rem] p-5">
          {handlesInlineForm ? (
            <div className="flex justify-end">
              <StatusBadge {...taskItem.status} />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-3xl font-semibold text-slate-950">
                  {taskLabel}
                </h2>
                <StatusBadge {...taskItem.status} />
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                {taskItem.task.description}
              </p>
            </>
          )}
          {taskInstantReward && !showRewardBelowContent ? (
            <div className="mt-5">
              <LinkedInstantRewardCard reward={taskInstantReward} />
            </div>
          ) : null}
          {isSocialFollowGroup ? (
            <div className="mt-6 space-y-3">
              {socialFollowItems.map((followItem) => {
                const link = getTaskActionLinks(followItem.task)[0];
                const platformLabel = followItem.task.platform
                  .toLowerCase()
                  .split("_")
                  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                  .join(" ");
                const followStatus = followItem.attempt?.status ?? "NOT_STARTED";
                const hasClaimedFollow = [
                  "COMPLETED_BY_USER",
                  "PENDING_STAFF_CHECK",
                  "VERIFIED",
                ].includes(followStatus);

                return (
                  <div
                    className="rounded-[1.75rem] border border-[var(--color-border)] bg-white/80 p-4"
                    key={followItem.task.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-2xl font-semibold text-slate-950">
                          {platformLabel}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {followItem.task.points} point
                          {followItem.task.points === 1 ? "" : "s"} for this follow.
                        </p>
                      </div>
                      <StatusBadge {...followItem.status} />
                    </div>
                    <div className="mt-4 flex flex-col gap-3">
                      {link ? (
                        <a
                          className="action-link w-full border border-[var(--color-primary)] bg-transparent text-[var(--color-primary)] shadow-none"
                          data-analytics-cta-label={link.label}
                          data-analytics-event="task_external_link_click"
                          data-analytics-link-tone={link.tone}
                          data-analytics-link-type="primary_url"
                          href={link.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {link.label}
                        </a>
                      ) : null}
                      <taskActionFetcher.Form
                        action={`/${params.eventSlug}/tasks/${followItem.task.id}`}
                        method="post"
                      >
                        <input
                          name="intent"
                          type="hidden"
                          value={hasClaimedFollow ? "reset" : "claim"}
                        />
                        <input name="animate" type="hidden" value="true" />
                        <input name="mode" type="hidden" value="fetcher" />
                        <input
                          name="pointsAwarded"
                          type="hidden"
                          value={followItem.task.points}
                        />
                        <input
                          name="slotId"
                          type="hidden"
                          value={`follow:${followItem.task.id}`}
                        />
                        <input
                          name="status"
                          type="hidden"
                          value={
                            followItem.task.requiresVerification
                              ? "PENDING_STAFF_CHECK"
                              : "COMPLETED_BY_USER"
                          }
                        />
                        <div className="relative">
                          <TaskRewardAnimation
                            activeReward={activeReward}
                            slotId={`follow:${followItem.task.id}`}
                          />
                          <Button
                            className={[
                              "w-full",
                              hasClaimedFollow
                                ? ""
                                : "!border-amber-300 !bg-amber-200 !text-amber-950",
                            ].join(" ")}
                            data-analytics-claim-path={
                              hasClaimedFollow
                                ? "reset_to_open"
                                : followItem.task.requiresVerification
                                  ? "pending_staff_check"
                                  : "completed_by_user"
                            }
                            data-analytics-event="task_claim_click"
                            data-analytics-location="task_detail_social_follow_group"
                            style={
                              hasClaimedFollow
                                ? undefined
                                : {
                                    boxShadow:
                                      "0 0 42px -16px rgba(180, 83, 9, 0.55), 0 16px 42px -26px rgba(180, 83, 9, 0.45)",
                                  }
                            }
                            type="submit"
                          >
                            {hasClaimedFollow
                              ? "Done"
                              : `I followed on ${platformLabel}`}
                          </Button>
                        </div>
                      </taskActionFetcher.Form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : actionLinks.length > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              {actionLinks.map((link) => (
                <a
                  key={link.href}
                  className={
                    link.tone === "primary"
                      ? "action-link action-link-primary"
                      : "action-link action-link-secondary"
                  }
                  data-analytics-cta-label={link.label}
                  data-analytics-event="task_external_link_click"
                  data-analytics-link-tone={link.tone}
                  data-analytics-link-type={
                    link.tone === "primary" ? "primary_url" : "secondary_url"
                  }
                  {...taskAnalyticsAttributes}
                  href={link.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
          {submittedInlineForm ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-5">
                <p className="font-display text-3xl font-semibold leading-tight tracking-tight text-slate-950">
                  Activity submitted
                </p>
                <p className="mt-4 text-base leading-7 text-slate-700">
                  {taskItem.task.requiresVerification
                    ? "Your answers are saved. Staff can check the result from the summary screen."
                    : "Your answers are saved and your score has been updated."}
                </p>
                {taskInstantReward ? (
                  <p className="mt-4 text-sm leading-6 text-slate-700">
                    {taskInstantReward.verified
                      ? `${taskInstantReward.label} is now unlocked.`
                      : taskInstantReward.eligible
                        ? `${taskInstantReward.label} is recorded and will be ready once linked task verification is complete.`
                        : taskItem.task.requiresVerification
                          ? `${taskInstantReward.label} will unlock once staff review is complete.`
                          : `Complete the remaining linked task requirements to unlock ${taskInstantReward.label}.`}
                  </p>
                ) : null}
              </div>
            </div>
          ) : handlesInlineForm && hasInterestExplorer && interestStep === "explore" ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                Select anything that could be interesting. You can choose
                multiple interests, or continue without selecting any.
              </div>
              <div className="space-y-3">
                {formGroups.map((group) => {
                  const isSelected = groupSelections[group.id] === true;

                  return (
                    <div
                      className="rounded-[1.75rem] border border-[var(--color-border)] bg-white/80 p-4"
                      key={group.id}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                        Interest explorer
                      </p>
                      <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                        {group.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-slate-700">
                        {groupIntroLabel}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button
                          onClick={() =>
                            setGroupSelections((currentSelections) => ({
                              ...currentSelections,
                              [group.id]: true,
                            }))
                          }
                          tone={isSelected ? "primary" : "secondary"}
                          type="button"
                        >
                          Yes
                        </Button>
                        <Button
                          onClick={() =>
                            setGroupSelections((currentSelections) => ({
                              ...currentSelections,
                              [group.id]: false,
                            }))
                          }
                          tone={!isSelected ? "primary" : "secondary"}
                          type="button"
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                data-analytics-event="task_interest_explorer_continue_click"
                data-analytics-form-type={taskItem.task.type}
                data-analytics-location="task_detail"
                {...taskAnalyticsAttributes}
                onClick={() => setInterestStep("details")}
                type="button"
              >
                Continue
              </Button>
            </div>
          ) : handlesInlineForm ? (
            <Form className="mt-6 space-y-4 pb-36" method="post">
              <input name="intent" type="hidden" value="form-submit" />
              <input
                name={taskFormPayloadFieldName}
                type="hidden"
                value={JSON.stringify(draftFormPayload)}
              />
              {hasInterestExplorer
                ? Object.entries(groupSelections).map(([groupId, selected]) => (
                    <input
                      key={groupId}
                      name={`group-toggle:${groupId}`}
                      type="hidden"
                      value={selected ? "true" : "false"}
                    />
                  ))
                : null}
              {visibleFormSteps.map((step, index) =>
                index === currentFormStepIndex
                  ? null
                  : (
                      <div className="hidden" key={`persisted-${step.question.id}`}>
                        {renderHiddenQuestionInputs({
                          otherValue: draftOtherResponses[step.question.id] ?? "",
                          question: step.question,
                          responseValue: draftResponses[step.question.id],
                        })}
                      </div>
                    ),
              )}
              {currentFormStep ? (
                <div className="space-y-4 rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {currentFormStep.groupTitle ? (
                        <p className="font-display text-3xl font-semibold leading-tight tracking-tight text-[var(--color-primary)]">
                          {currentFormStep.groupTitle}
                        </p>
                      ) : null}
                    </div>
                    {currentFormStep.groupTitle ? (
                      <Button
                        onClick={() =>
                          setCurrentFormStepIndex((currentIndex) =>
                            Math.min(currentIndex + 1, visibleFormSteps.length - 1),
                          )
                        }
                        tone="secondary"
                        type="button"
                      >
                        Skip
                      </Button>
                    ) : null}
                  </div>
                  <TaskFormQuestionField
                    key={currentFormStep.question.id}
                    onOtherChange={(value) =>
                      setDraftOtherResponses((currentResponses) => ({
                        ...currentResponses,
                        [currentFormStep.question.id]: value,
                      }))
                    }
                    onResponseChange={(value) =>
                      setDraftResponses((currentResponses) => ({
                        ...currentResponses,
                        [currentFormStep.question.id]: value,
                      }))
                    }
                    otherValue={draftOtherResponses[currentFormStep.question.id] ?? ""}
                    question={currentFormStep.question}
                    responseValue={draftResponses[currentFormStep.question.id] ?? ""}
                    session={session}
                  />
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4 text-sm leading-6 text-slate-700">
                  No additional questions are configured for this activity.
                </div>
              )}
              {isLastFormStep ? (
                <div className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                  {isAutoVerifiableSocialCommentTask
                    ? `After you submit, the app will wait for ${socialPlatformLabel} comment verification.`
                    : taskItem.task.requiresVerification
                      ? proofHint
                        ? `At the end, staff may ask to check this on your phone. ${proofHint}`
                        : "At the end, staff may ask to check this on your phone."
                      : taskInstantReward
                        ? `Your score updates as soon as you submit, and ${taskInstantReward.label} unlocks immediately.`
                        : "Your score updates as soon as you submit."}
                </div>
              ) : null}

              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-surface-strong)_94%,white)] px-5 pb-[max(env(safe-area-inset-bottom),1rem)] pt-4 shadow-[0_-16px_40px_-28px_rgba(15,109,83,0.35)] backdrop-blur">
                <div className="mx-auto flex max-w-md gap-3">
                  <Button
                    disabled={!hasInterestExplorer && currentFormStepIndex === 0}
                    onClick={() => {
                      if (currentFormStepIndex > 0) {
                        setCurrentFormStepIndex((currentIndex) => currentIndex - 1);
                        return;
                      }

                      if (hasInterestExplorer) {
                        setInterestStep("explore");
                      }
                    }}
                    tone="secondary"
                    type="button"
                  >
                    Previous
                  </Button>
                  {isLastFormStep ? (
                    <Button
                      data-analytics-event="task_form_submit_click"
                      data-analytics-form-type={taskItem.task.type}
                      data-analytics-location="task_detail"
                      disabled={!canAdvanceCurrentStep}
                      {...taskAnalyticsAttributes}
                      className="flex-1"
                      type="submit"
                    >
                      Submit activity
                    </Button>
                  ) : (
                    <Button
                      className="flex-1"
                      data-analytics-event="task_form_next_click"
                      data-analytics-form-type={taskItem.task.type}
                      data-analytics-location="task_detail"
                      disabled={!canAdvanceCurrentStep}
                      {...taskAnalyticsAttributes}
                      onClick={() =>
                        setCurrentFormStepIndex((currentIndex) => currentIndex + 1)
                      }
                      type="button"
                    >
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </Form>
          ) : isSocialFollowGroup ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                {socialFollowRequiresVerification
                  ? "Open each social profile above and claim the follows one by one. Each selected platform adds its own points, and staff may still ask to check the follow state on your phone."
                  : "Open each social profile above and claim the follows one by one. Each selected platform adds its own points as soon as you confirm it here."}
              </div>
              <div className="rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4 text-sm leading-6 text-slate-700">
                {socialFollowRequiresVerification
                  ? verifiedSocialFollowCount === socialFollowItems.length
                    ? "All selected follows have been verified."
                    : claimedSocialFollowCount > 0
                      ? `${claimedSocialFollowCount} of ${socialFollowItems.length} follows are done. Any remaining staff checks will show on the badges above.`
                      : "Mark each follow as done here after you complete it on the social app."
                  : claimedSocialFollowCount === socialFollowItems.length
                    ? "All selected follows are already done and counted."
                    : claimedSocialFollowCount > 0
                      ? `${claimedSocialFollowCount} of ${socialFollowItems.length} follows are already done and counted.`
                      : "Mark each follow as done here after you complete it on the social app to add the points immediately."}
              </div>
            </div>
          ) : isStampScan ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                Scan this stamp QR code at the event. The activity updates
                automatically when the stamp is accepted.
              </div>
              <Link
                className="action-link action-link-primary w-full"
                data-analytics-cta-name="open_scanner"
                data-analytics-event="task_scan_cta_click"
                data-analytics-location="task_detail"
                {...taskAnalyticsAttributes}
                to={`/${params.eventSlug}/scan`}
              >
                Open scanner
              </Link>
            </div>
          ) : isAutoVerifiableSocialCommentTask && socialCommentConfig && requiredCommentText ? (
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
                  {socialCommentConfig.commentInstructions ??
                    `Use this exact text so the system can match your ${socialPlatformLabel} comment to this session automatically.`}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <CopyCommentButton
                  analyticsParams={taskAnalyticsParams}
                  value={requiredCommentText}
                />
                <taskActionFetcher.Form method="post">
                  <input name="animate" type="hidden" value={!currentTaskAlreadyClaimed ? "true" : "false"} />
                  <input name="intent" type="hidden" value="await-auto-verification" />
                  <input name="mode" type="hidden" value="fetcher" />
                  <input
                    name="pointsAwarded"
                    type="hidden"
                    value={taskItem.task.points}
                  />
                  <input
                    name="slotId"
                    type="hidden"
                    value="task:auto-verification"
                  />
                  <div className="relative">
                    <TaskRewardAnimation
                      activeReward={activeReward}
                      slotId="task:auto-verification"
                    />
                    <Button
                      className={
                        isAwaitingAutoVerification || isAutoVerified
                          ? "!bg-sky-500 !text-white !shadow-[0_16px_40px_-24px_rgba(14,165,233,0.85)]"
                          : ""
                      }
                      data-analytics-event="task_auto_verification_click"
                      data-analytics-location="task_detail"
                      disabled={isAutoVerified}
                      {...taskAnalyticsAttributes}
                      type="submit"
                    >
                      {isAutoVerified
                        ? "Comment verified"
                        : isAwaitingAutoVerification
                          ? "Comment submitted"
                          : "I've commented"}
                    </Button>
                  </div>
                </taskActionFetcher.Form>
              </div>
              <div className="mt-4 rounded-2xl bg-white/70 p-4 text-sm leading-6 text-slate-700">
                {taskItem.attempt?.status === "VERIFIED"
                  ? `Your ${socialPlatformLabel} comment has been verified automatically.`
                  : taskItem.attempt?.status === "PENDING_AUTO_VERIFICATION"
                    ? `The app is waiting for your ${socialPlatformLabel} comment to arrive. Verification can take a short time.`
                    : `Once you comment and confirm here, the activity will switch to waiting for ${socialPlatformLabel} comment verification.`}
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
                <taskActionFetcher.Form method="post">
                  <input name="animate" type="hidden" value={!currentTaskAlreadyClaimed ? "true" : "false"} />
                  <input name="intent" type="hidden" value="claim" />
                  <input name="mode" type="hidden" value="fetcher" />
                  <input
                    name="pointsAwarded"
                    type="hidden"
                    value={taskItem.task.points}
                  />
                  <input name="slotId" type="hidden" value="task:primary-claim" />
                  <input name="status" type="hidden" value="COMPLETED_BY_USER" />
                  <div className="relative">
                    <TaskRewardAnimation
                      activeReward={activeReward}
                      slotId="task:primary-claim"
                    />
                    <Button
                      className={
                        currentTaskAlreadyClaimed
                          ? "!bg-sky-500 !text-white !shadow-[0_16px_40px_-24px_rgba(14,165,233,0.85)]"
                          : ""
                      }
                      data-analytics-claim-path="completed_by_user"
                      data-analytics-event="task_claim_click"
                      data-analytics-location="task_detail"
                      disabled={currentTaskAlreadyClaimed}
                      {...taskAnalyticsAttributes}
                      type="submit"
                    >
                      {completedTaskActionLabel ??
                        getTaskPrimaryActionLabel(taskItem.task)}
                    </Button>
                  </div>
                </taskActionFetcher.Form>
                {taskItem.task.requiresVerification ? (
                  <taskActionFetcher.Form method="post">
                    <input name="animate" type="hidden" value={!currentTaskAlreadyClaimed ? "true" : "false"} />
                    <input name="intent" type="hidden" value="claim" />
                    <input name="mode" type="hidden" value="fetcher" />
                    <input
                      name="pointsAwarded"
                      type="hidden"
                      value={taskItem.task.points}
                    />
                    <input
                      name="slotId"
                      type="hidden"
                      value="task:secondary-claim"
                    />
                    <input name="status" type="hidden" value="PENDING_STAFF_CHECK" />
                    <div className="relative">
                      <TaskRewardAnimation
                        activeReward={activeReward}
                        slotId="task:secondary-claim"
                      />
                      <Button
                        data-analytics-claim-path="pending_staff_check"
                        data-analytics-event="task_claim_click"
                        data-analytics-location="task_detail"
                        {...taskAnalyticsAttributes}
                        tone="secondary"
                        type="submit"
                      >
                        {getTaskSecondaryActionLabel(taskItem.task)}
                      </Button>
                    </div>
                  </taskActionFetcher.Form>
                ) : null}
              </div>
            </>
          )}
          {taskInstantReward && showRewardBelowContent ? (
            <div className="mt-6">
              <LinkedInstantRewardCard reward={taskInstantReward} />
            </div>
          ) : null}
        </div>

      </div>
    </ScreenShell>
  );
}
