import type { TaskAttemptLike, TaskLike } from "@qianlu-events/schemas";
import { Button, StatusBadge } from "@qianlu-events/ui";
import { Link, useFetcher } from "react-router";

import {
  getSocialFollowGroupKey,
  groupSocialFollowItems,
} from "../lib/social-follow";
import {
  getTaskActionLinks,
  getTaskPrimaryActionLabel,
  getTaskSecondaryActionLabel,
} from "../lib/task-presentation";

type TaskItemStatus = {
  label: string;
  tone?: "neutral" | "claimed" | "verified" | "warning" | "rejected";
};

export type ParticipantInlineTaskItem = {
  attempt?: TaskAttemptLike;
  status: TaskItemStatus;
  task: TaskLike;
};

export type ParticipantInlineTaskGroup = {
  groupKey: string;
  items: ParticipantInlineTaskItem[];
};

type ParticipantInlineTaskPanelProps = {
  analyticsLocation: string;
  eventSlug: string;
  itemGroups?: ParticipantInlineTaskGroup[];
  items: ParticipantInlineTaskItem[];
};

function taskStatusCountsAsClaimed(status: string | undefined) {
  return [
    "COMPLETED_BY_USER",
    "PENDING_STAFF_CHECK",
    "PENDING_AUTO_VERIFICATION",
    "VERIFIED",
  ].includes(status ?? "");
}

function getCompletedTaskActionLabel(args: { status: string; taskType: string }) {
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
    return isSocialCommentTask ? "Activity completed" : "Completed";
  }

  return null;
}

