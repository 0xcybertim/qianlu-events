import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, redirect, useNavigation } from "react-router";
import { type ReactNode, useEffect, useState } from "react";

import type { Route } from "./+types/admin-event-tasks";
import {
  createAdminTask,
  disableAdminTask,
  fetchAdminEvent,
  fetchAdminFacebookCommentDebug,
  fetchAdminFacebookConnectionDebug,
  fetchAdminFacebookPostOptions,
  fetchAdminFacebookPendingConnection,
  fetchAdminInstagramCommentDebug,
  fetchAdminInstagramConnectionDebug,
  fetchAdminInstagramMediaOptions,
  fetchAdminInstagramPendingConnection,
  selectAdminFacebookConnection,
  selectAdminInstagramConnection,
  updateAdminTask,
} from "../lib/api.server";
import {
  AdminCard,
  AdminField,
  AdminShell,
  adminInputClass,
} from "../components/admin-shell";

const taskTypes = [
  "SOCIAL_FOLLOW",
  "SOCIAL_LIKE",
  "SOCIAL_SHARE",
  "SOCIAL_COMMENT",
  "LEAD_FORM",
  "QUIZ",
  "NEWSLETTER_OPT_IN",
  "WHATSAPP_OPT_IN",
  "REFERRAL",
  "PHOTO_PROOF",
  "STAMP_SCAN",
] as const;
const platforms = [
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "WHATSAPP",
  "EMAIL",
  "IN_PERSON",
  "NONE",
] as const;
const verificationTypes = [
  "NONE",
  "AUTOMATIC",
  "VISUAL_STAFF_CHECK",
  "STAFF_PIN_CONFIRM",
] as const;

type TaskTypeValue = (typeof taskTypes)[number];
type PlatformValue = (typeof platforms)[number];
type VerificationTypeValue = (typeof verificationTypes)[number];

type TaskTypeGuide = {
  allowedPlatforms: PlatformValue[];
  allowedVerificationTypes: VerificationTypeValue[];
  defaultPlatform: PlatformValue;
  defaultRequiresVerification: boolean;
  defaultVerificationType: VerificationTypeValue;
  detailHint: string;
  lockPlatform?: boolean;
  lockRequiresVerification?: boolean;
  lockVerification?: boolean;
  setupSteps: string[];
  showCommentAutomationOptions?: boolean;
  showFacebookCommentFields?: boolean;
  showProofHint?: boolean;
  showSecondaryLinkFields?: boolean;
  summary: string;
};

