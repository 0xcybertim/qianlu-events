import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";

import {
  PARTICIPANT_ANALYTICS_EVENT_NAME,
  getBaseMarketingParams,
  getMarketingConsentFromCookie,
  type MarketingAnalyticsParams,
  isClaimedTaskStatus,
  type ParticipantAnalyticsEventDetail,
  resolveMarketingPixelIds,
  setMarketingConsentCookie,
  shouldSendEngagedEvent,
  type MarketingConsentStatus,
  type ParticipantMarketingConfig,
} from "../lib/marketing";

type FbqArgs = [string, ...unknown[]];
type FbqFunction = ((...args: FbqArgs) => void) & {
  callMethod?: (...args: FbqArgs) => void;
  loaded?: boolean;
  push?: (...args: FbqArgs) => void;
  queue?: FbqArgs[];
  version?: string;
};
type GtagArgs = [string, ...unknown[]];
type GtagFunction = (...args: GtagArgs) => void;
type AnalyticsDispatch = (
  eventName: string,
  params?: MarketingAnalyticsParams,
) => void;

const googleAnalyticsMeasurementId =
  import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";

declare global {
  interface Window {
    _fbq?: FbqFunction;
    __qianluGoogleAnalyticsBootstrapped?: boolean;
    __qianluGoogleAnalyticsLoading?: Promise<void>;
    __qianluGoogleAnalyticsMeasurementIds?: Set<string>;
    __qianluMarketingPixelIds?: Set<string>;
    __qianluMetaPixelLoading?: Promise<void>;
    fbq?: FbqFunction;
    dataLayer?: unknown[];
    gtag?: GtagFunction;
  }
}

function normalizeAnalyticsParams(
  params: MarketingAnalyticsParams | undefined,
) {
  if (!params) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
}

function camelCaseToSnakeCase(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/^_+/, "")
    .toLowerCase();
}

function readAnalyticsDataset(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null;
  }

  const element = target.closest<HTMLElement>("[data-analytics-event]");

  if (!element) {
    return null;
  }

  const eventName = element.dataset.analyticsEvent?.trim();

  if (!eventName) {
    return null;
  }

  const params: MarketingAnalyticsParams = {};

  for (const [key, value] of Object.entries(element.dataset)) {
    if (!key.startsWith("analytics") || !value) {
      continue;
    }

    if (key === "analyticsEvent" || key === "analyticsDedupeKey") {
      continue;
    }

    const normalizedKey = camelCaseToSnakeCase(
      key.slice("analytics".length),
    );

    if (!normalizedKey) {
      continue;
    }

    params[normalizedKey] = value;
  }

  if (element instanceof HTMLAnchorElement && element.href) {
    params.destination_url = element.href;
  }

  if (!params.interaction_type) {
    params.interaction_type = element.tagName.toLowerCase();
  }

  return {
    dedupeKey: element.dataset.analyticsDedupeKey?.trim() || undefined,
    eventName,
    params,
  };
}

function getScrollDepthPercent() {
  if (typeof window === "undefined") {
    return 0;
  }

  const documentElement = document.documentElement;
  const scrollableHeight =
    documentElement.scrollHeight - documentElement.clientHeight;

  if (scrollableHeight <= 0) {
    return 100;
  }

  const depth = ((window.scrollY + documentElement.clientHeight) / documentElement.scrollHeight) * 100;

  return Math.max(0, Math.min(100, Math.round(depth)));
}

function getDurationBucket(durationMs: number) {
  if (durationMs < 10_000) {
    return "under_10s";
  }

  if (durationMs < 30_000) {
    return "10s_to_30s";
  }

  if (durationMs < 60_000) {
    return "30s_to_60s";
  }

  if (durationMs < 180_000) {
    return "1m_to_3m";
  }

  return "over_3m";
}

function ensureMetaPixelLoaded() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.__qianluMetaPixelLoading) {
    return window.__qianluMetaPixelLoading;
  }

  const existingScript = document.getElementById("qianlu-meta-pixel-base");

  if (existingScript) {
    window.__qianluMetaPixelLoading = Promise.resolve();
    return window.__qianluMetaPixelLoading;
  }

  if (!window.fbq) {
    const fbq = function (...args: FbqArgs) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
        return;
      }

      fbq.queue?.push(args);
    } as FbqFunction;

    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
  }

  window.__qianluMetaPixelLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.id = "qianlu-meta-pixel-base";
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Meta Pixel."));

    const firstScript = document.getElementsByTagName("script")[0];

    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
      return;
    }

    document.head.appendChild(script);
  });

  return window.__qianluMetaPixelLoading;
}

