import type {
  ExperienceResponse,
  RewardTier,
  TaskAttemptStatus,
} from "@qianlu-events/schemas";

export function getRewardTiers(experience: ExperienceResponse): RewardTier[] {
  return experience.event.settingsJson?.rewardTiers ?? [];
}

export function getStatusMeta(status: TaskAttemptStatus) {
  switch (status) {
    case "VERIFIED":
      return { label: "Verified", tone: "verified" as const };
    case "COMPLETED_BY_USER":
      return { label: "Claimed", tone: "claimed" as const };
    case "PENDING_STAFF_CHECK":
      return { label: "Pending", tone: "warning" as const };
    case "PENDING_AUTO_VERIFICATION":
      return { label: "Waiting for Facebook comment", tone: "warning" as const };
    case "REJECTED":
      return { label: "Rejected", tone: "rejected" as const };
    default:
      return { label: "Open", tone: "neutral" as const };
  }
}

export function mapTaskAttempts(experience: ExperienceResponse) {
  const attemptsByTaskId = new Map(
    experience.session?.taskAttempts.map((attempt) => [attempt.taskId, attempt]) ?? [],
  );

  return experience.event.tasks.map((task) => {
    const attempt = attemptsByTaskId.get(task.id);

    return {
      task,
      attempt,
      status: getStatusMeta(attempt?.status ?? "NOT_STARTED"),
    };
  });
}
