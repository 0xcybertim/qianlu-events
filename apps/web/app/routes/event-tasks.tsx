import { Link } from "react-router";
import { StatusBadge } from "@qianlu-events/ui";

import type { Route } from "./+types/event-tasks";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import {
  getInstantRewardStates,
  getParticipantContactBannerText,
  getPrizeDrawDescription,
  getPrizeDrawItems,
  getPrizeDrawLabel,
  getRewardTiers,
  getRewardTypes,
  mapTaskAttempts,
} from "../lib/experience";
import { buildPageTitle } from "../lib/meta";
import {
  getTaskAnalyticsParams,
  summarizeAnalyticsCounts,
} from "../lib/marketing";
import { getSocialFollowGroupKey, groupSocialFollowItems } from "../lib/social-follow";
import { getTaskCategoryLabel } from "../lib/task-presentation";
import { ParticipantInlineTaskPanel } from "../components/participant-inline-task-panel";
import { ScreenShell } from "../components/screen-shell";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("Activities", params.eventSlug) }];
}

function formatVerificationCode(code: string) {
  return code.replace(/(.{3})/g, "$1 ").trim();
}

function getInstantRewardStepLabel(args: {
  linkedTaskCount: number;
}) {
  if (args.linkedTaskCount === 0) {
    return "No activity is linked to this reward yet.";
  }

  return "Complete all of these first.";
}