const taskTypeGuides: Record<TaskTypeValue, TaskTypeGuide> = {
  SOCIAL_FOLLOW: {
    allowedPlatforms: ["INSTAGRAM", "FACEBOOK", "TIKTOK", "WHATSAPP"],
    allowedVerificationTypes: ["VISUAL_STAFF_CHECK", "STAFF_PIN_CONFIRM", "NONE"],
    defaultPlatform: "INSTAGRAM",
    defaultRequiresVerification: true,
    defaultVerificationType: "VISUAL_STAFF_CHECK",
    detailHint: "Use this for manual follow tasks on social platforms.",
    setupSteps: [
      "Choose the social platform participants should follow.",
      "Add the profile URL and a clear button label.",
      "Tell staff what proof to expect if manual verification is needed.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants open a profile, follow it, and return for manual or staff-assisted verification.",
  },
  SOCIAL_LIKE: {
    allowedPlatforms: ["INSTAGRAM", "FACEBOOK", "TIKTOK"],
    allowedVerificationTypes: ["VISUAL_STAFF_CHECK", "STAFF_PIN_CONFIRM", "NONE"],
    defaultPlatform: "FACEBOOK",
    defaultRequiresVerification: true,
    defaultVerificationType: "VISUAL_STAFF_CHECK",
    detailHint: "Use this for post-like tasks that are checked manually.",
    setupSteps: [
      "Choose the platform that contains the post.",
      "Paste the public post URL participants should open.",
      "Describe what proof staff should look for if verification stays manual.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants open a social post and like it. Manual verification is recommended.",
  },
  SOCIAL_SHARE: {
    allowedPlatforms: ["FACEBOOK", "INSTAGRAM", "TIKTOK", "WHATSAPP"],
    allowedVerificationTypes: ["VISUAL_STAFF_CHECK", "STAFF_PIN_CONFIRM", "NONE"],
    defaultPlatform: "FACEBOOK",
    defaultRequiresVerification: true,
    defaultVerificationType: "VISUAL_STAFF_CHECK",
    detailHint: "Use this when participants need to share or repost something manually.",
    setupSteps: [
      "Choose the platform participants should share from.",
      "Paste the source URL or post they should share.",
      "Explain how staff can verify the share if needed.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: true,
    summary: "Participants share a social post or link. Manual verification is recommended.",
  },
  SOCIAL_COMMENT: {
    allowedPlatforms: ["FACEBOOK", "INSTAGRAM"],
    allowedVerificationTypes: ["AUTOMATIC"],
    defaultPlatform: "INSTAGRAM",
    defaultRequiresVerification: true,
    defaultVerificationType: "AUTOMATIC",
    detailHint: "Use this for auto-verified Facebook or Instagram comments. The selected post/media owner must be connected in Meta first.",
    lockRequiresVerification: true,
    lockVerification: true,
    setupSteps: [
      "Connect the Facebook Page or Instagram professional account that owns the target post/media.",
      "Paste the public post URL and the Graph API post/media ID, or choose it from the connected account.",
      "Choose the required prefix participants must comment, for example `QIANLU`.",
      "Keep participant verification code and auto verify turned on.",
    ],
    showCommentAutomationOptions: true,
    showFacebookCommentFields: true,
    showProofHint: false,
    showSecondaryLinkFields: false,
    summary: "Participants comment a generated code on a Facebook or Instagram post and the system verifies it automatically through the webhook/API flow.",
  },
  LEAD_FORM: {
    allowedPlatforms: ["EMAIL"],
    allowedVerificationTypes: ["NONE"],
    defaultPlatform: "EMAIL",
    defaultRequiresVerification: false,
    defaultVerificationType: "NONE",
    detailHint: "This is an internal form task, so no external verification step is needed.",
    lockPlatform: true,
    lockRequiresVerification: true,
    lockVerification: true,
    setupSteps: [
      "Write a clear title and explain what information the participant should submit.",
      "Keep verification turned off because the form itself completes the task.",
    ],
    showProofHint: false,
    showSecondaryLinkFields: false,
    summary: "Participants submit details directly in the app. The task completes without manual review.",
  },
  QUIZ: {
    allowedPlatforms: ["NONE"],
    allowedVerificationTypes: ["NONE"],
    defaultPlatform: "NONE",
    defaultRequiresVerification: false,
    defaultVerificationType: "NONE",
    detailHint: "Quiz tasks complete inside the app and do not need a platform or verification step.",
    lockPlatform: true,
    lockRequiresVerification: true,
    lockVerification: true,
    setupSteps: [
      "Write a title and description that tell participants what quiz they are taking.",
      "Keep verification turned off because the quiz flow handles completion.",
    ],
    showProofHint: false,
    showSecondaryLinkFields: false,
    summary: "Participants answer questions inside the app. The task completes without manual review.",
  },
  NEWSLETTER_OPT_IN: {
    allowedPlatforms: ["EMAIL"],
    allowedVerificationTypes: ["NONE", "VISUAL_STAFF_CHECK"],
    defaultPlatform: "EMAIL",
    defaultRequiresVerification: false,
    defaultVerificationType: "NONE",
    detailHint: "Use this for email/newsletter sign-up flows.",
    lockPlatform: true,
    setupSteps: [
      "Add the signup link participants should open.",
      "Use verification only if your process needs a manual staff check.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants opt in to email updates. Usually no manual verification is needed.",
  },
  WHATSAPP_OPT_IN: {
    allowedPlatforms: ["WHATSAPP"],
    allowedVerificationTypes: ["VISUAL_STAFF_CHECK", "STAFF_PIN_CONFIRM", "NONE"],
    defaultPlatform: "WHATSAPP",
    defaultRequiresVerification: true,
    defaultVerificationType: "VISUAL_STAFF_CHECK",
    detailHint: "Use this for WhatsApp chats or group join actions.",
    lockPlatform: true,
    setupSteps: [
      "Paste the WhatsApp deep link participants should open.",
      "Explain what proof staff should look for after the join or message action.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants open a WhatsApp action and confirm it through manual verification.",
  },
  REFERRAL: {
    allowedPlatforms: ["NONE", "EMAIL", "WHATSAPP"],
    allowedVerificationTypes: ["NONE", "VISUAL_STAFF_CHECK", "STAFF_PIN_CONFIRM"],
    defaultPlatform: "NONE",
    defaultRequiresVerification: false,
    defaultVerificationType: "NONE",
    detailHint: "Use this for invite-a-friend or referral style mechanics.",
    setupSteps: [
      "Describe what counts as a valid referral.",
      "Only turn verification on if staff need to review the referral manually.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants complete a referral action. Verification depends on your event process.",
  },
  PHOTO_PROOF: {
    allowedPlatforms: ["IN_PERSON", "NONE"],
    allowedVerificationTypes: ["VISUAL_STAFF_CHECK"],
    defaultPlatform: "IN_PERSON",
    defaultRequiresVerification: true,
    defaultVerificationType: "VISUAL_STAFF_CHECK",
    detailHint: "Use this when staff need to inspect a submitted photo.",
    lockVerification: true,
    setupSteps: [
      "Describe exactly what the participant must photograph.",
      "Tell staff what makes the photo acceptable in the proof hint.",
    ],
    showProofHint: true,
    showSecondaryLinkFields: false,
    summary: "Participants submit or show a photo, and staff verify it visually.",
  },
  STAMP_SCAN: {
    allowedPlatforms: ["IN_PERSON"],
    allowedVerificationTypes: ["NONE"],
    defaultPlatform: "IN_PERSON",
    defaultRequiresVerification: false,
    defaultVerificationType: "NONE",
    detailHint: "Stamp scans complete through the QR/stamp flow and should not require a second verification step.",
    lockPlatform: true,
    lockRequiresVerification: true,
    lockVerification: true,
    setupSteps: [
      "Create the stamp task title and placement order.",
      "Use the QR Codes tab to issue the actual scan code for this task.",
    ],
    showProofHint: false,
    showSecondaryLinkFields: false,
    summary: "Participants scan a QR/stamp code in person. The scan itself completes the task.",
  },
};

function getTaskTypeGuide(type: string) {
  return taskTypeGuides[(taskTypes.includes(type as TaskTypeValue)
    ? type
    : "SOCIAL_FOLLOW") as TaskTypeValue];
}

function formatEnumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTaskPointsLabel(points: number) {
  return `${points} ${points === 1 ? "pt" : "pts"}`;
}

function normalizeTaskFilter(value: string) {
  return value.trim().toLowerCase();
}

function taskMatchesFilter(
  task: {
    title: string;
    type: string;
    platform: string;
    description: string;
  },
  filterValue: string,
) {
  if (!filterValue) {
    return true;
  }

  const haystack = [
    task.title,
    formatEnumLabel(task.type),
    formatEnumLabel(task.platform),
    task.description,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(filterValue);
}

function buildCommentPrefixBase(value: string) {
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .join("_")
    .slice(0, 18);

  return normalized || "COMMENT";
}

function normalizeCommentPrefixValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function buildUniqueCommentPrefix(args: {
  existingPrefixes: string[];
  fallback?: string;
  title: string;
}) {
  const used = new Set(
    args.existingPrefixes.map((prefix) => normalizeCommentPrefixValue(prefix)),
  );
  const base = buildCommentPrefixBase(args.title || args.fallback || "COMMENT");

  if (!used.has(base)) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}_${index}`;

    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return `${base}_${Date.now().toString().slice(-4)}`;
}

function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL ??
    process.env.VITE_API_BASE_URL ??
    process.env.API_BASE_URL ??
    "http://localhost:3001"
  );
}

function getFacebookOauthStartUrl(eventSlug: string) {
  return `/admin/events/${encodeURIComponent(eventSlug)}/facebook-oauth/start`;
}

function getInstagramOauthStartUrl(eventSlug: string) {
  return `/admin/events/${encodeURIComponent(eventSlug)}/instagram-oauth/start`;
}

function formatFacebookSourceLabel(source: string) {
  if (source === "user_accounts") return "/me/accounts";
  if (source === "business_owned_pages") return "/{business-id}/owned_pages";
  if (source === "business_client_pages") return "/{business-id}/client_pages";

  return source;
}

function FacebookOnboardingCard({
  connection,
  connectStatus,
  eventSlug,
  latestFacebookDebug,
  pendingConnection,
  showOauthDebugPanel,
}: {
  connectStatus?: string | null;
  connection?: {
    hasAccessToken: boolean;
    pageId: string;
    pageName: string | null;
    tokenHint: string | null;
    updatedAt: string;
  } | null;
  eventSlug: string;
  latestFacebookDebug?: {
    consumedAt: string | null;
    createdAt: string;
    discoveryLogs: {
      businessId: string | null;
      businessName: string | null;
      count: number | null;
      endpoint:
        | "/me/accounts"
        | "/me/businesses"
        | "/{business-id}/owned_pages"
        | "/{business-id}/client_pages"
        | "/{page-id}";
      error: string | null;
      pageId: string | null;
      pageName: string | null;
    }[];
    discoveryWarnings: {
      businessId: string | null;
      businessName: string | null;
      message: string;
      stage:
        | "business_client_pages"
        | "business_owned_pages"
        | "user_businesses";
    }[];
    droppedPages: {
      pageId: string | null;
      pageName: string | null;
      reason:
        | "missing_access_token"
        | "missing_id"
        | "missing_name"
        | "token_lookup_failed";
    }[];
    expiresAt: string;
    pages: {
      pageId: string;
      pageName: string;
    }[];
    rawPages: {
      accessTokenReturned: boolean;
      businesses: {
        businessId: string | null;
        businessName: string | null;
        permittedRoles: string[];
      }[];
      pageId: string | null;
      pageName: string | null;
      permittedTasks: string[];
      sources: (
        | "user_accounts"
        | "business_owned_pages"
        | "business_client_pages"
      )[];
      tasks: string[];
      tokenLookupAttempted: boolean;
      tokenLookupError: string | null;
    }[];
    state: string;
  } | null;
  pendingConnection?: {
    expiresAt: string;
    pages: {
      pageId: string;
      pageName: string;
    }[];
  } | null;
  showOauthDebugPanel: boolean;
}) {
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const apiBaseUrl = getApiBaseUrl();
  const callbackUrl = `${apiBaseUrl}/integrations/facebook/webhook`;
  const facebookOauthStartUrl = getFacebookOauthStartUrl(eventSlug);
  const connectMessage =
    connectStatus === "connected"
      ? "Facebook Page connected."
      : connectStatus === "select-page"
        ? "Choose which Facebook Page should be used for this event."
        : connectStatus === "no-pages"
          ? "Meta login succeeded, but no manageable Facebook Pages were returned."
          : connectStatus === "oauth-denied"
            ? "Facebook connection was cancelled before completion."
            : connectStatus === "connect-failed"
              ? "Facebook connection failed. Check the Meta app settings and try again."
              : null;

  return (
    <div className="space-y-0 px-1 py-1">
      {connectMessage ? (
        <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm leading-6 text-slate-700">
          {connectMessage}
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium tracking-[-0.03em] text-slate-900">
            {connection
              ? `Connected to page ${connection.pageName ?? "Unnamed Page"}`
              : "No Facebook Page connected"}
          </p>
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            href={facebookOauthStartUrl}
          >
            {connection ? "Reconnect" : "Connect"}
          </a>
        </div>
      </div>

      {pendingConnection && pendingConnection.pages.length > 0 ? (
        <Form className="mt-4 space-y-4" method="post">
          <input name="intent" type="hidden" value="select-facebook-page" />
          <AdminField label="Choose Facebook Page">
            <select className={adminInputClass} name="selectedFacebookPageId">
              {pendingConnection.pages.map((page) => (
                <option key={page.pageId} value={page.pageId}>
                  {page.pageName} ({page.pageId})
                </option>
              ))}
            </select>
          </AdminField>
          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
            Selection expires{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(pendingConnection.expiresAt))}
          </p>
          <Button type="submit">Use selected Page</Button>
        </Form>
      ) : null}

      {showOauthDebugPanel ? (
        <div className="mt-4 rounded-2xl bg-white/70 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Facebook OAuth debug
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Inspect the latest Meta OAuth result stored for this event.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {latestFacebookDebug ? (
                <StatusBadge
                  label={
                    latestFacebookDebug.consumedAt ? "CONSUMED" : "PENDING"
                  }
                  tone={latestFacebookDebug.consumedAt ? "neutral" : "warning"}
                />
              ) : (
                <StatusBadge label="NO DEBUG DATA" tone="neutral" />
              )}
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                onClick={() => setShowDebugDetails((value) => !value)}
                type="button"
              >
                {showDebugDetails
                  ? "Hide technical debug"
                  : "Show technical debug"}
              </button>
            </div>
          </div>
          {latestFacebookDebug && showDebugDetails ? (
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              <p>
                Last OAuth attempt{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(latestFacebookDebug.createdAt))}
                {latestFacebookDebug.consumedAt
                  ? `, consumed ${new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(latestFacebookDebug.consumedAt))}`
                  : ""}
                .
              </p>
              <p>
                Stored state: <code>{latestFacebookDebug.state}</code>
              </p>
              <p>
                Selection expires{" "}
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(latestFacebookDebug.expiresAt))}
                .
              </p>
              <p>Returned Pages: {latestFacebookDebug.pages.length}</p>
              <p>
                Discovered assets across user and business endpoints:{" "}
                {latestFacebookDebug.rawPages.length}
              </p>
              {latestFacebookDebug.discoveryLogs.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Endpoint logs
                  </p>
                  <ul className="space-y-2">
                    {latestFacebookDebug.discoveryLogs.map((entry, index) => (
                      <li
                        className="font-mono text-xs leading-6 text-slate-900"
                        key={`${entry.endpoint}-${entry.businessId ?? "root"}-${entry.pageId ?? "none"}-${index}`}
                      >
                        <div>
                          {entry.endpoint} | count: {entry.count ?? "n/a"}
                          {entry.error ? ` | error: ${entry.error}` : ""}
                        </div>
                        {entry.businessName || entry.businessId ? (
                          <div className="text-slate-600">
                            business:{" "}
                            {entry.businessName ?? "Unnamed business"} (
                            {entry.businessId ?? "no-id"})
                          </div>
                        ) : null}
                        {entry.pageName || entry.pageId ? (
                          <div className="text-slate-600">
                            page: {entry.pageName ?? "Unnamed"} (
                            {entry.pageId ?? "no-id"})
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {latestFacebookDebug.pages.length > 0 ? (
                <ul className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                  {latestFacebookDebug.pages.map((page) => (
                    <li
                      className="font-mono text-xs leading-6 text-slate-900"
                      key={page.pageId}
                    >
                      {page.pageName} ({page.pageId})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                  Meta returned no manageable Pages for the last OAuth attempt.
                </p>
              )}
            {latestFacebookDebug.rawPages.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Discovered assets and token lookups
                </p>
                <ul className="space-y-2">
                  {latestFacebookDebug.rawPages.map((page, index) => (
                    <li key={`${page.pageId ?? "unknown"}-${index}`} className="font-mono text-xs leading-6 text-slate-900">
                      <div>
                        {(page.pageName ?? "Unnamed")} ({page.pageId ?? "no-id"}) | access token returned:{" "}
                        {page.accessTokenReturned ? "yes" : "no"}
                      </div>
                      <div className="text-slate-600">
                        source: {page.sources.map((source) => formatFacebookSourceLabel(source)).join(", ") || "unknown"}
                      </div>
                      {page.businesses.length > 0 ? (
                        <div className="text-slate-600">
                          businesses:{" "}
                          {page.businesses
                            .map((business) => {
                              const label = business.businessName ?? "Unnamed business";
                              const roles = business.permittedRoles.length > 0
                                ? ` [roles: ${business.permittedRoles.join(", ")}]`
                                : "";

                              return `${label} (${business.businessId ?? "no-id"})${roles}`;
                            })
                            .join(" | ")}
                        </div>
                      ) : null}
                      {page.tasks.length > 0 ? (
                        <div className="text-slate-600">
                          page tasks: {page.tasks.join(", ")}
                        </div>
                      ) : null}
                      {page.permittedTasks.length > 0 ? (
                        <div className="text-slate-600">
                          business permitted tasks: {page.permittedTasks.join(", ")}
                        </div>
                      ) : null}
                      {page.tokenLookupAttempted ? (
                        <div className="text-slate-600">
                          page token lookup attempted
                          {page.tokenLookupError
                            ? `, error: ${page.tokenLookupError}`
                            : ""}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {latestFacebookDebug.discoveryWarnings.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Discovery warnings
                </p>
                <ul className="space-y-2 text-xs leading-6 text-amber-900">
                  {latestFacebookDebug.discoveryWarnings.map((warning, index) => (
                    <li key={`${warning.stage}-${warning.businessId ?? "none"}-${index}`}>
                      {warning.stage}
                      {warning.businessName || warning.businessId
                        ? ` | ${warning.businessName ?? "Unnamed business"} (${warning.businessId ?? "no-id"})`
                        : ""}
                      {" | "}
                      {warning.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {latestFacebookDebug.droppedPages.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
                  Dropped assets
                </p>
                <ul className="space-y-2 text-xs leading-6 text-amber-900">
                  {latestFacebookDebug.droppedPages.map((page, index) => (
                    <li key={`${page.pageId ?? "unknown"}-${page.reason}-${index}`}>
                      {(page.pageName ?? "Unnamed")} ({page.pageId ?? "no-id"}) | dropped because {page.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : latestFacebookDebug ? (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 text-sm leading-6 text-slate-700">
            Technical OAuth details are hidden by default. Open them only when you need to troubleshoot Page discovery or Meta permissions.
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-700">
            No Facebook OAuth debug information has been recorded for this
            event yet. Run the connect flow once to capture what Meta returns.
          </p>
        )}
        </div>
      ) : null}

    </div>
  );
}

function InstagramOnboardingCard({
  connectStatus,
  connection,
  eventSlug,
  latestInstagramDebug,
  pendingConnection,
}: {
  connectStatus?: string | null;
  connection?: {
    hasAccessToken: boolean;
    instagramAccountId: string;
    instagramUsername: string | null;
    pageId: string;
    pageName: string | null;
    tokenHint: string | null;
    tokenExpiresAt?: string | null;
    updatedAt: string;
  } | null;
  eventSlug: string;
  latestInstagramDebug?: {
    accounts: {
      instagramAccountId: string;
      instagramUsername: string | null;
      pageId: string;
      pageName: string;
    }[];
    consumedAt: string | null;
    createdAt: string;
    expiresAt: string;
    rawPages: {
      error: string | null;
      hasInstagramAccount: boolean;
      hasPageAccessToken: boolean;
      instagramAccountId: string | null;
      instagramUsername: string | null;
      pageId: string | null;
      pageName: string | null;
      tokenHint: string | null;
    }[];
    state: string;
    warnings: string[];
  } | null;
  pendingConnection?: {
    accounts: {
      instagramAccountId: string;
      instagramUsername: string | null;
      pageId: string;
      pageName: string;
    }[];
    expiresAt: string;
  } | null;
}) {
  const [showDebugDetails, setShowDebugDetails] = useState(false);
  const instagramOauthStartUrl = getInstagramOauthStartUrl(eventSlug);
  const connectMessage =
    connectStatus === "connected"
      ? "Instagram professional account connected."
      : connectStatus === "select-account"
        ? "Choose which Instagram professional account should be used for this event."
        : connectStatus === "no-accounts"
          ? "Meta login succeeded, but no Instagram professional accounts were returned."
          : connectStatus === "oauth-denied"
            ? "Instagram connection was cancelled before completion."
            : connectStatus === "connect-failed"
              ? "Instagram connection failed. Check the Meta app settings and try again."
              : null;

  return (
    <div className="space-y-0 px-1 py-1">
      {connectMessage ? (
        <p className="rounded-2xl bg-white/70 px-4 py-3 text-sm leading-6 text-slate-700">
          {connectMessage}
        </p>
      ) : null}

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium tracking-[-0.03em] text-slate-900">
              {connection
                ? `Connected to @${connection.instagramUsername ?? "unknown"}`
                : "No Instagram professional account connected"}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
              Requires a professional account linked to a Facebook Page. The account owner must be public for comment webhooks.
            </p>
          </div>
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            href={instagramOauthStartUrl}
          >
            {connection ? "Reconnect" : "Connect"}
          </a>
        </div>
      </div>

      {pendingConnection && pendingConnection.accounts.length > 0 ? (
        <Form className="mt-4 space-y-4" method="post">
          <input name="intent" type="hidden" value="select-instagram-account" />
          <AdminField label="Choose Instagram professional account">
            <select className={adminInputClass} name="selectedInstagramAccountId">
              {pendingConnection.accounts.map((account) => (
                <option
                  key={account.instagramAccountId}
                  value={account.instagramAccountId}
                >
                  @{account.instagramUsername ?? "unknown"} via {account.pageName} (
                  {account.instagramAccountId})
                </option>
              ))}
            </select>
          </AdminField>
          <Button type="submit">Use selected account</Button>
        </Form>
      ) : null}

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Instagram limitations
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Meta only delivers real comment webhooks when the app is Live and the
              `comments` field has Advanced Access.
            </p>
          </div>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
            onClick={() => setShowDebugDetails((value) => !value)}
            type="button"
          >
            {showDebugDetails ? "Hide technical debug" : "Show technical debug"}
          </button>
        </div>
        {showDebugDetails ? (
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
            {connection ? (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                <p>
                  Connected account: <code>{connection.instagramAccountId}</code>
                </p>
                <p>
                  Linked page: <code>{connection.pageId}</code>
                </p>
                {connection.tokenHint ? <p>Token hint: {connection.tokenHint}</p> : null}
              </div>
            ) : null}
            {latestInstagramDebug ? (
              <>
                <p>
                  Last OAuth attempt{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(latestInstagramDebug.createdAt))}
                  .
                </p>
                {latestInstagramDebug.accounts.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                    {latestInstagramDebug.accounts.map((account) => (
                      <li
                        className="font-mono text-xs leading-6 text-slate-900"
                        key={account.instagramAccountId}
                      >
                        @{account.instagramUsername ?? "unknown"} ({account.instagramAccountId}) via{" "}
                        {account.pageName} ({account.pageId})
                      </li>
                    ))}
                  </ul>
                ) : null}
                {latestInstagramDebug.warnings.length > 0 ? (
                  <ul className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
                    {latestInstagramDebug.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-slate-700">
                No Instagram OAuth debug information has been recorded for this event yet.
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function readOptional(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();

  return value ? value : undefined;
}

function parseTaskForm(formData: FormData) {
  const type = formData.get("type")?.toString() ?? "SOCIAL_FOLLOW";
  const platform = formData.get("platform")?.toString() ?? "NONE";
  const isSocialCommentPreset = type === "SOCIAL_COMMENT" && (
    platform === "FACEBOOK" || platform === "INSTAGRAM"
  );
  const primaryLabel = readOptional(formData, "primaryLabel");
  const configJson = {
    primaryUrl: readOptional(formData, "primaryUrl"),
    secondaryUrl: readOptional(formData, "secondaryUrl"),
    primaryLabel: isSocialCommentPreset
      ? (primaryLabel ??
        (platform === "INSTAGRAM" ? "Open Instagram post" : "Open Facebook post"))
      : primaryLabel,
    secondaryLabel: readOptional(formData, "secondaryLabel"),
    proofHint: readOptional(formData, "proofHint"),
    requiredPrefix: readOptional(formData, "requiredPrefix"),
    commentInstructions: readOptional(formData, "commentInstructions"),
    facebookPostId: readOptional(formData, "facebookPostId"),
    instagramMediaId: readOptional(formData, "instagramMediaId"),
    requireVerificationCode: isSocialCommentPreset
      ? true
      : formData.get("hasRequireVerificationCode")
        ? formData.get("requireVerificationCode") === "on"
        : undefined,
    autoVerify: isSocialCommentPreset
      ? true
      : formData.get("hasAutoVerify")
        ? formData.get("autoVerify") === "on"
        : undefined,
  };
  const compactConfig = Object.fromEntries(
    Object.entries(configJson).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );

  return {
    title: formData.get("title")?.toString() ?? "",
    description: formData.get("description")?.toString() ?? "",
    type,
    platform,
    points: Number(formData.get("points")?.toString() ?? 0),
    sortOrder: Number(formData.get("sortOrder")?.toString() ?? 0),
    isActive: formData.get("isActive") === "on",
    requiresVerification: formData.get("requiresVerification") === "on",
    verificationType: formData.get("verificationType")?.toString() ?? "NONE",
    facebookSourcePageId: readOptional(formData, "facebookSourcePageId"),
    instagramSourceAccountId: readOptional(formData, "instagramSourceAccountId"),
    configJson: Object.keys(compactConfig).length > 0 ? compactConfig : null,
  };
}

function extractActionErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const candidate = error as {
      data?: { message?: unknown };
      message?: unknown;
    };

    if (typeof candidate.data?.message === "string") {
      return candidate.data.message;
    }

    if (typeof candidate.message === "string") {
      return candidate.message;
    }
  }

  return "Could not save task. Check the Facebook connection and required fields.";
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [
      event,
      facebookCommentDebug,
      facebookPostOptions,
      latestFacebookDebug,
      pendingFacebookConnection,
      instagramCommentDebug,
      instagramMediaOptions,
      latestInstagramDebug,
      pendingInstagramConnection,
    ] =
      await Promise.all([
        fetchAdminEvent(params.eventSlug, request),
        fetchAdminFacebookCommentDebug(params.eventSlug, request),
        fetchAdminFacebookPostOptions(params.eventSlug, request),
        fetchAdminFacebookConnectionDebug(params.eventSlug, request),
        fetchAdminFacebookPendingConnection(params.eventSlug, request),
        fetchAdminInstagramCommentDebug(params.eventSlug, request),
        fetchAdminInstagramMediaOptions(params.eventSlug, request),
        fetchAdminInstagramConnectionDebug(params.eventSlug, request),
        fetchAdminInstagramPendingConnection(params.eventSlug, request),
      ]);
    const url = new URL(request.url);

    return {
      connectStatus: url.searchParams.get("facebookConnect"),
      event,
      facebookCommentDebug,
      facebookPostOptions,
      instagramCommentDebug,
      instagramConnectStatus: url.searchParams.get("instagramConnect"),
      instagramMediaOptions,
      latestInstagramDebug,
      latestFacebookDebug,
      pendingFacebookConnection,
      pendingInstagramConnection,
    };
  } catch {
    return redirect("/admin");
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const formKey = formData.get("formKey")?.toString() ?? "";
  const intent = formData.get("intent")?.toString() ?? "";
  const taskId = formData.get("taskId")?.toString() ?? "";

  try {
    if (intent === "create") {
      await createAdminTask(params.eventSlug, parseTaskForm(formData), request);

      return {
        formKey,
        success: "Task created.",
      };
    }

    if (intent === "set-active" && taskId) {
      await updateAdminTask(
        params.eventSlug,
        taskId,
        {
          isActive: true,
        },
        request,
      );

      return {
        formKey,
        success: "Task activated.",
      };
    }

    if (intent === "set-inactive" && taskId) {
      await updateAdminTask(
        params.eventSlug,
        taskId,
        {
          isActive: false,
        },
        request,
      );

      return {
        formKey,
        success: "Task set to inactive.",
      };
    }

    if (intent === "disable" && taskId) {
      await disableAdminTask(params.eventSlug, taskId, request);

      return {
        formKey,
        success: "Task disabled.",
      };
    }

    if (intent === "update" && taskId) {
      await updateAdminTask(
        params.eventSlug,
        taskId,
        parseTaskForm(formData),
        request,
      );

      return {
        formKey,
        success: "Task saved.",
      };
    }

    if (intent === "select-facebook-page") {
      await selectAdminFacebookConnection(
        params.eventSlug,
        {
          pageId: formData.get("selectedFacebookPageId")?.toString() ?? "",
        },
        request,
      );

      return {
        formKey,
        success: "Facebook Page connected.",
      };
    }

    if (intent === "select-instagram-account") {
      await selectAdminInstagramConnection(
        params.eventSlug,
        {
          instagramAccountId:
            formData.get("selectedInstagramAccountId")?.toString() ?? "",
        },
        request,
      );

      return {
        formKey,
        success: "Instagram professional account connected.",
      };
    }
  } catch (error) {
    return {
      formKey,
      error: extractActionErrorMessage(error),
    };
  }

  return {
    formKey,
    error: "Choose a task action.",
  };
}

function TaskForm({
  actionData,
  buttonLabel,
  eventTasks,
  facebookPostOptions,
  instagramMediaOptions,
  intent,
  task,
}: {
  actionData?: { error?: string; formKey?: string; success?: string } | null;
  buttonLabel: string;
  eventTasks: Array<{
    configJson?: {
      requiredPrefix?: string;
    } | null;
    id: string;
    title: string;
  }>;
  facebookPostOptions: {
    error: string | null;
    selectedPageId: string | null;
    pages: Array<{
      pageId: string;
      pageName: string;
      posts: {
        createdAt: string | null;
        messagePreview: string;
        permalinkUrl: string | null;
        postId: string;
      }[];
    }>;
  };
  instagramMediaOptions: {
    account: {
      instagramAccountId: string;
      instagramUsername: string | null;
      pageId: string;
      pageName: string | null;
    } | null;
    error: string | null;
    media: Array<{
      captionPreview: string;
      mediaId: string;
      mediaType: string | null;
      permalink: string | null;
      timestamp: string | null;
    }>;
  };
  intent: "create" | "update";
  task?: {
    id: string;
    title: string;
    description: string;
    type: string;
    platform: string;
    points: number;
    sortOrder: number;
    isActive: boolean;
    requiresVerification: boolean;
    verificationType: string;
    configJson?: {
      primaryUrl?: string;
      secondaryUrl?: string;
      primaryLabel?: string;
      secondaryLabel?: string;
      proofHint?: string;
      requiredPrefix?: string;
      commentInstructions?: string;
      facebookPostId?: string;
      instagramMediaId?: string;
      requireVerificationCode?: boolean;
      autoVerify?: boolean;
    } | null;
  };
}) {
  const navigation = useNavigation();
  const initialType = task?.type ?? "SOCIAL_FOLLOW";
  const formKey = task ? `task-${task.id}` : "task-create";
  const initialGuide = getTaskTypeGuide(initialType);
  const [selectedType, setSelectedType] = useState(initialType);
  const currentGuide = getTaskTypeGuide(selectedType);
  const [selectedPlatform, setSelectedPlatform] = useState(
    task?.platform ?? initialGuide.defaultPlatform,
  );
  const [selectedVerificationType, setSelectedVerificationType] = useState(
    task?.verificationType ?? initialGuide.defaultVerificationType,
  );
  const [requiresVerification, setRequiresVerification] = useState(
    task?.requiresVerification ?? initialGuide.defaultRequiresVerification,
  );

  const availablePlatforms = currentGuide.lockPlatform
    ? [currentGuide.defaultPlatform]
    : currentGuide.allowedPlatforms;
  const availableVerificationTypes = currentGuide.lockVerification
    ? [currentGuide.defaultVerificationType]
    : currentGuide.allowedVerificationTypes;
  const isSocialCommentPreset =
    selectedType === "SOCIAL_COMMENT" &&
    (selectedPlatform === "FACEBOOK" || selectedPlatform === "INSTAGRAM");
  const isFacebookCommentPreset =
    isSocialCommentPreset && selectedPlatform === "FACEBOOK";
  const isInstagramCommentPreset =
    isSocialCommentPreset && selectedPlatform === "INSTAGRAM";
  const shouldSimplifySocialCommentForm = isSocialCommentPreset;
  const availableFacebookPages = facebookPostOptions.pages;
  const initialSourcePageId =
    task?.configJson?.facebookPostId && availableFacebookPages.some((page) =>
      page.posts.some((post) => post.postId === task.configJson?.facebookPostId),
    )
      ? (availableFacebookPages.find((page) =>
          page.posts.some((post) => post.postId === task.configJson?.facebookPostId),
        )?.pageId ?? facebookPostOptions.selectedPageId ?? "")
      : (facebookPostOptions.selectedPageId ?? availableFacebookPages[0]?.pageId ?? "");
  const [selectedFacebookPageId, setSelectedFacebookPageId] = useState(
    initialSourcePageId,
  );
  const selectedFacebookPage =
    availableFacebookPages.find((page) => page.pageId === selectedFacebookPageId) ??
    null;
  const initialSavedPostId = task?.configJson?.facebookPostId ?? "";
  const matchingSavedPost =
    selectedFacebookPage?.posts.find((post) => post.postId === initialSavedPostId) ??
    null;
  const [manualFacebookPostEntry, setManualFacebookPostEntry] = useState(
    initialSavedPostId.length > 0 && !matchingSavedPost,
  );
  const [selectedFacebookPostId, setSelectedFacebookPostId] = useState(
    matchingSavedPost?.postId ?? "",
  );
  const [facebookPostIdValue, setFacebookPostIdValue] = useState(
    matchingSavedPost?.postId ?? initialSavedPostId,
  );
  const [facebookPrimaryUrlValue, setFacebookPrimaryUrlValue] = useState(
    matchingSavedPost?.permalinkUrl ?? task?.configJson?.primaryUrl ?? "",
  );
  const selectedFacebookPost =
    selectedFacebookPostId.length > 0
      ? selectedFacebookPage?.posts.find((post) => post.postId === selectedFacebookPostId) ??
        null
      : null;
  const instagramAccount = instagramMediaOptions.account;
  const availableInstagramMedia = instagramMediaOptions.media;
  const initialSavedInstagramMediaId = task?.configJson?.instagramMediaId ?? "";
  const matchingSavedInstagramMedia =
    availableInstagramMedia.find((media) => media.mediaId === initialSavedInstagramMediaId) ??
    null;
  const [manualInstagramMediaEntry, setManualInstagramMediaEntry] = useState(
    initialSavedInstagramMediaId.length > 0 && !matchingSavedInstagramMedia,
  );
  const [selectedInstagramMediaId, setSelectedInstagramMediaId] = useState(
    matchingSavedInstagramMedia?.mediaId ?? "",
  );
  const [instagramMediaIdValue, setInstagramMediaIdValue] = useState(
    matchingSavedInstagramMedia?.mediaId ?? initialSavedInstagramMediaId,
  );
  const [instagramPrimaryUrlValue, setInstagramPrimaryUrlValue] = useState(
    matchingSavedInstagramMedia?.permalink ?? task?.configJson?.primaryUrl ?? "",
  );
  const existingCommentPrefixes = eventTasks
    .filter((entry) => entry.id !== task?.id)
    .map((entry) => entry.configJson?.requiredPrefix)
    .filter((prefix): prefix is string => Boolean(prefix));
  const defaultRequiredPrefix =
    task?.configJson?.requiredPrefix ??
    buildUniqueCommentPrefix({
      existingPrefixes: existingCommentPrefixes,
      fallback: "COMMENT",
      title: task?.title ?? "Comment on our post",
    });
  const activeFormKey = navigation.formData?.get("formKey")?.toString() ?? "";
  const isSubmittingThisForm =
    activeFormKey === formKey && navigation.state !== "idle";
  const isCurrentFormResult =
    actionData?.formKey === formKey && (actionData.success || actionData.error);

  function handleTypeChange(nextType: string) {
    const nextGuide = getTaskTypeGuide(nextType);

    setSelectedType(nextType);
    setSelectedPlatform(nextGuide.defaultPlatform);
    setSelectedVerificationType(nextGuide.defaultVerificationType);
    setRequiresVerification(nextGuide.defaultRequiresVerification);
  }

  function handleFacebookPostSelect(nextPostId: string) {
    setSelectedFacebookPostId(nextPostId);

    const selectedPost =
      selectedFacebookPage?.posts.find((post) => post.postId === nextPostId) ??
      null;

    setFacebookPostIdValue(selectedPost?.postId ?? "");
    setFacebookPrimaryUrlValue(selectedPost?.permalinkUrl ?? "");
  }

  function handleFacebookPageSelect(nextPageId: string) {
    setSelectedFacebookPageId(nextPageId);

    const nextPage =
      availableFacebookPages.find((page) => page.pageId === nextPageId) ?? null;

    setSelectedFacebookPostId("");
    setFacebookPostIdValue("");
    setFacebookPrimaryUrlValue("");

    if (nextPage?.posts[0] && !manualFacebookPostEntry) {
      setSelectedFacebookPostId(nextPage.posts[0].postId);
      setFacebookPostIdValue(nextPage.posts[0].postId);
      setFacebookPrimaryUrlValue(nextPage.posts[0].permalinkUrl ?? "");
    }
  }

  function handleInstagramMediaSelect(nextMediaId: string) {
    setSelectedInstagramMediaId(nextMediaId);

    const selectedMedia =
      availableInstagramMedia.find((media) => media.mediaId === nextMediaId) ??
      null;

    setInstagramMediaIdValue(selectedMedia?.mediaId ?? "");
    setInstagramPrimaryUrlValue(selectedMedia?.permalink ?? "");
  }

  return (
    <Form className="space-y-4" method="post">
      <input name="formKey" type="hidden" value={formKey} />
      <input name="intent" type="hidden" value={intent} />
      {task ? <input name="taskId" type="hidden" value={task.id} /> : null}
      {shouldSimplifySocialCommentForm ? (
        <>
          <input
            name="isActive"
            type="hidden"
            value={task?.isActive === false ? "" : "on"}
          />
          <input name="sortOrder" type="hidden" value={task?.sortOrder ?? 0} />
          <input name="hasRequireVerificationCode" type="hidden" value="1" />
          <input name="requireVerificationCode" type="hidden" value="on" />
          <input name="hasAutoVerify" type="hidden" value="1" />
          <input name="autoVerify" type="hidden" value="on" />
        </>
      ) : null}
      <div className="rounded-2xl bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          1. Choose task type
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <AdminField label="Task type">
            <select
              className={adminInputClass}
              name="type"
              onChange={(event) => handleTypeChange(event.target.value)}
              value={selectedType}
            >
              {taskTypes.map((type) => (
                <option key={type} value={type}>
                  {formatEnumLabel(type)}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Platform">
            {currentGuide.lockPlatform ? (
              <>
                <input name="platform" type="hidden" value={selectedPlatform} />
                <input
                  className={adminInputClass}
                  disabled
                  value={formatEnumLabel(selectedPlatform)}
                />
              </>
            ) : (
              <select
                className={adminInputClass}
                name="platform"
                onChange={(event) => setSelectedPlatform(event.target.value)}
                value={selectedPlatform}
              >
                {availablePlatforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {formatEnumLabel(platform)}
                  </option>
                ))}
              </select>
            )}
          </AdminField>
          <AdminField label="Points">
            <input
              className={adminInputClass}
              defaultValue={task?.points ?? 1}
              min={0}
              name="points"
              type="number"
            />
          </AdminField>
        </div>
        {!shouldSimplifySocialCommentForm ? (
          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4 text-sm leading-6 text-slate-700">
            <p className="font-semibold text-slate-900">
              {formatEnumLabel(selectedType)}
            </p>
            <p className="mt-2">{currentGuide.summary}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
              {currentGuide.detailHint}
            </p>
          </div>
        ) : null}
      </div>

      {!shouldSimplifySocialCommentForm ? (
        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            2. Review setup
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <AdminField label="Verification type">
              {currentGuide.lockVerification ? (
                <>
                  <input
                    name="verificationType"
                    type="hidden"
                    value={selectedVerificationType}
                  />
                  <input
                    className={adminInputClass}
                    disabled
                    value={formatEnumLabel(selectedVerificationType)}
                  />
                </>
              ) : (
                <select
                  className={adminInputClass}
                  name="verificationType"
                  onChange={(event) =>
                    setSelectedVerificationType(event.target.value)
                  }
                  value={selectedVerificationType}
                >
                  {availableVerificationTypes.map((type) => (
                    <option key={type} value={type}>
                      {formatEnumLabel(type)}
                    </option>
                  ))}
                </select>
              )}
            </AdminField>
            <label className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
              <input
                defaultChecked={task?.isActive ?? true}
                name="isActive"
                type="checkbox"
              />
              Active
            </label>
            <label className="flex items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
              {currentGuide.lockRequiresVerification ? (
                <input
                  name="requiresVerification"
                  type="hidden"
                  value={requiresVerification ? "on" : ""}
                />
              ) : null}
              <input
                checked={requiresVerification}
                disabled={currentGuide.lockRequiresVerification}
                name={
                  currentGuide.lockRequiresVerification
                    ? undefined
                    : "requiresVerification"
                }
                onChange={(event) =>
                  setRequiresVerification(event.target.checked)
                }
                type="checkbox"
              />
              Requires verification
            </label>
          </div>
        </div>
      ) : (
        <>
          <input
            name="requiresVerification"
            type="hidden"
            value={requiresVerification ? "on" : ""}
          />
          <input
            name="verificationType"
            type="hidden"
            value={selectedVerificationType}
          />
        </>
      )}

      <div className="rounded-2xl bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          3. Participant-facing copy
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <AdminField label="Title">
            <input
              className={adminInputClass}
              defaultValue={task?.title ?? ""}
              name="title"
              required
            />
          </AdminField>
          {!shouldSimplifySocialCommentForm ? (
            <AdminField label="Sort order">
              <input
                className={adminInputClass}
                defaultValue={task?.sortOrder ?? 0}
                name="sortOrder"
                type="number"
              />
            </AdminField>
          ) : null}
        </div>
        <div className="mt-3">
          <AdminField label="Description">
            <textarea
              className={adminInputClass}
              defaultValue={task?.description ?? ""}
              name="description"
              required
              rows={3}
            />
          </AdminField>
        </div>
      </div>

      {!shouldSimplifySocialCommentForm ? (
        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            4. Fill task details
          </p>
          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">What to set up</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              {currentGuide.setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {!currentGuide.showFacebookCommentFields ? (
          <AdminField label="Primary URL">
            <input
              className={adminInputClass}
              defaultValue={task?.configJson?.primaryUrl ?? ""}
              name="primaryUrl"
              type="url"
            />
          </AdminField>
        ) : null}
        <AdminField
          label={shouldSimplifySocialCommentForm ? "Button text" : "Primary label"}
        >
            <input
              className={adminInputClass}
              defaultValue={
                shouldSimplifySocialCommentForm
                  ? (task?.configJson?.primaryLabel ??
                    (isInstagramCommentPreset
                      ? "Open Instagram post"
                      : "Open Facebook post"))
                  : (task?.configJson?.primaryLabel ?? "")
              }
              name="primaryLabel"
            />
        </AdminField>
        {currentGuide.showSecondaryLinkFields ? (
          <>
            <AdminField label="Secondary URL">
              <input
                className={adminInputClass}
                defaultValue={task?.configJson?.secondaryUrl ?? ""}
                name="secondaryUrl"
                type="url"
              />
            </AdminField>
            <AdminField label="Secondary label">
              <input
                className={adminInputClass}
                defaultValue={task?.configJson?.secondaryLabel ?? ""}
                name="secondaryLabel"
              />
            </AdminField>
          </>
        ) : null}
      </div>
      {currentGuide.showProofHint ? (
        <AdminField label="Proof hint">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.proofHint ?? ""}
            name="proofHint"
          />
        </AdminField>
      ) : null}
      {currentGuide.showFacebookCommentFields ? (
        <>
          {isFacebookCommentPreset ? (
            <>
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Source Page and post
                </p>
                {facebookPostOptions.error ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {facebookPostOptions.error}
                  </p>
                ) : null}
                {availableFacebookPages.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <AdminField label="Choose source Facebook Page">
                      <select
                        className={adminInputClass}
                        name="facebookSourcePageId"
                        onChange={(event) => handleFacebookPageSelect(event.target.value)}
                        required
                        value={selectedFacebookPageId}
                      >
                        <option value="">Select a Facebook Page</option>
                        {availableFacebookPages.map((page) => (
                          <option key={page.pageId} value={page.pageId}>
                            {page.pageName} ({page.pageId})
                          </option>
                        ))}
                      </select>
                    </AdminField>
                  </div>
                ) : null}
                {!manualFacebookPostEntry && (selectedFacebookPage?.posts.length ?? 0) > 0 ? (
                  <div className="mt-4 space-y-3">
                    <AdminField label="Choose recent post from connected Page">
                      <select
                        className={adminInputClass}
                        onChange={(event) => handleFacebookPostSelect(event.target.value)}
                        required
                        value={selectedFacebookPostId}
                      >
                        <option value="">Select a Facebook post</option>
                        {selectedFacebookPage?.posts.map((post) => (
                          <option key={post.postId} value={post.postId}>
                            {post.createdAt
                              ? `${new Intl.DateTimeFormat("en", {
                                  dateStyle: "medium",
                                }).format(new Date(post.createdAt))} - `
                              : ""}
                            {post.messagePreview}
                          </option>
                        ))}
                      </select>
                    </AdminField>
                    {selectedFacebookPost ? (
                      <div className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                        <p>
                          Graph post ID: <code>{selectedFacebookPost.postId}</code>
                        </p>
                        {selectedFacebookPost.permalinkUrl ? (
                          <p>
                            Permalink:{" "}
                            <a
                              className="underline"
                              href={selectedFacebookPost.permalinkUrl}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {selectedFacebookPost.permalinkUrl}
                            </a>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <button
                      className="text-sm font-semibold text-slate-900 underline"
                      onClick={() => setManualFacebookPostEntry(true)}
                      type="button"
                    >
                      Enter post details manually instead
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {(selectedFacebookPage?.posts.length ?? 0) > 0 ? (
                      <button
                        className="text-sm font-semibold text-slate-900 underline"
                        onClick={() => {
                          setManualFacebookPostEntry(false);

                          if (!selectedFacebookPostId && selectedFacebookPage?.posts[0]) {
                            handleFacebookPostSelect(selectedFacebookPage.posts[0].postId);
                          }
                        }}
                        type="button"
                      >
                        Choose from recent connected Page posts instead
                      </button>
                    ) : null}
                    {selectedFacebookPage && selectedFacebookPage.posts.length === 0 ? (
                      <p className="text-sm leading-6 text-slate-700">
                        No published posts were returned for this Page.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="Required prefix">
                  <input
                    className={adminInputClass}
                    defaultValue={defaultRequiredPrefix}
                    name="requiredPrefix"
                    placeholder="QIANLU"
                    required
                  />
                </AdminField>
                <AdminField label="Facebook post ID">
                  <input
                    className={adminInputClass}
                    name="facebookPostId"
                    onChange={(event) => setFacebookPostIdValue(event.target.value)}
                    placeholder="pageid_postid"
                    readOnly={!manualFacebookPostEntry}
                    required
                    value={facebookPostIdValue}
                  />
                </AdminField>
              </div>
              <AdminField label="Facebook post URL">
                <input
                  className={adminInputClass}
                  name="primaryUrl"
                  onChange={(event) => setFacebookPrimaryUrlValue(event.target.value)}
                  readOnly={!manualFacebookPostEntry}
                  required
                  type="url"
                  value={facebookPrimaryUrlValue}
                />
              </AdminField>
            </>
          ) : isInstagramCommentPreset ? (
            <>
              <input
                name="instagramSourceAccountId"
                type="hidden"
                value={instagramAccount?.instagramAccountId ?? ""}
              />
              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
                <p className="text-sm font-semibold text-slate-900">
                  Connected Instagram account and media
                </p>
                {instagramMediaOptions.error ? (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {instagramMediaOptions.error}
                  </p>
                ) : null}
                {instagramAccount ? (
                  <div className="mt-4 rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                    <p>
                      Account: <code>@{instagramAccount.instagramUsername ?? "unknown"}</code>
                    </p>
                    <p>
                      Linked Page: <code>{instagramAccount.pageName ?? "Unnamed Page"}</code>
                    </p>
                  </div>
                ) : null}
                {!manualInstagramMediaEntry && availableInstagramMedia.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <AdminField label="Choose recent media from connected account">
                      <select
                        className={adminInputClass}
                        onChange={(event) => handleInstagramMediaSelect(event.target.value)}
                        required
                        value={selectedInstagramMediaId}
                      >
                        <option value="">Select Instagram media</option>
                        {availableInstagramMedia.map((media) => (
                          <option key={media.mediaId} value={media.mediaId}>
                            {media.timestamp
                              ? `${new Intl.DateTimeFormat("en", {
                                  dateStyle: "medium",
                                }).format(new Date(media.timestamp))} - `
                              : ""}
                            {media.captionPreview}
                          </option>
                        ))}
                      </select>
                    </AdminField>
                    <button
                      className="text-sm font-semibold text-slate-900 underline"
                      onClick={() => setManualInstagramMediaEntry(true)}
                      type="button"
                    >
                      Enter media details manually instead
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {availableInstagramMedia.length > 0 ? (
                      <button
                        className="text-sm font-semibold text-slate-900 underline"
                        onClick={() => {
                          setManualInstagramMediaEntry(false);

                          if (!selectedInstagramMediaId && availableInstagramMedia[0]) {
                            handleInstagramMediaSelect(availableInstagramMedia[0].mediaId);
                          }
                        }}
                        type="button"
                      >
                        Choose from recent connected media instead
                      </button>
                    ) : null}
                    {instagramAccount && availableInstagramMedia.length === 0 ? (
                      <p className="text-sm leading-6 text-slate-700">
                        No recent media was returned for this Instagram account.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="Required prefix">
                  <input
                    className={adminInputClass}
                    defaultValue={defaultRequiredPrefix}
                    name="requiredPrefix"
                    placeholder="QIANLU"
                    required
                  />
                </AdminField>
                <AdminField label="Instagram media ID">
                  <input
                    className={adminInputClass}
                    name="instagramMediaId"
                    onChange={(event) => setInstagramMediaIdValue(event.target.value)}
                    placeholder="1789..."
                    readOnly={!manualInstagramMediaEntry}
                    required
                    value={instagramMediaIdValue}
                  />
                </AdminField>
              </div>
              <AdminField label="Instagram post URL">
                <input
                  className={adminInputClass}
                  name="primaryUrl"
                  onChange={(event) => setInstagramPrimaryUrlValue(event.target.value)}
                  readOnly={!manualInstagramMediaEntry}
                  required
                  type="url"
                  value={instagramPrimaryUrlValue}
                />
              </AdminField>
            </>
          ) : null}
        </>
      ) : null}
      {currentGuide.showCommentAutomationOptions && !shouldSimplifySocialCommentForm ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
            <input name="hasRequireVerificationCode" type="hidden" value="1" />
            <input
              defaultChecked={task?.configJson?.requireVerificationCode ?? true}
              name="requireVerificationCode"
              type="checkbox"
            />
            Include participant verification code
          </label>
          <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
            <input name="hasAutoVerify" type="hidden" value="1" />
            <input
              defaultChecked={task?.configJson?.autoVerify ?? true}
              name="autoVerify"
              type="checkbox"
            />
            Auto verify via webhook/API
          </label>
        </div>
      ) : null}
      {isCurrentFormResult && actionData?.error ? (
        <p className="rounded-lg bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">
          {actionData.error}
        </p>
      ) : null}
      {isCurrentFormResult && actionData?.success ? (
        <p className="rounded-lg bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-800">
          {actionData.success}
        </p>
      ) : null}
      <Button disabled={isSubmittingThisForm} type="submit">
        {isSubmittingThisForm
          ? intent === "create"
            ? "Creating..."
            : "Saving..."
          : buttonLabel}
      </Button>
    </Form>
  );
}

function FacebookCommentTaskDebugPanel({
  taskDebug,
}: {
  taskDebug?: {
    autoVerify: boolean;
    connectedPageId: string | null;
    connectedPageMatchesPostIdPrefix: boolean | null;
    connectedPageName: string | null;
    facebookPostId: string;
    liveCommentCount: number;
    liveComments: {
      commentId: string;
      createdAt: string | null;
      matchingAttemptIds: string[];
      matchingExpectedCommentTexts: string[];
      matchingVerificationCodes: string[];
      message: string | null;
      normalizedMessage: string | null;
      parentId: string | null;
    }[];
    liveLookupError: string | null;
    pendingAttemptCount: number;
    primaryUrl: string | null;
    recentAttempts: {
      awaitingAutoVerificationAt: string | null;
      expectedCommentText: string | null;
      matchedCommentId: string | null;
      matchedCommentText: string | null;
      participantEmail: string | null;
      participantName: string | null;
      participantSessionId: string;
      source: string | null;
      status: string;
      taskAttemptId: string;
      updatedAt: string;
      verificationCode: string;
      verifiedAutomaticallyAt: string | null;
    }[];
    recentComments: {
      commentText: string | null;
      createdAt: string;
      externalCommentId: string;
      externalPostId: string | null;
      matched: boolean;
      participantSessionId: string | null;
      participantVerificationCode: string | null;
      processedAt: string | null;
      taskAttemptId: string | null;
    }[];
    requiredPrefix: string;
    requireVerificationCode: boolean;
    taskId: string;
    taskTitle: string;
    unmatchedCommentCount: number;
    verifiedAttemptCount: number;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!taskDebug) {
    return null;
  }

  const mismatchTone =
    taskDebug.connectedPageMatchesPostIdPrefix === false
      ? "bg-rose-50 border-rose-200 text-rose-900"
      : "bg-[var(--color-surface-strong)] border-[var(--color-border)] text-slate-700";

  return (
    <div className="mt-4 rounded-2xl bg-white/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Facebook verification debug
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Inspect recent waiting attempts, matched comments, and post wiring
            for this Facebook comment task.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          {isOpen ? "Hide verification debug" : "Show verification debug"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Waiting attempts
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.pendingAttemptCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Verified attempts
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.verifiedAttemptCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Unmatched comments
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.unmatchedCommentCount}
          </p>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          <div className={`rounded-2xl border p-4 text-sm leading-6 ${mismatchTone}`}>
            <p>
              Connected Page:{" "}
              <span className="font-semibold text-slate-950">
                {taskDebug.connectedPageName ?? "Not connected"}
              </span>
              {taskDebug.connectedPageId
                ? ` (${taskDebug.connectedPageId})`
                : ""}
            </p>
            <p>
              Facebook post ID:{" "}
              <code>{taskDebug.facebookPostId}</code>
            </p>
            <p>
              Required prefix: <code>{taskDebug.requiredPrefix}</code>
            </p>
            {taskDebug.primaryUrl ? (
              <p>
                Task post URL:{" "}
                <a className="underline" href={taskDebug.primaryUrl} rel="noreferrer" target="_blank">
                  {taskDebug.primaryUrl}
                </a>
              </p>
            ) : null}
            <p>
              Expected connected Page match:{" "}
              {taskDebug.connectedPageMatchesPostIdPrefix === null
                ? "Could not compare"
                : taskDebug.connectedPageMatchesPostIdPrefix
                  ? "yes"
                  : "no, the post ID prefix does not match the connected Page"}
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              How to read this
            </p>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <li>1. If waiting attempts go up but recent comments stay empty, the webhook is not arriving and the Graph lookup is not finding the comment.</li>
              <li>2. Use the live Graph comments section below to see the exact comments Meta currently returns for the post and whether each one matches a pending attempt.</li>
              <li>3. If the connected Page does not match the post ID prefix, the task is watching the wrong Page/post combination.</li>
            </ol>
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                Live Graph comments on this post
              </p>
              <StatusBadge
                label={`${taskDebug.liveCommentCount} COMMENTS`}
                tone="neutral"
              />
            </div>
            {taskDebug.liveLookupError ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {taskDebug.liveLookupError}
              </p>
            ) : null}
            {taskDebug.liveComments.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.liveComments.map((comment) => (
                  <li
                    key={comment.commentId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={
                          comment.matchingAttemptIds.length > 0
                            ? "MATCHES ATTEMPT"
                            : "NO MATCH"
                        }
                        tone={
                          comment.matchingAttemptIds.length > 0
                            ? "verified"
                            : "warning"
                        }
                      />
                      <span className="font-mono text-xs text-slate-500">
                        {comment.commentId}
                      </span>
                    </div>
                    <p className="mt-2">
                      Comment text: <code>{comment.message ?? "missing message"}</code>
                    </p>
                    <p>
                      Normalized text:{" "}
                      <code>{comment.normalizedMessage ?? "not available"}</code>
                    </p>
                    {comment.createdAt ? (
                      <p>
                        Created:{" "}
                        {new Intl.DateTimeFormat("en", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(comment.createdAt))}
                      </p>
                    ) : null}
                    {comment.matchingVerificationCodes.length > 0 ? (
                      <p>
                        Matching verification codes:{" "}
                        <code>{comment.matchingVerificationCodes.join(", ")}</code>
                      </p>
                    ) : null}
                    {comment.matchingExpectedCommentTexts.length > 0 ? (
                      <p>
                        Matching expected comments:{" "}
                        <code>{comment.matchingExpectedCommentTexts.join(" | ")}</code>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No comments were returned from the Graph API for this post.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Recent waiting and verified attempts
            </p>
            {taskDebug.recentAttempts.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.recentAttempts.map((attempt) => (
                  <li
                    key={attempt.taskAttemptId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={attempt.status}
                        tone={
                          attempt.status === "VERIFIED"
                            ? "verified"
                            : "warning"
                        }
                      />
                      <span className="font-semibold text-slate-900">
                        {attempt.participantName ?? "Anonymous participant"}
                      </span>
                      <span className="text-slate-500">
                        {attempt.verificationCode}
                      </span>
                    </div>
                    <p className="mt-2">
                      Expected comment:{" "}
                      <code>{attempt.expectedCommentText ?? "not stored"}</code>
                    </p>
                    {attempt.matchedCommentText ? (
                      <p>
                        Matched comment: <code>{attempt.matchedCommentText}</code>
                      </p>
                    ) : null}
                    <p>
                      Awaiting since:{" "}
                      {attempt.awaitingAutoVerificationAt
                        ? new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(attempt.awaitingAutoVerificationAt))
                        : "not recorded"}
                    </p>
                    <p>
                      Last updated:{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(attempt.updatedAt))}
                    </p>
                    {attempt.source ? <p>Verification source: {attempt.source}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No recent waiting or verified attempts have been recorded for
                this task yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Recent webhook and comment records
            </p>
            {taskDebug.recentComments.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.recentComments.map((comment) => (
                  <li
                    key={comment.externalCommentId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={comment.matched ? "MATCHED" : "UNMATCHED"}
                        tone={comment.matched ? "verified" : "warning"}
                      />
                      <span className="font-mono text-xs text-slate-500">
                        {comment.externalCommentId}
                      </span>
                    </div>
                    <p className="mt-2">
                      Comment text:{" "}
                      <code>{comment.commentText ?? "missing from webhook payload"}</code>
                    </p>
                    <p>
                      Post ID: <code>{comment.externalPostId ?? "unknown"}</code>
                    </p>
                    <p>
                      Received:{" "}
                      {new Intl.DateTimeFormat("en", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(comment.createdAt))}
                    </p>
                    {comment.participantVerificationCode ? (
                      <p>
                        Linked participant code:{" "}
                        <code>{comment.participantVerificationCode}</code>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No webhook/comment records have been stored for this post yet.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 text-sm leading-6 text-slate-700">
          Open this only when you need to debug why a Facebook comment task is
          staying in the waiting state.
        </div>
      )}
    </div>
  );
}

function InstagramCommentTaskDebugPanel({
  taskDebug,
}: {
  taskDebug?: {
    autoVerify: boolean;
    connectedInstagramAccountId: string | null;
    connectedInstagramUsername: string | null;
    connectedPageId: string | null;
    connectedPageName: string | null;
    instagramMediaId: string;
    liveCommentCount: number;
    liveComments: {
      commentId: string;
      createdAt: string | null;
      matchingAttemptIds: string[];
      matchingExpectedCommentTexts: string[];
      matchingVerificationCodes: string[];
      message: string | null;
      normalizedMessage: string | null;
      parentId: string | null;
      username: string | null;
    }[];
    liveLookupError: string | null;
    pendingAttemptCount: number;
    primaryUrl: string | null;
    recentAttempts: {
      awaitingAutoVerificationAt: string | null;
      expectedCommentText: string | null;
      matchedCommentId: string | null;
      matchedCommentText: string | null;
      participantEmail: string | null;
      participantName: string | null;
      participantSessionId: string;
      source: string | null;
      status: string;
      taskAttemptId: string;
      updatedAt: string;
      verificationCode: string;
      verifiedAutomaticallyAt: string | null;
    }[];
    recentComments: {
      commentText: string | null;
      createdAt: string;
      externalCommentId: string;
      externalPostId: string | null;
      matched: boolean;
      participantSessionId: string | null;
      participantVerificationCode: string | null;
      processedAt: string | null;
      taskAttemptId: string | null;
    }[];
    requiredPrefix: string;
    requireVerificationCode: boolean;
    taskId: string;
    taskTitle: string;
    unmatchedCommentCount: number;
    verifiedAttemptCount: number;
  };
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!taskDebug) {
    return null;
  }

  return (
    <div className="mt-4 rounded-2xl bg-white/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Instagram verification debug
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            Inspect recent waiting attempts, matched comments, and media wiring
            for this Instagram comment task.
          </p>
        </div>
        <button
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50"
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          {isOpen ? "Hide verification debug" : "Show verification debug"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Waiting attempts
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.pendingAttemptCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Verified attempts
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.verifiedAttemptCount}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Unmatched comments
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">
            {taskDebug.unmatchedCommentCount}
          </p>
        </div>
      </div>

      {isOpen ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4 text-sm leading-6 text-slate-700">
            <p>
              Connected account:{" "}
              <span className="font-semibold text-slate-950">
                @{taskDebug.connectedInstagramUsername ?? "unknown"}
              </span>
              {taskDebug.connectedInstagramAccountId
                ? ` (${taskDebug.connectedInstagramAccountId})`
                : ""}
            </p>
            <p>
              Linked Page:{" "}
              <code>{taskDebug.connectedPageName ?? "Not connected"}</code>
            </p>
            <p>
              Instagram media ID: <code>{taskDebug.instagramMediaId}</code>
            </p>
            <p>
              Required prefix: <code>{taskDebug.requiredPrefix}</code>
            </p>
            {taskDebug.primaryUrl ? (
              <p>
                Task media URL:{" "}
                <a className="underline" href={taskDebug.primaryUrl} rel="noreferrer" target="_blank">
                  {taskDebug.primaryUrl}
                </a>
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Live Graph comments on this media
            </p>
            {taskDebug.liveLookupError ? (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {taskDebug.liveLookupError}
              </p>
            ) : null}
            {taskDebug.liveComments.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.liveComments.map((comment) => (
                  <li
                    key={comment.commentId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={
                          comment.matchingAttemptIds.length > 0
                            ? "MATCHES ATTEMPT"
                            : "NO MATCH"
                        }
                        tone={
                          comment.matchingAttemptIds.length > 0
                            ? "verified"
                            : "warning"
                        }
                      />
                      <span className="font-mono text-xs text-slate-500">
                        {comment.commentId}
                      </span>
                    </div>
                    <p className="mt-2">
                      Comment text: <code>{comment.message ?? "missing message"}</code>
                    </p>
                    {comment.username ? <p>Username: @{comment.username}</p> : null}
                    <p>
                      Normalized text:{" "}
                      <code>{comment.normalizedMessage ?? "not available"}</code>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No comments were returned from the Graph API for this media.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Recent waiting and verified attempts
            </p>
            {taskDebug.recentAttempts.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.recentAttempts.map((attempt) => (
                  <li
                    key={attempt.taskAttemptId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={attempt.status}
                        tone={
                          attempt.status === "VERIFIED"
                            ? "verified"
                            : "warning"
                        }
                      />
                      <span className="font-semibold text-slate-900">
                        {attempt.participantName ?? "Anonymous participant"}
                      </span>
                      <span className="text-slate-500">
                        {attempt.verificationCode}
                      </span>
                    </div>
                    <p className="mt-2">
                      Expected comment:{" "}
                      <code>{attempt.expectedCommentText ?? "not stored"}</code>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No recent waiting or verified attempts have been recorded for
                this task yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Recent webhook and comment records
            </p>
            {taskDebug.recentComments.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {taskDebug.recentComments.map((comment) => (
                  <li
                    key={comment.externalCommentId}
                    className="rounded-xl bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        label={comment.matched ? "MATCHED" : "UNMATCHED"}
                        tone={comment.matched ? "verified" : "warning"}
                      />
                      <span className="font-mono text-xs text-slate-500">
                        {comment.externalCommentId}
                      </span>
                    </div>
                    <p className="mt-2">
                      Comment text:{" "}
                      <code>{comment.commentText ?? "missing from webhook payload"}</code>
                    </p>
                    <p>
                      Media ID: <code>{comment.externalPostId ?? "unknown"}</code>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-slate-700">
                No webhook/comment records have been stored for this media yet.
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 text-sm leading-6 text-slate-700">
          Open this only when you need to debug why an Instagram comment task is
          staying in the waiting state.
        </div>
      )}
    </div>
  );
}

function SidebarSectionHeader({
  detail,
  label,
}: {
  detail: string;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 pb-2 pt-5 text-[0.72rem] uppercase tracking-[0.16em] text-slate-500 first:pt-0">
      <span>{label}</span>
      <span>{detail}</span>
    </div>
  );
}

function SidebarTaskRow({
  detail,
  href,
  isSelected,
  onClick,
  title,
}: {
  detail: string;
  href: string;
  isSelected: boolean;
  onClick?: () => void;
  title: string;
}) {
  return (
    <a
      aria-current={isSelected ? "location" : undefined}
      className="admin-task-sidebar-row"
      data-selected={isSelected ? "true" : "false"}
      href={href}
      onClick={onClick}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="admin-task-sidebar-icon" />
        <span className="truncate text-[0.97rem] tracking-[-0.03em]">
          {title}
        </span>
      </span>
      <span className="ml-3 shrink-0 text-sm font-normal tracking-[-0.02em] text-slate-500">
        {detail}
      </span>
    </a>
  );
}

function ToolbarIcon({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div
      aria-label={title}
      className="admin-task-toolbar-group"
      role="img"
      title={title}
    >
      <div className="admin-task-toolbar-icon-button">{children}</div>
    </div>
  );
}

function TaskPaneToolbar({
  task,
  showOauthDebugPanel,
  onToggleOauthDebugPanel,
}: {
  task: Route.ComponentProps["loaderData"]["event"]["tasks"][number];
  showOauthDebugPanel: boolean;
  onToggleOauthDebugPanel: () => void;
}) {
  const subtitle = `${formatEnumLabel(task.type)} • ${formatTaskPointsLabel(task.points)}`;
  const autoVerifyEnabled =
    task.type === "SOCIAL_COMMENT" &&
    (task.platform === "FACEBOOK" || task.platform === "INSTAGRAM") &&
    task.configJson?.autoVerify;
  const nextActiveIntent = task.isActive ? "set-inactive" : "set-active";
  const nextActiveLabel = task.isActive ? "Set inactive" : "Set active";
  const nextActiveNote = task.isActive
    ? "Hide this task from the live event flow."
    : "Show this task in the live event flow.";
  const oauthDebugLabel = showOauthDebugPanel
    ? "Hide technical debug"
    : "Show technical debug";
  const oauthDebugNote = "Toggle the Facebook OAuth debug panel.";

  return (
    <div className="admin-task-toolbar mb-5">
      <div className="admin-task-toolbar-bar">
        <div className="admin-task-toolbar-cluster">
          <div className="admin-task-toolbar-group">
            <div className="admin-task-toolbar-pill">
              <span
                className="admin-task-toolbar-pill-dot"
                data-tone={task.isActive ? "active" : "inactive"}
              />
              <span className="admin-task-toolbar-pill-label">
                {task.isActive ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          {autoVerifyEnabled ? (
            <ToolbarIcon title="Auto verify enabled">
              <svg
                aria-hidden="true"
                className="size-[1.1rem]"
                fill="none"
                viewBox="0 0 20 20"
              >
                <path
                  d="M10 2.8L11.8 7.1L16.2 8.9L11.8 10.7L10 15L8.2 10.7L3.8 8.9L8.2 7.1L10 2.8Z"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            </ToolbarIcon>
          ) : null}
        </div>

        <div className="admin-task-toolbar-title">
          <h2>{task.title}</h2>
          <p>{subtitle}</p>
        </div>

        <div className="admin-task-toolbar-cluster">
          <details className="admin-task-toolbar-menu">
            <summary
              aria-label="Task actions"
              className="admin-task-toolbar-group admin-task-toolbar-icon-button cursor-pointer"
              title="Task actions"
            >
              <svg
                aria-hidden="true"
                className="size-[1.15rem]"
                fill="none"
                viewBox="0 0 20 20"
              >
                <circle cx="5" cy="10" fill="currentColor" r="1.3" />
                <circle cx="10" cy="10" fill="currentColor" r="1.3" />
                <circle cx="15" cy="10" fill="currentColor" r="1.3" />
              </svg>
            </summary>
            <div className="admin-task-toolbar-menu-panel">
              <p className="admin-task-toolbar-menu-label">Task actions</p>
              <Form method="post">
                <input name="intent" type="hidden" value={nextActiveIntent} />
                <input name="taskId" type="hidden" value={task.id} />
                <button className="admin-task-toolbar-menu-row" type="submit">
                  <span className="admin-task-toolbar-menu-row-main">
                    <span className="admin-task-toolbar-menu-row-icon">
                      <svg
                        aria-hidden="true"
                        className="size-[1.1rem]"
                        fill="none"
                        viewBox="0 0 20 20"
                      >
                        <rect
                          height="10"
                          rx="5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          width="16"
                          x="2"
                          y="5"
                        />
                        <circle
                          cx={task.isActive ? "13" : "7"}
                          cy="10"
                          fill="currentColor"
                          r="2.3"
                        />
                      </svg>
                    </span>
                    <span>
                      <span className="admin-task-toolbar-menu-row-title">
                        {nextActiveLabel}
                      </span>
                      <span className="admin-task-toolbar-menu-row-note">
                        {nextActiveNote}
                      </span>
                    </span>
                  </span>
                  {task.isActive ? (
                    <svg
                      aria-hidden="true"
                      className="size-[1.05rem] text-emerald-600"
                      fill="none"
                      viewBox="0 0 20 20"
                    >
                      <path
                        d="M5.7 10.4L8.5 13.2L14.4 7.4"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  ) : null}
                </button>
              </Form>
              <button
                className="admin-task-toolbar-menu-row"
                onClick={(event) => {
                  onToggleOauthDebugPanel();
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
                type="button"
              >
                <span className="admin-task-toolbar-menu-row-main">
                  <span className="admin-task-toolbar-menu-row-icon">
                    <svg
                      aria-hidden="true"
                      className="size-[1.1rem]"
                      fill="none"
                      viewBox="0 0 20 20"
                    >
                      <path
                        d="M10 4.2C6.1 4.2 2.85 6.58 1.7 10C2.85 13.42 6.1 15.8 10 15.8C13.9 15.8 17.15 13.42 18.3 10C17.15 6.58 13.9 4.2 10 4.2Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                      <circle
                        cx="10"
                        cy="10"
                        r="2.3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                      />
                    </svg>
                  </span>
                  <span>
                    <span className="admin-task-toolbar-menu-row-title">
                      {oauthDebugLabel}
                    </span>
                    <span className="admin-task-toolbar-menu-row-note">
                      {oauthDebugNote}
                    </span>
                  </span>
                </span>
                {showOauthDebugPanel ? (
                  <svg
                    aria-hidden="true"
                    className="size-[1.05rem] text-emerald-600"
                    fill="none"
                    viewBox="0 0 20 20"
                  >
                    <path
                      d="M5.7 10.4L8.5 13.2L14.4 7.4"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.8"
                    />
                  </svg>
                ) : null}
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export default function AdminEventTasks({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const {
    connectStatus,
    event,
    facebookCommentDebug,
    facebookPostOptions,
    instagramCommentDebug,
    instagramConnectStatus,
    instagramMediaOptions,
    latestInstagramDebug,
    latestFacebookDebug,
    pendingFacebookConnection,
    pendingInstagramConnection,
  } =
    loaderData;
  const defaultTaskAnchor =
    event.tasks.length > 0 ? `task-${event.tasks[0].id}` : "task-create";
  const [taskFilter, setTaskFilter] = useState("");
  const [selectedAnchor, setSelectedAnchor] = useState(defaultTaskAnchor);
  const [showOauthDebugPanel, setShowOauthDebugPanel] = useState(false);
  const normalizedTaskFilter = normalizeTaskFilter(taskFilter);
  const filteredTasks = event.tasks.filter((task) =>
    taskMatchesFilter(task, normalizedTaskFilter),
  );
  const activeTasks = filteredTasks.filter((task) => task.isActive);
  const inactiveTasks = filteredTasks.filter((task) => !task.isActive);
  const selectedTaskId = selectedAnchor.startsWith("task-")
    ? selectedAnchor.slice("task-".length)
    : null;
  const selectedTask =
    selectedTaskId && selectedTaskId !== "create"
      ? event.tasks.find((task) => task.id === selectedTaskId) ?? null
      : null;

  useEffect(() => {
    function syncSelectedAnchor() {
      setSelectedAnchor(
        window.location.hash
          ? decodeURIComponent(window.location.hash.slice(1))
          : defaultTaskAnchor,
      );
    }

    syncSelectedAnchor();
    window.addEventListener("hashchange", syncSelectedAnchor);

    return () => window.removeEventListener("hashchange", syncSelectedAnchor);
  }, [defaultTaskAnchor]);

  return (
    <AdminShell
      description="Create and edit task configuration used by the participant flow."
      eventSlug={event.slug}
      title={`${event.name} tasks`}
    >
      <div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="admin-task-sidebar rounded-[1.75rem] p-4">
            <div className="flex items-center justify-between gap-3 pb-5">
              <div>
                <div>
                  <p className="text-lg font-medium tracking-[-0.04em]">Tasks</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    {event.tasks.length} configured
                  </p>
                </div>
              </div>
              <a
                aria-label="Create task"
                className="inline-flex size-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white/80 text-xl font-medium text-[var(--color-primary)] shadow-[0_12px_28px_-18px_rgba(0,0,0,0.35)] transition-transform duration-150 hover:-translate-y-0.5"
                href="#task-create"
                onClick={() => setSelectedAnchor("task-create")}
              >
                +
              </a>
            </div>

            <label className="admin-task-sidebar-search flex items-center gap-3 rounded-full px-4 py-3">
              <svg
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-500"
                fill="none"
                viewBox="0 0 16 16"
              >
                <circle
                  cx="7"
                  cy="7"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M10.5 10.5L13.5 13.5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                />
              </svg>
              <input
                className="min-w-0 flex-1 bg-transparent text-[0.97rem] tracking-[-0.03em] text-slate-700 outline-none placeholder:text-slate-500"
                onChange={(event) => setTaskFilter(event.target.value)}
                placeholder="Search tasks"
                type="search"
                value={taskFilter}
              />
            </label>

            <div className="mt-5 max-h-[calc(100vh-11rem)] overflow-y-auto pr-1">
              {activeTasks.length > 0 ? (
                <div>
                  <SidebarSectionHeader
                    detail={`${activeTasks.length}`}
                    label="Active tasks"
                  />
                  <div className="space-y-1">
                    {activeTasks.map((task) => (
                      <SidebarTaskRow
                        detail={formatTaskPointsLabel(task.points)}
                        href={`#task-${task.id}`}
                        isSelected={selectedAnchor === `task-${task.id}`}
                        key={task.id}
                        onClick={() => setSelectedAnchor(`task-${task.id}`)}
                        title={task.title}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {inactiveTasks.length > 0 ? (
                <div>
                  <SidebarSectionHeader
                    detail={`${inactiveTasks.length}`}
                    label="Inactive tasks"
                  />
                  <div className="space-y-1">
                    {inactiveTasks.map((task) => (
                      <SidebarTaskRow
                        detail={formatTaskPointsLabel(task.points)}
                        href={`#task-${task.id}`}
                        isSelected={selectedAnchor === `task-${task.id}`}
                        key={task.id}
                        onClick={() => setSelectedAnchor(`task-${task.id}`)}
                        title={task.title}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {filteredTasks.length === 0 ? (
                <div className="px-3 pt-5 text-sm leading-6 text-slate-600">
                  No tasks match the current search.
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          {actionData && "error" in actionData ? (
            <p className="rounded-lg bg-rose-100 px-4 py-3 text-sm font-medium text-rose-800">
              {actionData.error}
            </p>
          ) : null}
          {actionData && "success" in actionData ? (
            <p className="rounded-lg bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-800">
              {actionData.success}
            </p>
          ) : null}

          {selectedTask ? (
            <TaskPaneToolbar
              onToggleOauthDebugPanel={() =>
                setShowOauthDebugPanel((value) => !value)
              }
              showOauthDebugPanel={showOauthDebugPanel}
              task={selectedTask}
            />
          ) : null}

          <FacebookOnboardingCard
            connectStatus={connectStatus}
            connection={event.facebookConnection}
            eventSlug={event.slug}
            latestFacebookDebug={latestFacebookDebug}
            pendingConnection={pendingFacebookConnection}
            showOauthDebugPanel={showOauthDebugPanel}
          />
          <InstagramOnboardingCard
            connectStatus={instagramConnectStatus}
            connection={event.instagramConnection}
            eventSlug={event.slug}
            latestInstagramDebug={latestInstagramDebug}
            pendingConnection={pendingInstagramConnection}
          />

          {selectedAnchor === "task-create" ? (
            <section className="scroll-mt-6" id="task-create">
              <div className="px-1 py-1">
                <h2 className="font-display text-xl font-semibold">
                  Create task
                </h2>
                <div className="mt-4">
                  <TaskForm
                    actionData={actionData}
                    buttonLabel="Create task"
                    eventTasks={event.tasks}
                    facebookPostOptions={facebookPostOptions}
                    instagramMediaOptions={instagramMediaOptions}
                    intent="create"
                    key="task-create"
                  />
                </div>
              </div>
            </section>
          ) : selectedTask ? (
            <section
              className="scroll-mt-6"
              id={`task-${selectedTask.id}`}
            >
              <div className="px-1 py-1">
                <TaskForm
                  actionData={actionData}
                  buttonLabel="Save task"
                  eventTasks={event.tasks}
                  facebookPostOptions={facebookPostOptions}
                  instagramMediaOptions={instagramMediaOptions}
                  intent="update"
                  key={selectedTask.id}
                  task={selectedTask}
                />
                {selectedTask.type === "SOCIAL_COMMENT" &&
                selectedTask.platform === "FACEBOOK" &&
                selectedTask.configJson?.autoVerify ? (
                  <FacebookCommentTaskDebugPanel
                    taskDebug={facebookCommentDebug.tasks.find(
                      (entry) => entry.taskId === selectedTask.id,
                    )}
                  />
                ) : selectedTask.type === "SOCIAL_COMMENT" &&
                  selectedTask.platform === "INSTAGRAM" &&
                  selectedTask.configJson?.autoVerify ? (
                  <InstagramCommentTaskDebugPanel
                    taskDebug={instagramCommentDebug.tasks.find(
                      (entry) => entry.taskId === selectedTask.id,
                    )}
                  />
                ) : null}
              </div>
            </section>
          ) : event.tasks.length > 0 ? (
            <section className="scroll-mt-6">
              <div className="px-1 py-1">
                <p className="text-sm text-slate-700">
                  Select a task from the sidebar to edit it.
                </p>
              </div>
            </section>
          ) : (
            <section className="scroll-mt-6" id="task-create">
              <div className="px-1 py-1">
                <h2 className="font-display text-xl font-semibold">
                  Create task
                </h2>
                <div className="mt-4">
                  <TaskForm
                    actionData={actionData}
                    buttonLabel="Create task"
                    eventTasks={event.tasks}
                    facebookPostOptions={facebookPostOptions}
                    instagramMediaOptions={instagramMediaOptions}
                    intent="create"
                    key="task-create-empty"
                  />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
