import { Button, StatusBadge } from "@qianlu-events/ui";
import { Form, redirect } from "react-router";

import type { Route } from "./+types/admin-event-tasks";
import {
  createAdminTask,
  disableAdminTask,
  fetchAdminEvent,
  fetchAdminFacebookConnectionDebug,
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
    droppedPages: {
      pageId: string | null;
      pageName: string | null;
      reason: "missing_access_token" | "missing_id" | "missing_name";
    }[];
    expiresAt: string;
    pages: {
      pageId: string;
      pageName: string;
    }[];
    rawPages: {
      accessTokenReturned: boolean;
      pageId: string | null;
      pageName: string | null;
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
          {latestFacebookDebug ? (
            <StatusBadge
              label={latestFacebookDebug.consumedAt ? "CONSUMED" : "PENDING"}
              tone={latestFacebookDebug.consumedAt ? "neutral" : "warning"}
            />
          ) : (
            <StatusBadge label="NO DEBUG DATA" tone="neutral" />
          )}
        </div>
        {latestFacebookDebug ? (
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
            <p>Raw assets from Meta: {latestFacebookDebug.rawPages.length}</p>
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
                  Raw assets returned by Meta
                </p>
                <ul className="space-y-2">
                  {latestFacebookDebug.rawPages.map((page, index) => (
                    <li key={`${page.pageId ?? "unknown"}-${index}`} className="font-mono text-xs leading-6 text-slate-900">
                      {(page.pageName ?? "Unnamed")} ({page.pageId ?? "no-id"}) | access token returned:{" "}
                      {page.accessTokenReturned ? "yes" : "no"}
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
        ) : (
          <p className="mt-4 text-sm leading-6 text-slate-700">
            No Facebook OAuth debug information has been recorded for this
            event yet. Run the connect flow once to capture what Meta returns.
          </p>
        )}
      </div>

      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          3. Meta app checklist
        </p>
        <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
          <li>1. Open your Meta app in Meta for Developers and add the Webhooks product.</li>
          <li>2. In `Facebook Login for Business`, use the `User access token` configuration with `business_management`, `pages_show_list`, `pages_read_engagement`, and `pages_manage_metadata`.</li>
          <li>3. Choose the `Page` object and subscribe your app to it.</li>
          <li>4. Paste the callback URL shown above and verify it with the same verify token value.</li>
          <li>5. Subscribe the Page webhook to the `feed` field so Page comment events reach this app.</li>
          <li>6. Use the `Connect Facebook Page` button above and sign in with the organizer&apos;s Meta account.</li>
          <li>7. Copy the target Facebook post URL and its Graph API post ID for the task below.</li>
        </ol>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            4. Task values to fill in
          </p>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
            <li>1. Type: `SOCIAL_COMMENT`</li>
            <li>2. Platform: `FACEBOOK`</li>
            <li>3. Verification type: `AUTOMATIC`</li>
            <li>4. Primary URL: the public Facebook post URL</li>
            <li>5. Required prefix: usually `QIANLU`</li>
            <li>6. Facebook post ID: for example `123456789012345_987654321098765`</li>
            <li>7. Leave `Include participant verification code` turned on</li>
            <li>8. Leave `Auto verify via webhook/API` turned on</li>
          </ol>
        </div>

        <div className="rounded-2xl bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            5. What participants will do
          </p>
          <ol className="mt-3 space-y-3 text-sm leading-6 text-slate-700">
            <li>1. Open the Facebook post from the task.</li>
            <li>2. Comment the exact text shown in the task, for example `QIANLU AB12CD`.</li>
            <li>3. Tap `I&apos;ve commented` in the participant flow.</li>
            <li>4. The task moves to waiting for Facebook verification and then verifies automatically when the comment is matched.</li>
          </ol>
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
    configJson: Object.keys(compactConfig).length > 0 ? compactConfig : null,
  };
}

export async function loader({ params, request }: Route.LoaderArgs) {
  try {
    const [event, latestFacebookDebug, pendingFacebookConnection] =
      await Promise.all([
      fetchAdminEvent(params.eventSlug, request),
      fetchAdminFacebookConnectionDebug(params.eventSlug, request),
      fetchAdminFacebookPendingConnection(params.eventSlug, request),
      ]);
    const url = new URL(request.url);

    return {
      connectStatus: url.searchParams.get("facebookConnect"),
      event,
      latestFacebookDebug,
      pendingFacebookConnection,
    };
  } catch {
    return redirect("/admin");
  }
}

export async function action({ params, request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent")?.toString() ?? "";
  const taskId = formData.get("taskId")?.toString() ?? "";

  try {
    if (intent === "create") {
      await createAdminTask(params.eventSlug, parseTaskForm(formData), request);

      return {
        success: "Task created.",
      };
    }

    if (intent === "disable" && taskId) {
      await disableAdminTask(params.eventSlug, taskId, request);

      return {
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
        success: "Facebook Page connected.",
      };
    }
  } catch {
    return {
      error: "Could not save task. Check the Facebook connection and required fields.",
    };
  }

  return {
    error: "Choose a task action.",
  };
}

function TaskForm({
  buttonLabel,
  intent,
  task,
}: {
  buttonLabel: string;
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
  return (
    <Form className="space-y-4" method="post">
      <input name="intent" type="hidden" value={intent} />
      {task ? <input name="taskId" type="hidden" value={task.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
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
      <AdminField label="Description">
        <textarea
          className={adminInputClass}
          defaultValue={task?.description ?? ""}
          name="description"
          required
          rows={3}
        />
      </AdminField>
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminField label="Type">
          <select
            className={adminInputClass}
            defaultValue={task?.type ?? "SOCIAL_FOLLOW"}
            name="type"
          >
            {taskTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </AdminField>
        <AdminField label="Platform">
          <select
            className={adminInputClass}
            defaultValue={task?.platform ?? "NONE"}
            name="platform"
          >
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminField label="Verification type">
          <select
            className={adminInputClass}
            defaultValue={task?.verificationType ?? "VISUAL_STAFF_CHECK"}
            name="verificationType"
          >
            {verificationTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </AdminField>
        <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
          <input
            defaultChecked={task?.isActive ?? true}
            name="isActive"
            type="checkbox"
          />
          Active
        </label>
        <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2 text-sm">
          <input
            defaultChecked={task?.requiresVerification ?? true}
            name="requiresVerification"
            type="checkbox"
          />
          Requires verification
        </label>
      </div>
      <div className="rounded-2xl bg-white/70 p-4 text-sm text-slate-700">
        Use `SOCIAL_COMMENT` with platform `FACEBOOK` for automatic comment verification.
        Configure the post URL, Facebook post ID, required prefix, and enable auto verify.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Primary URL">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.primaryUrl ?? ""}
            name="primaryUrl"
            type="url"
          />
        </AdminField>
        <AdminField label="Primary label">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.primaryLabel ?? ""}
            name="primaryLabel"
          />
        </AdminField>
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
      </div>
      <AdminField label="Proof hint">
        <input
          className={adminInputClass}
          defaultValue={task?.configJson?.proofHint ?? ""}
          name="proofHint"
        />
      </AdminField>
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminField label="Required prefix">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.requiredPrefix ?? ""}
            name="requiredPrefix"
            placeholder="QIANLU"
          />
        </AdminField>
        <AdminField label="Facebook post ID">
          <input
            className={adminInputClass}
            defaultValue={task?.configJson?.facebookPostId ?? ""}
            name="facebookPostId"
            placeholder="pageid_postid"
          />
        </AdminField>
      </div>
      <AdminField label="Comment instructions">
        <textarea
          className={adminInputClass}
          defaultValue={task?.configJson?.commentInstructions ?? ""}
          name="commentInstructions"
          rows={3}
        />
      </AdminField>
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
            defaultChecked={task?.configJson?.autoVerify ?? false}
            name="autoVerify"
            type="checkbox"
          />
          Auto verify via webhook/API
        </label>
      </div>
      <Button type="submit">{buttonLabel}</Button>
    </Form>
  );
}

export default function AdminEventTasks({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const { connectStatus, event, latestFacebookDebug, pendingFacebookConnection } =
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
            <TaskForm buttonLabel="Create task" intent="create" />
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
              <TaskForm buttonLabel="Save task" intent="update" task={task} />
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
