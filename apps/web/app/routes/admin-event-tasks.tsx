import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, redirect, useNavigation } from "react-router";
import { useState } from "react";

import type { Route } from "./+types/admin-event-tasks";
import {
  createAdminTask,
  disableAdminTask,
  fetchAdminEvent,
  fetchAdminFacebookCommentDebug,
  fetchAdminFacebookConnectionDebug,
  fetchAdminFacebookPostOptions,
  fetchAdminFacebookPendingConnection,
  selectAdminFacebookConnection,
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
    allowedPlatforms: ["FACEBOOK"],
    allowedVerificationTypes: ["AUTOMATIC"],
    defaultPlatform: "FACEBOOK",
    defaultRequiresVerification: true,
    defaultVerificationType: "AUTOMATIC",
    detailHint: "This preset is locked to Facebook because the current automatic verification flow only supports Facebook Page comments.",
    lockPlatform: true,
    lockRequiresVerification: true,
    lockVerification: true,
    setupSteps: [
      "Connect the Facebook Page that owns the target post.",
      "Paste the public Facebook post URL and the Graph API post ID.",
      "Choose the required prefix participants must comment, for example `QIANLU`.",
      "Keep participant verification code and auto verify turned on.",
    ],
    showCommentAutomationOptions: true,
    showFacebookCommentFields: true,
    showProofHint: false,
    showSecondaryLinkFields: false,
    summary: "Participants comment a generated code on a Facebook post and the system verifies it automatically through the webhook/API flow.",
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
    <AdminCard>
      <h2 className="font-display text-xl font-semibold">
        Facebook Comment Setup
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        Use this checklist before creating a `SOCIAL_COMMENT` Facebook task.
        The webhook must be reachable over public HTTPS, and app secrets stay
        server-side.
      </p>
      {connectMessage ? (
        <p className="mt-4 rounded-2xl bg-white/70 px-4 py-3 text-sm leading-6 text-slate-700">
          {connectMessage}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            1. Server env vars
          </p>
          <div className="mt-3 rounded-xl bg-slate-950 px-4 py-3 font-mono text-xs leading-6 text-white">
            <div>FACEBOOK_APP_ID=...</div>
            <div>FACEBOOK_LOGIN_CONFIGURATION_ID=...</div>
            <div>FACEBOOK_APP_SECRET=...</div>
            <div>FACEBOOK_VERIFY_TOKEN=...</div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            These are platform-level Meta app values for the whole backend.
            Put them in the API environment or deployment secrets. Do not put
            them in the browser or the web app env file.
          </p>
        </div>

        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            2. Meta webhook values
          </p>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Callback URL
              </p>
              <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 font-mono text-xs leading-6 text-slate-900">
                {callbackUrl}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Verify token
              </p>
              <div className="mt-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3 font-mono text-xs leading-6 text-slate-900">
                Use the same value as <code>FACEBOOK_VERIFY_TOKEN</code>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Connected Page
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {connection
                ? `${connection.pageName ?? "Unnamed Page"} (${connection.pageId})`
                : "No Facebook Page has been connected for this event yet."}
            </p>
            {connection ? (
              <p className="text-sm leading-6 text-slate-700">
                Stored access token: {connection.hasAccessToken ? `...${connection.tokenHint ?? "set"}` : "missing"}
              </p>
            ) : null}
          </div>
          {connection ? (
            <StatusBadge
              label={connection.hasAccessToken ? "CONNECTED" : "TOKEN MISSING"}
              tone={connection.hasAccessToken ? "verified" : "warning"}
            />
          ) : (
            <StatusBadge label="NOT CONNECTED" tone="neutral" />
          )}
        </div>
        {connection ? (
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
            Last updated {new Intl.DateTimeFormat("en", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(connection.updatedAt))}
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          href={facebookOauthStartUrl}
        >
          {connection ? "Reconnect Facebook Page" : "Connect Facebook Page"}
        </a>
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
                label={latestFacebookDebug.consumedAt ? "CONSUMED" : "PENDING"}
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
              {showDebugDetails ? "Hide technical debug" : "Show technical debug"}
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
            <p>Discovered assets across user and business endpoints: {latestFacebookDebug.rawPages.length}</p>
            {latestFacebookDebug.discoveryLogs.length > 0 ? (
              <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Endpoint logs
                </p>
                <ul className="space-y-2">
                  {latestFacebookDebug.discoveryLogs.map((entry, index) => (
                    <li key={`${entry.endpoint}-${entry.businessId ?? "root"}-${entry.pageId ?? "none"}-${index}`} className="font-mono text-xs leading-6 text-slate-900">
                      <div>
                        {entry.endpoint} | count: {entry.count ?? "n/a"}
                        {entry.error ? ` | error: ${entry.error}` : ""}
                      </div>
                      {entry.businessName || entry.businessId ? (
                        <div className="text-slate-600">
                          business: {entry.businessName ?? "Unnamed business"} ({entry.businessId ?? "no-id"})
                        </div>
                      ) : null}
                      {entry.pageName || entry.pageId ? (
                        <div className="text-slate-600">
                          page: {entry.pageName ?? "Unnamed"} ({entry.pageId ?? "no-id"})
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
                  <li key={page.pageId} className="font-mono text-xs leading-6 text-slate-900">
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

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          3. Quick setup flow
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">Step 1. Prepare Meta</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <li>1. Add `Webhooks` and `Facebook Login for Business` to the Meta app.</li>
              <li>2. Use a `User access token` configuration with `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, and `pages_manage_metadata`.</li>
              <li>3. If the Page is inside a business portfolio, the connecting person still needs Page-level tasks or role access.</li>
              <li>4. Subscribe the app to the `Page` object and the `feed` webhook field.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">Step 2. Connect the Page</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <li>1. Use `Connect Facebook Page` above.</li>
              <li>2. Pick the exact Page that owns the post you want to verify.</li>
              <li>3. Confirm the page shows as connected before creating the task.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">Step 3. Create the task</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <li>1. Choose `Social Comment` in the task form below.</li>
              <li>2. The form will lock `Facebook` and `Automatic` for you.</li>
              <li>3. Paste the public post URL and the Graph API post ID.</li>
              <li>4. Set the required comment prefix, for example `QIANLU`.</li>
            </ol>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">Step 4. Participant flow</p>
            <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
              <li>1. Participants open the Facebook post from the task.</li>
              <li>2. They comment the generated text, for example `QIANLU AB12CD`.</li>
              <li>3. They tap `I&apos;ve commented` and the system verifies the comment automatically.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        If verification fails, first check that the callback URL is public,
        the verify token matches exactly, the Page is connected to the Meta
        app, the task post ID matches the real Facebook post, and the comment
        text includes the participant verification code.
      </div>
    </AdminCard>
  );
}

function readOptional(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim();

  return value ? value : undefined;
}

function parseTaskForm(formData: FormData) {
  const configJson = {
    primaryUrl: readOptional(formData, "primaryUrl"),
    secondaryUrl: readOptional(formData, "secondaryUrl"),
    primaryLabel: readOptional(formData, "primaryLabel"),
    secondaryLabel: readOptional(formData, "secondaryLabel"),
    proofHint: readOptional(formData, "proofHint"),
    requiredPrefix: readOptional(formData, "requiredPrefix"),
    commentInstructions: readOptional(formData, "commentInstructions"),
    facebookPostId: readOptional(formData, "facebookPostId"),
    requireVerificationCode: formData.get("hasRequireVerificationCode")
      ? formData.get("requireVerificationCode") === "on"
      : undefined,
    autoVerify: formData.get("hasAutoVerify")
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
    type: formData.get("type")?.toString() ?? "SOCIAL_FOLLOW",
    platform: formData.get("platform")?.toString() ?? "NONE",
    points: Number(formData.get("points")?.toString() ?? 0),
    sortOrder: Number(formData.get("sortOrder")?.toString() ?? 0),
    isActive: formData.get("isActive") === "on",
    requiresVerification: formData.get("requiresVerification") === "on",
    verificationType: formData.get("verificationType")?.toString() ?? "NONE",
    facebookSourcePageId: readOptional(formData, "facebookSourcePageId"),
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
    ] =
      await Promise.all([
        fetchAdminEvent(params.eventSlug, request),
        fetchAdminFacebookCommentDebug(params.eventSlug, request),
        fetchAdminFacebookPostOptions(params.eventSlug, request),
        fetchAdminFacebookConnectionDebug(params.eventSlug, request),
        fetchAdminFacebookPendingConnection(params.eventSlug, request),
      ]);
    const url = new URL(request.url);

    return {
      connectStatus: url.searchParams.get("facebookConnect"),
      event,
      facebookCommentDebug,
      facebookPostOptions,
      latestFacebookDebug,
      pendingFacebookConnection,
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
  facebookPostOptions,
  intent,
  task,
}: {
  actionData?: { error?: string; formKey?: string; success?: string } | null;
  buttonLabel: string;
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
  const isFacebookCommentPreset =
    selectedType === "SOCIAL_COMMENT" && selectedPlatform === "FACEBOOK";
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

  return (
    <Form className="space-y-4" method="post">
      <input name="formKey" type="hidden" value={formKey} />
      <input name="intent" type="hidden" value={intent} />
      {task ? <input name="taskId" type="hidden" value={task.id} /> : null}
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
        <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4 text-sm leading-6 text-slate-700">
          <p className="font-semibold text-slate-900">{formatEnumLabel(selectedType)}</p>
          <p className="mt-2">{currentGuide.summary}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.14em] text-slate-500">
            {currentGuide.detailHint}
          </p>
        </div>
      </div>

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
              name={currentGuide.lockRequiresVerification ? undefined : "requiresVerification"}
              onChange={(event) => setRequiresVerification(event.target.checked)}
              type="checkbox"
            />
            Requires verification
          </label>
        </div>
      </div>

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
          <AdminField label="Sort order">
            <input
              className={adminInputClass}
              defaultValue={task?.sortOrder ?? 0}
              name="sortOrder"
              type="number"
            />
          </AdminField>
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
        <AdminField label="Primary label">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.primaryLabel ?? ""}
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
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">
              Facebook comment task setup
            </p>
            <p className="mt-2 text-sm leading-6 text-emerald-900">
              This task will watch a single Facebook post on the connected Page
              and automatically verify comments that match your prefix plus the
              participant code.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] p-4">
            <p className="text-sm font-semibold text-slate-900">
              Source Page and post
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Choose the Page first, then choose one of its published posts.
              Saving the task will also sync the event&apos;s connected Page to
              the selected source Page.
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
                <p className="text-sm leading-6 text-slate-700">
                  Manual entry is a fallback. The post picker is safer because
                  it stores the real Graph post ID from the connected Page.
                </p>
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
                defaultValue={task?.configJson?.requiredPrefix ?? ""}
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
          <AdminField label="Comment instructions">
            <textarea
              className={adminInputClass}
              defaultValue={task?.configJson?.commentInstructions ?? ""}
              name="commentInstructions"
              rows={3}
            />
          </AdminField>
        </>
      ) : null}
      {currentGuide.showCommentAutomationOptions ? (
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

export default function AdminEventTasks({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const {
    connectStatus,
    event,
    facebookCommentDebug,
    facebookPostOptions,
    latestFacebookDebug,
    pendingFacebookConnection,
  } =
    loaderData;

  return (
    <AdminShell
      description="Create and edit task configuration used by the participant flow."
      eventSlug={event.slug}
      title={`${event.name} tasks`}
    >
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

        <FacebookOnboardingCard
          connectStatus={connectStatus}
          connection={event.facebookConnection}
          eventSlug={event.slug}
          latestFacebookDebug={latestFacebookDebug}
          pendingConnection={pendingFacebookConnection}
        />

        <AdminCard>
          <h2 className="font-display text-xl font-semibold">Create task</h2>
          <div className="mt-4">
            <TaskForm
              actionData={actionData}
              buttonLabel="Create task"
              facebookPostOptions={facebookPostOptions}
              intent="create"
            />
          </div>
        </AdminCard>

        {event.tasks.length > 0 ? (
          event.tasks.map((task) => (
            <AdminCard key={task.id}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    {task.title}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {task.type} - {task.points} points
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge
                    label={task.isActive ? "ACTIVE" : "INACTIVE"}
                    tone={task.isActive ? "verified" : "neutral"}
                  />
                  <StatusBadge
                    label={
                      task.requiresVerification
                        ? "VERIFICATION"
                        : "AUTO COMPLETE"
                    }
                    tone={task.requiresVerification ? "warning" : "neutral"}
                  />
                  {task.type === "SOCIAL_COMMENT" &&
                  task.platform === "FACEBOOK" &&
                  task.configJson?.autoVerify ? (
                    <StatusBadge label="AUTO VERIFY" tone="verified" />
                  ) : null}
                </div>
              </div>
              <TaskForm
                actionData={actionData}
                buttonLabel="Save task"
                facebookPostOptions={facebookPostOptions}
                intent="update"
                task={task}
              />
              {task.type === "SOCIAL_COMMENT" &&
              task.platform === "FACEBOOK" &&
              task.configJson?.autoVerify ? (
                <FacebookCommentTaskDebugPanel
                  taskDebug={facebookCommentDebug.tasks.find(
                    (entry) => entry.taskId === task.id,
                  )}
                />
              ) : null}
              {task.isActive ? (
                <Form className="mt-3" method="post">
                  <input name="intent" type="hidden" value="disable" />
                  <input name="taskId" type="hidden" value={task.id} />
                  <Button tone="secondary" type="submit">
                    Disable task
                  </Button>
                </Form>
              ) : null}
            </AdminCard>
          ))
        ) : (
          <AdminCard>
            <p className="text-sm text-slate-700">
              No tasks have been configured for this event.
            </p>
          </AdminCard>
        )}
      </div>
    </AdminShell>
  );
}
