import type {
  EventMarketing,
  EventSettings,
  TaskAttemptStatus,
  TaskLike,
} from "@qianlu-events/schemas";

export const MARKETING_CONSENT_COOKIE_NAME =
  "qianlu_events_marketing_consent";
export const PARTICIPANT_ANALYTICS_EVENT_NAME =
  "qianlu:participant-analytics";

export type MarketingConsentStatus = "accepted" | "rejected";
export type MarketingAnalyticsValue =
  | string
  | number
  | boolean
  | null
  | undefined;
export type MarketingAnalyticsParams = Record<string, MarketingAnalyticsValue>;

export type ParticipantMarketingPage =
  | "landing"
  | "tasks"
  | "task-detail"
  | "account"
  | "summary"
  | "scan-camera"
  | "scan-result";

export type ParticipantAnalyticsEventDetail = {
  googleEventName: string;
  dedupeKey?: string;
  params?: MarketingAnalyticsParams;
};

export type ParticipantMarketingConfig = {
  analytics?: MarketingAnalyticsParams;
  eventName: string;
  eventSlug: string;
  page: ParticipantMarketingPage;
  qrStatus?: string;
  qrToken?: string;
  sessionKey?: string | null;
  settings: EventSettings | null | undefined;
  task?: TaskLike;
  taskStatus?: TaskAttemptStatus | "NOT_STARTED";
  verifiedTaskIds?: string[];
  pointsAwarded?: number;
};

export function resolveMarketingPixelIds(marketing: EventMarketing | undefined) {
  return [marketing?.primaryPixelId?.trim(), marketing?.secondaryPixelId?.trim()].filter(
    (pixelId, index, all): pixelId is string =>
      Boolean(pixelId) && all.indexOf(pixelId) === index,
  );
}

export function getMarketingConsentFromCookie(
  cookieValue: string,
): MarketingConsentStatus | null {
  const entries = cookieValue.split(";");

  for (const entry of entries) {
    const [key, value] = entry.trim().split("=");

    if (key !== MARKETING_CONSENT_COOKIE_NAME) {
      continue;
    }

    if (value === "accepted" || value === "rejected") {
      return value;
    }
  }

  return null;
}

export function setMarketingConsentCookie(status: MarketingConsentStatus) {
  document.cookie = [
    `${MARKETING_CONSENT_COOKIE_NAME}=${status}`,
    "Path=/",
    "Max-Age=15552000",
    "SameSite=Lax",
  ].join("; ");
}

export function getBaseMarketingParams(config: ParticipantMarketingConfig) {
  return {
    ...(config.analytics ?? {}),
    event_name: config.eventName,
    event_slug: config.eventSlug,
    page_name: config.page,
  };
}

export function shouldSendEngagedEvent(page: ParticipantMarketingPage) {
  return page !== "landing";
}

export function isClaimedTaskStatus(status: string | null | undefined) {
  return (
    status === "COMPLETED_BY_USER" ||
    status === "PENDING_STAFF_CHECK" ||
    status === "PENDING_AUTO_VERIFICATION"
  );
}

export function summarizeAnalyticsCounts(
  values: Array<string | null | undefined>,
) {
  const counts = new Map<string, number>();

  for (const value of values) {
    const normalized = value?.trim();

    if (!normalized) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}:${count}`)
    .join("|");
}

export function getTaskAnalyticsParams(task: TaskLike): MarketingAnalyticsParams {
  return {
    task_id: task.id,
    task_platform: task.platform,
    task_points: task.points,
    task_title: task.title,
    task_type: task.type,
    verification_type: task.verificationType,
    requires_verification: task.requiresVerification,
  };
}

export function trackParticipantAnalyticsEvent(
  detail: ParticipantAnalyticsEventDetail,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ParticipantAnalyticsEventDetail>(
      PARTICIPANT_ANALYTICS_EVENT_NAME,
      { detail },
    ),
  );
}
