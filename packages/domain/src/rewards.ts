import type {
  EventInstantRewardRule,
  InstantRewardMatchMode,
  RewardTier,
  RewardType,
  TaskAttemptLike,
  TaskConfig,
  TaskLike,
} from "@qianlu-events/schemas";

export type InstantRewardState = {
  rewardKey: string;
  label: string;
  description?: string;
  taskIds: string[];
  taskMatchMode: InstantRewardMatchMode;
  eligible: boolean;
  verified: boolean;
};

export type RewardSnapshot = {
  claimedPoints: number;
  verifiedPoints: number;
  highestClaimedTier: RewardTier | null;
  highestVerifiedTier: RewardTier | null;
  dailyDrawEligible: boolean;
  instantRewardEligible: boolean;
  instantRewards: InstantRewardState[];
};

function totalPoints(
  tasks: TaskLike[],
  attempts: TaskAttemptLike[],
  onlyVerified: boolean,
) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return attempts.reduce((sum, attempt) => {
    const task = tasksById.get(attempt.taskId);

    if (!task) {
      return sum;
    }

    if (onlyVerified && !taskCountsAsVerified({ attempt, task })) {
      return sum;
    }

    if (!onlyVerified && !taskCountsAsClaimed(attempt)) {
      return sum;
    }

    return sum + task.points;
  }, 0);
}

function highestTier(points: number, tiers: RewardTier[]) {
  return [...tiers]
    .sort((left, right) => left.threshold - right.threshold)
    .filter((tier) => points >= tier.threshold)
    .at(-1) ?? null;
}

function getTaskConfig(task: TaskLike): TaskConfig | null {
  return task.configJson ?? null;
}

function taskCountsAsClaimed(attempt: TaskAttemptLike | undefined) {
  return [
    "COMPLETED_BY_USER",
    "PENDING_STAFF_CHECK",
    "PENDING_AUTO_VERIFICATION",
    "VERIFIED",
  ].includes(attempt?.status ?? "");
}

function taskCountsAsVerified(args: {
  attempt: TaskAttemptLike | undefined;
  task: TaskLike;
}) {
  return (
    args.attempt?.status === "VERIFIED" ||
    (!args.task.requiresVerification && taskCountsAsClaimed(args.attempt))
  );
}

function calculateMatchState(args: {
  attemptsByTaskId: Map<string, TaskAttemptLike>;
  linkedTasks: TaskLike[];
  taskMatchMode: InstantRewardMatchMode;
}) {
  if (args.linkedTasks.length === 0) {
    return {
      eligible: false,
      verified: false,
    };
  }

  const claimedResults = args.linkedTasks.map((task) =>
    taskCountsAsClaimed(args.attemptsByTaskId.get(task.id)),
  );
  const verifiedResults = args.linkedTasks.map((task) =>
    taskCountsAsVerified({
      attempt: args.attemptsByTaskId.get(task.id),
      task,
    }),
  );

  if (args.taskMatchMode === "ALL") {
    return {
      eligible: claimedResults.every(Boolean),
      verified: verifiedResults.every(Boolean),
    };
  }

  return {
    eligible: claimedResults.some(Boolean),
    verified: verifiedResults.some(Boolean),
  };
}

function getConfiguredInstantRewards(args: {
  attempts: TaskAttemptLike[];
  instantRewards: EventInstantRewardRule[];
  tasks: TaskLike[];
}) {
  const attemptsByTaskId = new Map(
    args.attempts.map((attempt) => [attempt.taskId, attempt]),
  );

  return args.instantRewards.map((reward) => {
    const linkedTasks = args.tasks.filter((task) => reward.taskIds.includes(task.id));
    const matchState = calculateMatchState({
      attemptsByTaskId,
      linkedTasks,
      taskMatchMode: reward.taskMatchMode,
    });

    return {
      rewardKey: reward.key,
      label: reward.label,
      ...(reward.description ? { description: reward.description } : {}),
      taskIds: reward.taskIds,
      taskMatchMode: reward.taskMatchMode,
      eligible: matchState.eligible,
      verified: matchState.verified,
    } satisfies InstantRewardState;
  });
}

function getLegacyTaskInstantRewards(args: {
  attempts: TaskAttemptLike[];
  tasks: TaskLike[];
}) {
  const attemptsByTaskId = new Map(
    args.attempts.map((attempt) => [attempt.taskId, attempt]),
  );

  return args.tasks.flatMap((task) => {
    const config = getTaskConfig(task);

    if (!config?.instantRewardLabel) {
      return [];
    }

    return [
      {
        rewardKey: `task:${task.id}`,
        label: config.instantRewardLabel,
        ...(config.instantRewardDescription
          ? { description: config.instantRewardDescription }
          : {}),
        taskIds: [task.id],
        taskMatchMode: "ANY" as const,
        eligible: taskCountsAsClaimed(attemptsByTaskId.get(task.id)),
        verified: taskCountsAsVerified({
          attempt: attemptsByTaskId.get(task.id),
          task,
        }),
      } satisfies InstantRewardState,
    ];
  });
}

export function calculateRewardSnapshot(args: {
  tasks: TaskLike[];
  attempts: TaskAttemptLike[];
  rewardTiers: RewardTier[];
  rewardTypes: RewardType[];
  instantRewards?: EventInstantRewardRule[];
}) {
  const claimedPoints = totalPoints(args.tasks, args.attempts, false);
  const verifiedPoints = totalPoints(args.tasks, args.attempts, true);
  const highestClaimedTier = highestTier(claimedPoints, args.rewardTiers);
  const highestVerifiedTier = highestTier(verifiedPoints, args.rewardTiers);
  const instantRewards = [
    ...getConfiguredInstantRewards({
      attempts: args.attempts,
      instantRewards: args.instantRewards ?? [],
      tasks: args.tasks,
    }),
    ...getLegacyTaskInstantRewards({
      attempts: args.attempts,
      tasks: args.tasks,
    }),
  ];
  const hasVerifiedInstantReward = instantRewards.some((reward) => reward.verified);

  return {
    claimedPoints,
    verifiedPoints,
    highestClaimedTier,
    highestVerifiedTier,
    dailyDrawEligible:
      args.rewardTypes.includes("DAILY_PRIZE_DRAW") && claimedPoints > 0,
    instantRewardEligible:
      args.rewardTypes.includes("INSTANT_REWARD") &&
      (highestVerifiedTier !== null || hasVerifiedInstantReward),
    instantRewards,
  } satisfies RewardSnapshot;
}
