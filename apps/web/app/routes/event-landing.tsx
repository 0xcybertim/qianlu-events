import { Link } from "react-router";

import type { Route } from "./+types/event-landing";
import { fetchExperience } from "../lib/api.server";
import { getBrandingStyle } from "../lib/branding";
import {
  getInstantRewardStates,
  getPrizeDrawDescription,
  getPrizeDrawItems,
  getPrizeDrawLabel,
  getRewardTiers,
  getRewardTypes,
  mapTaskAttempts,
} from "../lib/experience";
import { buildPageTitle, humanizeSlug } from "../lib/meta";
import { summarizeAnalyticsCounts } from "../lib/marketing";
import { groupSocialFollowItems } from "../lib/social-follow";
import { ParticipantInlineTaskPanel } from "../components/participant-inline-task-panel";
import { ScreenShell } from "../components/screen-shell";

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
    eyebrow: "Start here",
    title: `Unlock ${args.label} first`,
  };
}

export function meta({ params }: Route.MetaArgs) {
  return [{ title: buildPageTitle("Overview", params.eventSlug) }];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  return fetchExperience(params.eventSlug, request);
}

export default function EventLanding({ loaderData, params }: Route.ComponentProps) {
  const eventName = loaderData.event.name || humanizeSlug(params.eventSlug);
  const themeStyle = getBrandingStyle(loaderData);
  const tasks = mapTaskAttempts(loaderData);
  const instantRewards = getInstantRewardStates(loaderData);
  const featuredReward =
    instantRewards.find((reward) => !reward.verified) ?? instantRewards[0] ?? null;
  const rewardTiers = [...getRewardTiers(loaderData)].sort(
    (firstTier, secondTier) => firstTier.threshold - secondTier.threshold,
  );
  const rewardTypes = getRewardTypes(loaderData);
  const rewardTypeSummary = summarizeAnalyticsCounts(
    loaderData.event.settingsJson?.rewardTypes ?? [],
  );
  const taskTypeSummary = summarizeAnalyticsCounts(
    loaderData.event.tasks.map((task) => task.type),
  );
  const taskPlatformSummary = summarizeAnalyticsCounts(
    loaderData.event.tasks.map((task) => task.platform),
  );
  const session = loaderData.session;
  const unlockedInstantRewards = instantRewards.filter((reward) => reward.verified);
  const pendingInstantRewards = instantRewards.filter(
    (reward) => reward.eligible && !reward.verified,
  );
  const hasPrizeDraw = rewardTypes.includes("DAILY_PRIZE_DRAW");
  const prizeDrawLabel = getPrizeDrawLabel(loaderData.event.settingsJson);
  const prizeDrawDescription = getPrizeDrawDescription(loaderData.event.settingsJson);
  const prizeDrawItems = getPrizeDrawItems(loaderData.event.settingsJson);

  if (!session) {
    return (
      <ScreenShell
        eyebrow="Instant rewards first"
        title={eventName}
        description=""
        marketing={{
          analytics: {
            has_session: false,
            reward_tier_count: rewardTiers.length,
            reward_type_summary: rewardTypeSummary || null,
            task_platform_summary: taskPlatformSummary || null,
            task_type_summary: taskTypeSummary || null,
            total_tasks: loaderData.event.tasks.length,
          },
          eventName,
          eventSlug: loaderData.event.slug,
          page: "landing",
          settings: loaderData.event.settingsJson,
        }}
        style={themeStyle}
      >
        <div className="space-y-4">
          {featuredReward ? (
            <div className="rounded-[2rem] bg-[var(--color-primary)] p-5 text-[var(--color-primary-contrast)] shadow-[0_24px_60px_-34px_rgba(15,109,83,0.72)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_74%,transparent)]">
                    Start here
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance">
                    Unlock {featuredReward.label} first
                  </h2>
                </div>
                <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]">
                  Instant reward
                </span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[color:color-mix(in_srgb,var(--color-primary-contrast)_86%,transparent)]">
                {featuredReward.description ??
                  "This is the fastest reward to aim for when someone opens the app for the first time."}
              </p>
              <div className="mt-5 rounded-[1.5rem] bg-white/12 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_78%,transparent)]">
                  How to unlock it
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-primary-contrast)]">
                  {getInstantRewardStepLabel({
                    linkedTaskCount: featuredReward.linkedTasks.length,
                  })}
                </p>
                {featuredReward.linkedTasks.length > 0 ? (
                  <div className="mt-4 grid gap-3">
                    {featuredReward.linkedTasks.map((task) => (
                      <Link
                        className="flex min-h-12 w-full items-center justify-between gap-4 rounded-[1.1rem] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-text)] transition-transform duration-150 hover:-translate-y-0.5"
                        data-analytics-event="landing_reward_task_click"
                        data-analytics-location="hero"
                        data-analytics-reward-key={featuredReward.rewardKey}
                        key={task.id}
                        to={`/${params.eventSlug}/tasks/${task.id}`}
                      >
                        <span className="min-w-0 flex-1 text-left text-base leading-6">
                          {task.title}
                        </span>
                        <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-slate-500">
                          Open
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {instantRewards.length} booth reward
                  {instantRewards.length === 1 ? "" : "s"}
                </span>
                {hasPrizeDraw ? (
                  <span className="rounded-full bg-white/14 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]">
                    {prizeDrawLabel} runs later
                  </span>
                ) : null}
              </div>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  className="action-link bg-white text-[var(--color-text)]"
                  data-analytics-cta-name="start_first_reward"
                  data-analytics-event="landing_cta_click"
                  data-analytics-location="hero"
                  to={`/${params.eventSlug}/tasks`}
                >
                  Start unlocking rewards
                </Link>
                <Link
                  className="action-link border border-white/18 bg-white/10 text-[var(--color-primary-contrast)]"
                  data-analytics-cta-name="scan_stamp_qr"
                  data-analytics-event="landing_cta_click"
                  data-analytics-location="hero"
                  to={`/${params.eventSlug}/scan`}
                >
                  Scan stamp QR
                </Link>
              </div>
            </div>
          ) : (
            <div className="card-surface rounded-[2rem] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                    Start here
                  </p>
                  <h2 className="mt-3 font-display text-2xl font-semibold">
                    Open the first activity
                  </h2>
                </div>
                <span className="rounded-full bg-[var(--color-secondary)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-900">
                  Live event
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">
                This event does not have a dedicated instant reward configured yet, so start with the quickest activity and build from there.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  className="action-link action-link-primary"
                  data-analytics-cta-name="start_tasks"
                  data-analytics-event="landing_cta_click"
                  data-analytics-location="hero"
                  to={`/${params.eventSlug}/tasks`}
                >
                  Start activities
                </Link>
                <Link
                  className="action-link action-link-secondary"
                  data-analytics-cta-name="scan_stamp_qr"
                  data-analytics-event="landing_cta_click"
                  data-analytics-location="hero"
                  to={`/${params.eventSlug}/scan`}
                >
                  Scan stamp QR
                </Link>
              </div>
            </div>
          )}

          <div className="card-surface rounded-[2rem] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                  Later
                </p>
                <h2 className="mt-3 font-display text-2xl font-semibold">
                  Points and raffles come after the first reward
                </h2>
              </div>
              <span className="rounded-full bg-slate-950/7 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                {loaderData.event.tasks.length} activities
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <p>Once the first reward makes sense, visitors can keep going for points, tiers, and optional raffle entries.</p>
              {hasPrizeDraw ? <p>{prizeDrawDescription}</p> : null}
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  const startedCount = tasks.filter(
    (item) => item.attempt && item.attempt.status !== "NOT_STARTED",
  ).length;
  const progressPct = tasks.length > 0 ? Math.round((startedCount / tasks.length) * 100) : 0;
  const totalAvailablePoints = tasks.reduce((sum, item) => sum + item.task.points, 0);
  const pointsProgressPct =
    totalAvailablePoints > 0
      ? Math.min(100, Math.round((session.claimedPoints / totalAvailablePoints) * 100))
      : 0;
  const nextRewardTier =
    rewardTiers.find((tier) => session.claimedPoints < tier.threshold) ?? null;
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
  const verifiedTaskIds = tasks
    .filter((item) => item.attempt?.status === "VERIFIED")
    .map((item) => item.task.id);
  const featuredRewardCopy = featuredReward
    ? getInstantRewardHeroCopy({
        eligible: featuredReward.eligible,
        label: featuredReward.label,
        verified: featuredReward.verified,
      })
    : null;

  return (
    <ScreenShell
      eyebrow="Instant rewards first"
      title={eventName}
      description=""
      marketing={{
        analytics: {
          has_session: true,
          claimed_points: session.claimedPoints,
          reward_tier_count: rewardTiers.length,
          reward_type_summary: rewardTypeSummary || null,
          task_platform_summary: taskPlatformSummary || null,
          task_type_summary: taskTypeSummary || null,
          total_tasks: loaderData.event.tasks.length,
          verified_points: session.verifiedPoints,
        },
        eventName,
        eventSlug: loaderData.event.slug,
        page: "landing",
        sessionKey: session.verificationCode,
        settings: loaderData.event.settingsJson,
        verifiedTaskIds,
      }}
      style={themeStyle}
    >
      <div className="space-y-4">
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
                  "Keep the first booth reward obvious. Everything else can stay secondary until this part is clear."}
            </p>
            <div className="mt-5 rounded-[1.5rem] bg-white/12 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:color-mix(in_srgb,var(--color-primary-contrast)_78%,transparent)]">
                {featuredReward.verified ? "Reward ready" : "How to get it"}
              </p>
              {featuredReward.verified ? (
                <div className="mt-2 flex flex-col gap-3">
                  <div className="flex flex-col gap-3">
                    <Link
                      className="action-link bg-white text-[var(--color-text)]"
                      data-analytics-cta-name="open_staff_summary"
                      data-analytics-event="landing_cta_click"
                      data-analytics-location="reward_ready"
                      to={`/${params.eventSlug}/summary`}
                    >
                      Open staff summary
                    </Link>
                    <Link
                      className="action-link border border-white/18 bg-white/10 text-[var(--color-primary-contrast)]"
                      data-analytics-cta-name="open_more_activities"
                      data-analytics-event="landing_cta_click"
                      data-analytics-location="reward_ready"
                      to={`/${params.eventSlug}/tasks`}
                    >
                      Keep earning points
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-primary-contrast)]">
                    {getInstantRewardStepLabel({
                      linkedTaskCount: featuredReward.linkedTasks.length,
                    })}
                  </p>
                  {inlineFeaturedTaskItems.length > 0 ? (
                    <div className="mt-4">
                      <ParticipantInlineTaskPanel
                        analyticsLocation="landing_featured_reward"
                        eventSlug={params.eventSlug}
                        itemGroups={inlineFeaturedTaskGroups}
                        items={inlineFeaturedTaskItems}
                      />
                    </div>
                  ) : null}
                </>
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

        <div className="card-surface rounded-[2rem] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-primary)]">
                Keep going
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold text-slate-950">
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
        </div>

        <div className="flex flex-col gap-3">
          <Link
            className="action-link action-link-primary"
            data-analytics-cta-name="open_activities"
            data-analytics-event="landing_cta_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/tasks`}
          >
            Open activities
          </Link>
          <Link
            className="action-link action-link-secondary"
            data-analytics-cta-name="open_staff_summary"
            data-analytics-event="landing_cta_click"
            data-analytics-location="footer"
            to={`/${params.eventSlug}/summary`}
          >
            Open staff summary later
          </Link>
        </div>
      </div>
    </ScreenShell>
  );
}