function ensureGoogleAnalyticsLoaded(measurementId: string) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (window.__qianluGoogleAnalyticsLoading) {
    return window.__qianluGoogleAnalyticsLoading;
  }

  const existingScript = document.getElementById("qianlu-google-analytics-base");

  window.dataLayer = window.dataLayer ?? [];
  window.gtag =
    window.gtag ??
    (function (...args: GtagArgs) {
      window.dataLayer?.push(arguments);
    } as GtagFunction);

  if (existingScript) {
    window.__qianluGoogleAnalyticsLoading = Promise.resolve();
    return window.__qianluGoogleAnalyticsLoading;
  }

  window.__qianluGoogleAnalyticsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");

    script.id = "qianlu-google-analytics-base";
    script.async = true;
    script.src =
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not load Google Analytics."));

    const firstScript = document.getElementsByTagName("script")[0];

    if (firstScript?.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
      return;
    }

    document.head.appendChild(script);
  });

  return window.__qianluGoogleAnalyticsLoading;
}

function initializePixelIds(pixelIds: string[]) {
  if (typeof window === "undefined" || !window.fbq) {
    return;
  }

  const initialized = window.__qianluMarketingPixelIds ?? new Set<string>();

  window.__qianluMarketingPixelIds = initialized;

  for (const pixelId of pixelIds) {
    if (initialized.has(pixelId)) {
      continue;
    }

    window.fbq("init", pixelId);
    initialized.add(pixelId);
  }
}

function initializeGoogleAnalytics(measurementId: string) {
  if (typeof window === "undefined" || !window.gtag) {
    return;
  }

  if (!window.__qianluGoogleAnalyticsBootstrapped) {
    window.gtag("js", new Date());
    window.__qianluGoogleAnalyticsBootstrapped = true;
  }

  const initialized =
    window.__qianluGoogleAnalyticsMeasurementIds ?? new Set<string>();

  window.__qianluGoogleAnalyticsMeasurementIds = initialized;

  if (initialized.has(measurementId)) {
    return;
  }

  window.gtag("config", measurementId, {
    send_page_view: false,
  });
  initialized.add(measurementId);
}

function trackStandardEvent(
  pixelIds: string[],
  eventName: string,
  params?: Record<string, unknown>,
) {
  if (typeof window === "undefined" || !window.fbq) {
    return;
  }

  for (const pixelId of pixelIds) {
    window.fbq("trackSingle", pixelId, eventName, params ?? {});
  }
}

function trackCustomEvent(
  pixelIds: string[],
  eventName: string,
  params: Record<string, unknown>,
) {
  if (typeof window === "undefined" || !window.fbq) {
    return;
  }

  for (const pixelId of pixelIds) {
    window.fbq("trackSingleCustom", pixelId, eventName, params);
  }
}

function trackGoogleAnalyticsEvent(
  measurementId: string,
  eventName: string,
  params?: Record<string, unknown>,
) {
  if (
    typeof window === "undefined" ||
    !window.gtag ||
    measurementId.length === 0
  ) {
    return;
  }

  window.gtag("event", eventName, {
    send_to: measurementId,
    ...(params ?? {}),
  });
}

function claimLocalOnce(key: string) {
  if (typeof window === "undefined") {
    return false;
  }

  const storageKey = `qianlu_events_marketing_sent:${key}`;

  try {
    if (window.localStorage.getItem(storageKey)) {
      return false;
    }

    window.localStorage.setItem(storageKey, "1");
    return true;
  } catch {
    return true;
  }
}

