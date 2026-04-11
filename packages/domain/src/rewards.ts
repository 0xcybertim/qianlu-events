import type {
  RewardTier,
  RewardType,
  TaskAttemptLike,
  TaskLike,
} from "@qianlu-events/schemas";

export type RewardSnapshot = {
  claimedPoints: number;
  verifiedPoints: number;
  highestClaimedTier: RewardTier | null;
  highestVerifiedTier: RewardTier | null;
  dailyDrawEligible: boolean;
  instantRewardEligible: boolean;
};

function totalPoints(
  tasks: TaskLike[],
  attempts: TaskAttemptLike[],
  onlyVerified: boolean,
) {
  const pointsByTaskId = new Map(tasks.map((task) => [task.id, task.points]));

  return attempts.reduce((sum, attempt) => {
    if (onlyVerified && attempt.status !== "VERIFIED") {
      return sum;
    }

    if (
      !onlyVerified &&
      ![
        "COMPLETED_BY_USER",
        "PENDING_STAFF_CHECK",
        "PENDING_AUTO_VERIFICATION",
        "VERIFIED",
      ].includes(
        attempt.status,
      )
    ) {
      return sum;
    }

    return sum + (pointsByTaskId.get(attempt.taskId) ?? 0);
  }, 0);
}

function highestTier(points: number, tiers: RewardTier[]) {
  return [...tiers]
    .sort((left, right) => left.threshold - right.threshold)
    .filter((tier) => points >= tier.threshold)
    .at(-1) ?? null;
}

export function calculateRewardSnapshot(args: {
  tasks: TaskLike[];
  attempts: TaskAttemptLike[];
  rewardTiers: RewardTier[];
  rewardTypes: RewardType[];
}) {
  const claimedPoints = totalPoints(args.tasks, args.attempts, false);
  const verifiedPoints = totalPoints(args.tasks, args.attempts, true);
  const highestClaimedTier = highestTier(claimedPoints, args.rewardTiers);
  const highestVerifiedTier = highestTier(verifiedPoints, args.rewardTiers);

  return {
    claimedPoints,
    verifiedPoints,
    highestClaimedTier,
    highestVerifiedTier,
    dailyDrawEligible:
      args.rewardTypes.includes("DAILY_PRIZE_DRAW") && verifiedPoints > 0,
    instantRewardEligible:
      args.rewardTypes.includes("INSTANT_REWARD") && highestVerifiedTier !== null,
  } satisfies RewardSnapshot;
}