function getInstantRewardHeroCopy(args: {
  label: string;
  verified: boolean;
  eligible: boolean;
}) {
  if (args.verified) {
    return {
      badge: "Unlocked",
      eyebrow: "Unlocked now",
      title: `${args.label} is unlocked`,
    };
  }

  if (args.eligible) {
    return {
      badge: "Ready now",
      eyebrow: "Ready now",
      title: `${args.label} is ready`,
    };
  }

  return {
    badge: "Next reward",
    eyebrow: "Do this first",
    title: `Unlock ${args.label}`,
  };
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
  const socialFollowGroups = groupSocialFollowItems(
    tasks.filter((item) => item.task.type === "SOCIAL_FOLLOW"),
  );
  const socialFollowItemsByGroupKey = new Map(
    socialFollowGroups.map((group) => [group.groupKey, group.items]),
  );
  type TaskAttemptItem = (typeof tasks)[number];
  type RenderedTaskCard =
    | { item: TaskAttemptItem; kind: "task" }
    | { groupKey: string; items: TaskAttemptItem[]; kind: "social-follow" };
  const renderedTaskCards: RenderedTaskCard[] = [];
  const renderedSocialFollowGroupKeys = new Set<string>();

  for (const item of tasks) {
    if (item.task.type !== "SOCIAL_FOLLOW") {
      renderedTaskCards.push({ item, kind: "task" });
      continue;
    }

    const groupKey = getSocialFollowGroupKey(item.task);

    if (!groupKey || renderedSocialFollowGroupKeys.has(groupKey)) {
      continue;
    }

    renderedSocialFollowGroupKeys.add(groupKey);

    const groupItems = socialFollowItemsByGroupKey.get(groupKey);

    if (!groupItems) {
      continue;
    }

    renderedTaskCards.push({
      groupKey,
      items: groupItems,
      kind: "social-follow",
    });
  }
  const rewardTiers = [...getRewardTiers(loaderData)].sort(
    (firstTier, secondTier) => firstTier.threshold - secondTier.threshold,
  );
  const rewardTypes = getRewardTypes(loaderData);
  const instantRewards = getInstantRewardStates(loaderData);
  const featuredReward =
    instantRewards.find((reward) => !reward.verified) ?? instantRewards[0] ?? null;
  const unlockedInstantRewards = instantRewards.filter((reward) => reward.verified);
  const pendingInstantRewards = instantRewards.filter(
    (reward) => reward.eligible && !reward.verified,
  );
  const hasPrizeDraw = rewardTypes.includes("DAILY_PRIZE_DRAW");
  const prizeDrawLabel = getPrizeDrawLabel(loaderData.event.settingsJson);
  const prizeDrawDescription = getPrizeDrawDescription(loaderData.event.settingsJson);
  const prizeDrawItems = getPrizeDrawItems(loaderData.event.settingsJson);
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
  const featuredTaskItems = featuredReward
    ? featuredReward.taskIds.flatMap((taskId) => {
        const taskItem = tasks.find((item) => item.task.id === taskId);

        return taskItem ? [taskItem] : [];
      })
    : [];
  const featuredSocialFollowGroups = groupSocialFollowItems(
    featuredTaskItems.filter((item) => item.task.type === "SOCIAL_FOLLOW"),
  ).map((group) => ({
    groupKey: `linked:${group.groupKey}`,
    items: group.items,
  }));
  const expandedFeaturedTaskGroups = [
    ...featuredTaskItems
      .filter((item) => item.task.type !== "SOCIAL_FOLLOW")
      .map((item, index) => ({
        groupKey: `linked:${item.task.id}:${index}`,
        items: [item],
      })),
    ...featuredSocialFollowGroups,
  ];
  const expandedFeaturedTaskItems = expandedFeaturedTaskGroups.flatMap(
    (group) => group.items,
  );
  const shouldShowAllFeaturedTasksInline =
    expandedFeaturedTaskGroups.length <= 2 ||
    featuredReward?.taskMatchMode === "ALL" ||
    expandedFeaturedTaskGroups.every((group) =>
      group.items.every((item) => item.task.type === "SOCIAL_FOLLOW"),
    );
  const inlineFeaturedTaskGroups =
    shouldShowAllFeaturedTasksInline
      ? expandedFeaturedTaskGroups
      : expandedFeaturedTaskGroups.find((group) =>
          group.items.some(
            (item) =>
              ![
                "COMPLETED_BY_USER",
                "PENDING_STAFF_CHECK",
                "PENDING_AUTO_VERIFICATION",
                "VERIFIED",
              ].includes(item.attempt?.status ?? "NOT_STARTED"),
          ),
        )
        ? [
            expandedFeaturedTaskGroups.find((group) =>
              group.items.some(
                (item) =>
                  ![
                    "COMPLETED_BY_USER",
                    "PENDING_STAFF_CHECK",
                    "PENDING_AUTO_VERIFICATION",
                    "VERIFIED",
                  ].includes(item.attempt?.status ?? "NOT_STARTED"),
              ),
            )!,
          ]
        : expandedFeaturedTaskGroups.slice(0, 1);
  const inlineFeaturedTaskItems = inlineFeaturedTaskGroups.flatMap(
    (group) => group.items,
  );
  const inlineFeaturedTaskIdSet = new Set(
    inlineFeaturedTaskItems.map((item) => item.task.id),
  );
  const featuredTaskIdSet = new Set(
    featuredReward?.linkedTasks.map((task) => task.id) ?? [],
  );
  const featuredRewardCopy = featuredReward
    ? getInstantRewardHeroCopy({
        eligible: featuredReward.eligible,
        label: featuredReward.label,
        verified: featuredReward.verified,
      })
    : null;
  const laterTaskCards =
    inlineFeaturedTaskIdSet.size === 0
      ? renderedTaskCards
      : renderedTaskCards.filter((card) =>
          card.kind === "social-follow"
            ? card.items.every((item) => !inlineFeaturedTaskIdSet.has(item.task.id))
            : !inlineFeaturedTaskIdSet.has(card.item.task.id),
        );

  function renderTaskCard(card: RenderedTaskCard) {
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
            ? { label: "Done", tone: "claimed" as const }
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
          key={`social-follow-group:${card.groupKey}`}
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
                  : `${startedFollowCount}/${card.items.length} done`}
              </span>
            </div>
          </div>
        </Link>
      );
    }

    const { attempt, status, task } = card.item;
    const taskInstantReward = instantRewards.find(
      (reward) => reward.taskIds.includes(task.id),
    );

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
            {taskInstantReward ? (
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                Unlocks {taskInstantReward.label}
              </p>
            ) : null}
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
  }

  return (
    <ScreenShell
      eyebrow="Instant rewards"
      title="Unlock your next booth reward"
      description=""
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
        {featuredReward ? (
          <div className="rounded-[2rem] bg-[var(--color-primary)] p-5 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-34px_rgba(15,109,83,0.72)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_74%,transparent)]">
                  {featuredRewardCopy?.eyebrow}
                </p>
                <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance">
                  {featuredRewardCopy?.title}
                </h2>
              </div>
              <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                {featuredRewardCopy?.badge}
              </span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[color:color-mix(in_srgb,var(--color-primary-contrast)_86%,transparent)]">
              {featuredReward.verified
                ? `All ${featuredReward.linkedTasks.length} linked activit${featuredReward.linkedTasks.length === 1 ? "y is" : "ies are"} done.`
                : featuredReward.description ??
                  "Keep the first booth reward obvious, then let people discover the rest after that."}
            </p>
            <div className="mt-5 rounded-[1.5rem] bg-white/12 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_78%,transparent)]">
                {featuredReward.verified ? "Reward ready" : "What unlocks it"}
              </p>
              {featuredReward.verified ? (
                <div className="mt-2 flex flex-col gap-3">
                  <div className="flex flex-col gap-3">
                    <Link
                      className="action-link bg-white text-[var(--color-text)]"
                      data-analytics-cta-name="show_summary_screen"
                      data-analytics-event="tasks_cta_click"
                      data-analytics-location="reward_ready"
                      to={`/${params.eventSlug}/summary`}
                    >
                      Open staff summary
                    </Link>
                    <Link
                      className="action-link border border-white/18 bg-white/10 text-[var(--color-primary-contrast)]"
                      data-analytics-cta-name="scan_stamp_qr"
                      data-analytics-event="tasks_cta_click"
                      data-analytics-location="reward_ready"
                      to={`/${params.eventSlug}/scan`}
                    >
                      Scan stamp QR
                    </Link>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm leading-6 text-[var(--color-primary-contrast)]">
                  {getInstantRewardStepLabel({
                    linkedTaskCount: featuredReward.linkedTasks.length,
                  })}
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {unlockedInstantRewards.length} unlocked
              </span>
              {pendingInstantRewards.length > 0 ? (
                <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {pendingInstantRewards.length} ready now
                </span>
              ) : null}
              <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                {instantRewards.length} booth reward
                {instantRewards.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        ) : null}

        {!featuredReward?.verified && inlineFeaturedTaskItems.length > 0 ? (
          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Start here
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                  Quickest path to the next reward
                </h2>
              </div>
              <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-contrast)]">
                {inlineFeaturedTaskItems.length} step
                {inlineFeaturedTaskItems.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4">
              <ParticipantInlineTaskPanel
                analyticsLocation="tasks_featured_reward"
                eventSlug={params.eventSlug}
                itemGroups={inlineFeaturedTaskGroups}
                items={inlineFeaturedTaskItems}
              />
            </div>
            {featuredTaskIdSet.size > inlineFeaturedTaskIdSet.size ? (
              <p className="mt-4 text-sm leading-6 text-slate-700">
                More linked task options are still available further down this page.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="card-surface rounded-[2rem] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Keep going
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                You can still earn more
              </h2>
            </div>
            <span className="rounded-full bg-[var(--color-primary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-primary-contrast)]">
              {session.claimedPoints} pts
            </span>
          </div>
          <div className="mt-4 rounded-[1.5rem] bg-white/70 p-4 text-sm leading-6 text-slate-700">
            <p>
              You can keep going with more activities and stamp scans around the event.
            </p>
            <p className="mt-3">
              Every extra point helps you move toward higher point rewards
              {hasPrizeDraw ? ` and gives you more ${prizeDrawLabel.toLowerCase()} entries` : ""}.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[1.5rem] bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Points
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
                {session.claimedPoints}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                of {totalAvailablePoints}
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Started
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-slate-950">
                {startedCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                of {tasks.length} tasks
              </p>
            </div>
            <div className="rounded-[1.5rem] bg-white/70 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Code
              </p>
              <p className="mt-2 font-display text-xl font-semibold text-slate-950">
                {formatVerificationCode(session.verificationCode)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Show later to staff</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-[1.5rem] bg-white/70 px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                    Next points reward
                  </p>
                  <p className="mt-2 font-semibold text-slate-950">
                    {nextRewardTier
                      ? `${nextRewardTier.label} at ${nextRewardTier.threshold} points`
                      : session.rewardTier ?? "All point tiers unlocked"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-950/7 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                  {nextRewardTier
                    ? `${Math.max(nextRewardTier.threshold - session.claimedPoints, 0)} to go`
                    : "Unlocked"}
                </span>
              </div>
            </div>
            {hasPrizeDraw ? (
              <div className="rounded-[1.5rem] bg-white/70 px-4 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">
                      {prizeDrawLabel}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      {prizeDrawDescription}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-950/7 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                    {session.claimedPoints} entr{session.claimedPoints === 1 ? "y" : "ies"}
                  </span>
                </div>
                {prizeDrawItems.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {prizeDrawItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {pendingReviewCount > 0 ? (
              <div className="rounded-[1.5rem] bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
                {pendingReviewCount} activit{pendingReviewCount === 1 ? "y is" : "ies are"} waiting for review or automatic verification before they fully count.
              </div>
            ) : null}
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-950/8">
                <div
                  className="h-full rounded-full bg-[var(--color-primary)]"
                  style={{ width: `${pointsProgressPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Overall progress: {progressPct}%
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <Link
              className="action-link action-link-secondary"
              data-analytics-cta-name="scan_stamp_qr"
              data-analytics-event="tasks_cta_click"
              data-analytics-location="later_panel"
              to={`/${params.eventSlug}/scan`}
            >
              Scan stamp QR
            </Link>
            <Link
              className="action-link action-link-secondary"
              data-analytics-cta-name="show_summary_screen"
              data-analytics-event="tasks_cta_click"
              data-analytics-location="later_panel"
              to={`/${params.eventSlug}/summary`}
            >
              Open staff summary later
            </Link>
          </div>
        </div>

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

        {laterTaskCards.length > 0 ? (
          <div>
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Everything else
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-slate-950">
                More activities that still count later
              </h2>
            </div>
            <div className="space-y-3">
              {laterTaskCards.map((card) => renderTaskCard(card))}
            </div>
          </div>
        ) : null}
      </div>
    </ScreenShell>
  );
}