export function ParticipantMarketing({
  config,
}: {
  config: ParticipantMarketingConfig;
}) {
  const location = useLocation();
  const [consent, setConsent] = useState<MarketingConsentStatus | null | "loading">(
    "loading",
  );
  const pageKeyRef = useRef<string | null>(null);
  const pageEngagementRef = useRef<{
    maxScrollPercent: number;
    pageKey: string;
    startedAt: number;
  } | null>(null);
  const pixelIds = resolveMarketingPixelIds(config.settings?.marketing);
  const sessionKey = config.sessionKey ?? "anon";
  const hasTrackingTargets =
    pixelIds.length > 0 || googleAnalyticsMeasurementId.length > 0;
  const baseParams = normalizeAnalyticsParams(getBaseMarketingParams(config));

  const sendGoogleAnalyticsEvent: AnalyticsDispatch = (eventName, params) => {
    if (googleAnalyticsMeasurementId.length === 0) {
      return;
    }

    void ensureGoogleAnalyticsLoaded(googleAnalyticsMeasurementId).then(() => {
      initializeGoogleAnalytics(googleAnalyticsMeasurementId);
      trackGoogleAnalyticsEvent(
        googleAnalyticsMeasurementId,
        eventName,
        normalizeAnalyticsParams(params),
      );
    });
  };

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setConsent(getMarketingConsentFromCookie(document.cookie));
  }, []);

  useEffect(() => {
    if (consent !== "accepted") {
      return;
    }

    if (pixelIds.length > 0) {
      void ensureMetaPixelLoaded().then(() => {
        initializePixelIds(pixelIds);
      });
    }

    if (googleAnalyticsMeasurementId.length > 0) {
      void ensureGoogleAnalyticsLoaded(googleAnalyticsMeasurementId).then(() => {
        initializeGoogleAnalytics(googleAnalyticsMeasurementId);
      });
    }
  }, [consent, pixelIds]);

  useEffect(() => {
    if (consent !== "accepted" || !hasTrackingTargets) {
      return;
    }

    const pageKey = `${config.page}:${location.pathname}${location.search}`;

    if (pageKeyRef.current === pageKey) {
      return;
    }

    pageKeyRef.current = pageKey;

    const pagePath = `${location.pathname}${location.search}`;
    const pageViewParams = {
      ...baseParams,
      page_path: location.pathname,
      page_query: location.search || null,
    };

    if (pixelIds.length > 0) {
      void ensureMetaPixelLoaded().then(() => {
        initializePixelIds(pixelIds);
        trackStandardEvent(pixelIds, "PageView");

        if (config.page === "landing") {
          trackStandardEvent(pixelIds, "ViewContent", {
            ...pageViewParams,
            content_name: config.eventName,
            content_type: "event",
          });
        }

        if (config.page === "task-detail" && config.task) {
          trackStandardEvent(pixelIds, "ViewContent", {
            ...pageViewParams,
            content_name: config.task.title,
            content_type: "task",
            task_id: config.task.id,
            task_title: config.task.title,
            task_type: config.task.type,
          });
        }
      });
    }

    if (googleAnalyticsMeasurementId.length > 0) {
      sendGoogleAnalyticsEvent("page_view", {
        ...pageViewParams,
        page_location: window.location.href,
        page_path: pagePath,
        page_title: document.title || config.eventName,
      });

      if (config.page === "landing") {
        sendGoogleAnalyticsEvent("view_content", {
          ...pageViewParams,
          content_name: config.eventName,
          content_type: "event",
        });
      }

      if (config.page === "task-detail" && config.task) {
        sendGoogleAnalyticsEvent("view_content", {
          ...pageViewParams,
          content_name: config.task.title,
          content_type: "task",
          task_id: config.task.id,
          task_title: config.task.title,
          task_type: config.task.type,
        });
      }
    }
  }, [
    baseParams,
    config,
    consent,
    hasTrackingTargets,
    location.pathname,
    location.search,
    pixelIds,
    sessionKey,
  ]);

  useEffect(() => {
    if (consent !== "accepted" || !hasTrackingTargets) {
      return;
    }

    const actionBaseParams = {
      ...baseParams,
      page_path: location.pathname,
    };

    const sendCustomEvent = (
      eventName: string,
      googleEventName: string,
      params: Record<string, unknown>,
    ) => {
      if (pixelIds.length > 0) {
        void ensureMetaPixelLoaded().then(() => {
          initializePixelIds(pixelIds);
          trackCustomEvent(pixelIds, eventName, params);
        });
      }

      if (googleAnalyticsMeasurementId.length > 0) {
        void ensureGoogleAnalyticsLoaded(googleAnalyticsMeasurementId).then(() => {
          initializeGoogleAnalytics(googleAnalyticsMeasurementId);
          trackGoogleAnalyticsEvent(
            googleAnalyticsMeasurementId,
            googleEventName,
            params,
          );
        });
      }
    };

    if (shouldSendEngagedEvent(config.page)) {
      const engagedKey = `engaged:${config.eventSlug}:${sessionKey}`;

      if (claimLocalOnce(engagedKey)) {
        sendCustomEvent("Engaged", "engaged", actionBaseParams);
      }
    }

    if (config.page === "task-detail" && config.task) {
      const taskParams = {
        ...baseParams,
        ...actionBaseParams,
        content_name: config.task.title,
        content_type: "task",
        task_id: config.task.id,
        task_title: config.task.title,
        task_type: config.task.type,
      };

      if (
        claimLocalOnce(
          `task-started:${config.eventSlug}:${sessionKey}:${config.task.id}`,
        )
      ) {
        sendCustomEvent("TaskStarted", "task_started", taskParams);
      }

      if (
        isClaimedTaskStatus(config.taskStatus) &&
        claimLocalOnce(
          `task-claimed:${config.eventSlug}:${sessionKey}:${config.task.id}`,
        )
      ) {
        sendCustomEvent("TaskClaimed", "task_claimed", taskParams);
      }
    }

    for (const taskId of config.verifiedTaskIds ?? []) {
      const verifiedKey = `task-verified:${config.eventSlug}:${sessionKey}:${taskId}`;

      if (!claimLocalOnce(verifiedKey)) {
        continue;
      }

      sendCustomEvent("TaskVerified", "task_verified", {
        ...baseParams,
        ...actionBaseParams,
        task_id: taskId,
      });
    }

    if (
      config.page === "scan-result" &&
      config.qrStatus === "ACCEPTED" &&
      claimLocalOnce(
        `qr-scan:${config.eventSlug}:${sessionKey}:${config.qrToken ?? location.pathname}`,
      )
    ) {
      sendCustomEvent("QrScanCompleted", "qr_scan_completed", {
        ...baseParams,
        ...actionBaseParams,
        points_awarded: config.pointsAwarded ?? 0,
        qr_token: config.qrToken ?? null,
      });
    }
  }, [
    baseParams,
    config,
    consent,
    hasTrackingTargets,
    location.pathname,
    pixelIds,
    sessionKey,
  ]);

  useEffect(() => {
    if (consent !== "accepted" || googleAnalyticsMeasurementId.length === 0) {
      return;
    }

    const pageKey = `${config.page}:${location.pathname}${location.search}`;

    pageEngagementRef.current = {
      maxScrollPercent: getScrollDepthPercent(),
      pageKey,
      startedAt: Date.now(),
    };

    const handleScroll = () => {
      const current = pageEngagementRef.current;

      if (!current || current.pageKey !== pageKey) {
        return;
      }

      current.maxScrollPercent = Math.max(
        current.maxScrollPercent,
        getScrollDepthPercent(),
      );
    };

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);

      const current = pageEngagementRef.current;

      if (!current || current.pageKey !== pageKey) {
        return;
      }

      const durationMs = Math.max(0, Date.now() - current.startedAt);

      sendGoogleAnalyticsEvent("page_engagement_detail", {
        ...baseParams,
        duration_bucket: getDurationBucket(durationMs),
        duration_ms: durationMs,
        duration_seconds: Math.round(durationMs / 1000),
        max_scroll_percent: current.maxScrollPercent,
        page_path: `${location.pathname}${location.search}`,
      });

      pageEngagementRef.current = null;
    };
  }, [
    baseParams,
    config.page,
    consent,
    location.pathname,
    location.search,
    sendGoogleAnalyticsEvent,
  ]);

  useEffect(() => {
    if (consent !== "accepted" || googleAnalyticsMeasurementId.length === 0) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const analyticsTarget = readAnalyticsDataset(event.target);

      if (!analyticsTarget) {
        return;
      }

      if (
        analyticsTarget.dedupeKey &&
        !claimLocalOnce(analyticsTarget.dedupeKey)
      ) {
        return;
      }

      sendGoogleAnalyticsEvent(analyticsTarget.eventName, {
        ...baseParams,
        page_path: `${location.pathname}${location.search}`,
        ...analyticsTarget.params,
      });
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [
    baseParams,
    consent,
    location.pathname,
    location.search,
    sendGoogleAnalyticsEvent,
  ]);

  useEffect(() => {
    if (consent !== "accepted" || googleAnalyticsMeasurementId.length === 0) {
      return;
    }

    const handleParticipantAnalytics = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<ParticipantAnalyticsEventDetail>;
      const detail = customEvent.detail;

      if (!detail?.googleEventName) {
        return;
      }

      if (detail.dedupeKey && !claimLocalOnce(detail.dedupeKey)) {
        return;
      }

      sendGoogleAnalyticsEvent(detail.googleEventName, {
        ...baseParams,
        page_path: `${location.pathname}${location.search}`,
        ...detail.params,
      });
    };

    window.addEventListener(
      PARTICIPANT_ANALYTICS_EVENT_NAME,
      handleParticipantAnalytics as EventListener,
    );

    return () => {
      window.removeEventListener(
        PARTICIPANT_ANALYTICS_EVENT_NAME,
        handleParticipantAnalytics as EventListener,
      );
    };
  }, [
    baseParams,
    consent,
    location.pathname,
    location.search,
    sendGoogleAnalyticsEvent,
  ]);

  if (!hasTrackingTargets || consent !== null) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
      <div className="mx-auto max-w-xl rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface-strong,#fffaf3)] p-4 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.35)]">
        <p className="text-sm font-semibold text-[var(--color-text)]">
          Allow analytics cookies?
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          Qianlu uses Google Analytics for internal reporting and, if this event
          has client tracking configured, Meta Pixel after consent so engagement
          can be measured.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            className="action-link action-link-primary"
            onClick={() => {
              setMarketingConsentCookie("accepted");
              setConsent("accepted");
            }}
            type="button"
          >
            Accept
          </button>
          <button
            className="action-link action-link-secondary"
            onClick={() => {
              setMarketingConsentCookie("rejected");
              setConsent("rejected");
            }}
            type="button"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
