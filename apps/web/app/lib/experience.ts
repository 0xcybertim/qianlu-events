import type {
  EventSettings,
  ExperienceResponse,
  ParticipantMessaging,
  RewardType,
  RewardTier,
  TaskAttemptStatus,
} from "@qianlu-events/schemas";

export function getRewardTiers(experience: ExperienceResponse): RewardTier[] {
  return experience.event.settingsJson?.rewardTiers ?? [];
}

export function getRewardTypes(experience: ExperienceResponse): RewardType[] {
  return experience.event.settingsJson?.rewardTypes ?? [];
}

export function getParticipantMessaging(
  experience: ExperienceResponse,
): ParticipantMessaging | undefined {
  return experience.event.settingsJson?.participantMessaging;
}

function cleanLabel(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

export function getParticipantContactBannerText(
  settings: EventSettings | null | undefined,
) {
  const configuredMessage = cleanLabel(settings?.participantMessaging?.saveProgressMessage);

  if (configuredMessage) {
    return configuredMessage;
  }

  const rewardTypes = settings?.rewardTypes ?? [];
  const drawLabel =
    cleanLabel(settings?.participantMessaging?.prizeDrawLabel) ??
    (rewardTypes.includes("DAILY_PRIZE_DRAW") ? "prize draws" : null);
  const laterPrizeLabel =
    cleanLabel(settings?.participantMessaging?.laterPrizeLabel) ??
    (rewardTypes.includes("TIERED_REWARD") ? "later prizes" : null);

  if (drawLabel && laterPrizeLabel) {
    return `Add your email to save your progress and hear about ${drawLabel} or ${laterPrizeLabel}.`;
  }

  if (drawLabel) {
    return `Add your email to save your progress and hear about ${drawLabel}.`;
  }

  if (laterPrizeLabel) {
    return `Add your email to save your progress and hear about ${laterPrizeLabel}.`;
  }

  return "Add your email to save your progress.";
}

export function getParticipantContactReasonText(
  settings: EventSettings | null | undefined,
) {
  const configuredMessage = cleanLabel(settings?.participantMessaging?.saveProgressMessage);

  if (configuredMessage) {
    return configuredMessage;
  }

  const rewardTypes = settings?.rewardTypes ?? [];
  const drawLabel =
    cleanLabel(settings?.participantMessaging?.prizeDrawLabel) ??
    (rewardTypes.includes("DAILY_PRIZE_DRAW") ? "prize draws" : null);
  const laterPrizeLabel =
    cleanLabel(settings?.participantMessaging?.laterPrizeLabel) ??
    (rewardTypes.includes("TIERED_REWARD") ? "later prizes" : null);

  if (drawLabel && laterPrizeLabel) {
    return `save your progress and hear about ${drawLabel} or ${laterPrizeLabel}`;
  }

  if (drawLabel) {
    return `save your progress and hear about ${drawLabel}`;
  }

  if (laterPrizeLabel) {
    return `save your progress and hear about ${laterPrizeLabel}`;
  }

  return "save your progress";
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