function formatPlatformLabel(platform: string) {
  return platform
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDefaultTaskGroups(items: ParticipantInlineTaskItem[]) {
  const socialFollowGroups = groupSocialFollowItems(
    items.filter((item) => item.task.type === "SOCIAL_FOLLOW"),
  );
  const socialFollowItemsByGroupKey = new Map(
    socialFollowGroups.map((group) => [group.groupKey, group.items]),
  );
  const groupedItems: ParticipantInlineTaskGroup[] = [];
  const seenSocialFollowGroupKeys = new Set<string>();

  for (const item of items) {
    if (item.task.type !== "SOCIAL_FOLLOW") {
      groupedItems.push({
        groupKey: `task:${item.task.id}`,
        items: [item],
      });
      continue;
    }

    const groupKey = getSocialFollowGroupKey(item.task);

    if (!groupKey || seenSocialFollowGroupKeys.has(groupKey)) {
      continue;
    }

    seenSocialFollowGroupKeys.add(groupKey);

    const groupItems = socialFollowItemsByGroupKey.get(groupKey);

    if (!groupItems) {
      continue;
    }

    groupedItems.push({
      groupKey,
      items: groupItems,
    });
  }

  return groupedItems;
}

export function ParticipantInlineTaskPanel({
  analyticsLocation,
  eventSlug,
  itemGroups,
  items,
}: ParticipantInlineTaskPanelProps) {
  const taskActionFetcher = useFetcher();

  if (items.length === 0) {
    return null;
  }

  const taskGroups = itemGroups ?? buildDefaultTaskGroups(items);

  return (
    <div className="space-y-3">
      {taskGroups.map((group) => {
        const groupItems = group.items;
        const allSocialFollow = groupItems.every(
          (item) => item.task.type === "SOCIAL_FOLLOW",
        );

        if (allSocialFollow) {
          const representativeItem = groupItems[0];
          const totalPoints = groupItems.reduce((sum, item) => sum + item.task.points, 0);
          const completedCount = groupItems.filter((item) =>
            [
              "COMPLETED_BY_USER",
              "PENDING_STAFF_CHECK",
              "VERIFIED",
            ].includes(item.attempt?.status ?? "NOT_STARTED"),
          ).length;
          const groupStatus =
            completedCount === groupItems.length
              ? { label: "Done", tone: "claimed" as const }
              : completedCount > 0
                ? {
                    label: `${completedCount}/${groupItems.length} done`,
                    tone: "claimed" as const,
                  }
                : { label: "Open", tone: "neutral" as const };

          if (!representativeItem) {
            return null;
          }

          return (
            <div
              className="rounded-[1.75rem] border border-[var(--color-border)] bg-white/90 p-4"
              key={group.groupKey}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                    Next task
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                    {representativeItem.task.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    Follow {groupItems.length} social profile
                    {groupItems.length === 1 ? "" : "s"} for {totalPoints} point
                    {totalPoints === 1 ? "" : "s"}.
                  </p>
                </div>
                <StatusBadge {...groupStatus} />
              </div>

              <div className="mt-4 space-y-3">
                {groupItems.map((item, itemIndex) => {
                  const actionLink = getTaskActionLinks(item.task)[0];
                  const platformLabel = formatPlatformLabel(item.task.platform);
                  const followStatus = item.attempt?.status ?? "NOT_STARTED";
                  const hasClaimedFollow = [
                    "COMPLETED_BY_USER",
                    "PENDING_STAFF_CHECK",
                    "VERIFIED",
                  ].includes(followStatus);

                  return (
                    <div
                      className="rounded-[1.25rem] bg-white/70 p-3"
                      key={`${item.task.id}:${itemIndex}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                            {platformLabel}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-950">
                            {item.task.points} point
                            {item.task.points === 1 ? "" : "s"}
                          </p>
                        </div>
                        <StatusBadge {...item.status} />
                      </div>
                      <div className="mt-3 flex flex-col gap-3">
                        {actionLink ? (
                          <a
                            className="action-link w-full border border-[var(--color-primary)] bg-transparent text-[var(--color-primary)] shadow-none"
                            data-analytics-cta-label={actionLink.label}
                            data-analytics-event="task_external_link_click"
                            data-analytics-link-tone={actionLink.tone}
                            data-analytics-link-type="primary_url"
                            href={actionLink.href}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {actionLink.label}
                          </a>
                        ) : null}
                        <taskActionFetcher.Form
                          action={`/${eventSlug}/tasks/${item.task.id}`}
                          method="post"
                        >
                          <input
                            name="intent"
                            type="hidden"
                            value={hasClaimedFollow ? "reset" : "claim"}
                          />
                          <input name="mode" type="hidden" value="fetcher" />
                          <input
                            name="status"
                            type="hidden"
                            value={
                              item.task.requiresVerification
                                ? "PENDING_STAFF_CHECK"
                                : "COMPLETED_BY_USER"
                            }
                          />
                          <Button
                            className="w-full"
                            data-analytics-claim-path={
                              hasClaimedFollow
                                ? "reset_to_open"
                                : item.task.requiresVerification
                                  ? "pending_staff_check"
                                  : "completed_by_user"
                            }
                            data-analytics-event="task_claim_click"
                            data-analytics-location={analyticsLocation}
                            type="submit"
                          >
                            {hasClaimedFollow
                              ? "Done"
                              : `I followed on ${platformLabel}`}
                          </Button>
                        </taskActionFetcher.Form>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        const taskItem = groupItems[0];

        if (!taskItem) {
          return null;
        }

        const currentTaskStatus = taskItem.attempt?.status ?? "NOT_STARTED";
        const currentTaskAlreadyClaimed = taskStatusCountsAsClaimed(currentTaskStatus);
        const completedTaskActionLabel = getCompletedTaskActionLabel({
          status: currentTaskStatus,
          taskType: taskItem.task.type,
        });
        const actionLinks = getTaskActionLinks(taskItem.task);
        const handlesInlineForm = [
          "LEAD_FORM",
          "QUIZ",
          "NEWSLETTER_OPT_IN",
          "WHATSAPP_OPT_IN",
        ].includes(taskItem.task.type);
        const needsDedicatedTaskScreen =
          handlesInlineForm ||
          taskItem.task.type === "SOCIAL_COMMENT" ||
          taskItem.task.type === "STAMP_SCAN";

        return (
          <div
            className="rounded-[1.75rem] border border-[var(--color-border)] bg-white/90 p-4"
            key={group.groupKey}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                  Next task
                </p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  {taskItem.task.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {taskItem.task.description}
                </p>
              </div>
              <StatusBadge {...taskItem.status} />
            </div>

            {actionLinks.length > 0 ? (
              <div className="mt-4 flex flex-col gap-3">
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
                    href={link.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}

            {needsDedicatedTaskScreen ? (
              <div className="mt-4 flex flex-col gap-3">
                <Link
                  className="action-link action-link-secondary"
                  data-analytics-cta-name="open_task_detail"
                  data-analytics-event="task_inline_open_detail_click"
                  data-analytics-location={analyticsLocation}
                  to={`/${eventSlug}/tasks/${taskItem.task.id}`}
                >
                  Open full task
                </Link>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-3">
                <taskActionFetcher.Form
                  action={`/${eventSlug}/tasks/${taskItem.task.id}`}
                  method="post"
                >
                  <input name="intent" type="hidden" value="claim" />
                  <input name="mode" type="hidden" value="fetcher" />
                  <input name="status" type="hidden" value="COMPLETED_BY_USER" />
                  <Button
                    data-analytics-claim-path="completed_by_user"
                    data-analytics-event="task_claim_click"
                    data-analytics-location={analyticsLocation}
                    disabled={currentTaskAlreadyClaimed}
                    type="submit"
                  >
                    {completedTaskActionLabel ?? getTaskPrimaryActionLabel(taskItem.task)}
                  </Button>
                </taskActionFetcher.Form>
                {taskItem.task.requiresVerification ? (
                  <taskActionFetcher.Form
                    action={`/${eventSlug}/tasks/${taskItem.task.id}`}
                    method="post"
                  >
                    <input name="intent" type="hidden" value="claim" />
                    <input name="mode" type="hidden" value="fetcher" />
                    <input
                      name="status"
                      type="hidden"
                      value="PENDING_STAFF_CHECK"
                    />
                    <Button
                      data-analytics-claim-path="pending_staff_check"
                      data-analytics-event="task_claim_click"
                      data-analytics-location={analyticsLocation}
                      tone="secondary"
                      type="submit"
                    >
                      {getTaskSecondaryActionLabel(taskItem.task)}
                    </Button>
                  </taskActionFetcher.Form>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
