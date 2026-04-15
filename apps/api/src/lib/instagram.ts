import { getFacebookConfig } from "@qianlu-events/config";

import { fetchFacebookManagedPages } from "./facebook.js";

const instagramApiVersion = "v22.0";

export type InstagramCommentEvent = {
  commentId: string;
  createdTime?: string | null;
  instagramAccountId?: string | null;
  message: string | null;
  parentId?: string | null;
  postId: string | null;
  rawPayload: unknown;
  username?: string | null;
  verb?: string | null;
};

type InstagramGraphComment = {
  id: string;
  media?: {
    id?: string;
  };
  parent_id?: string;
  text?: string;
  timestamp?: string;
  username?: string;
};

type InstagramGraphMedia = {
  caption?: string;
  id: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
};

type InstagramGraphPageAccount = {
  id?: string;
  instagram_business_account?: {
    id?: string;
    username?: string;
  };
  name?: string;
};

export type InstagramConnectionOption = {
  accessToken: string;
  instagramAccountId: string;
  instagramUsername: string | null;
  pageId: string;
  pageName: string;
};

export type InstagramConnectionDebugPage = {
  error: string | null;
  hasInstagramAccount: boolean;
  hasPageAccessToken: boolean;
  instagramAccountId: string | null;
  instagramUsername: string | null;
  pageId: string | null;
  pageName: string | null;
  tokenHint: string | null;
};

function buildGraphUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${instagramApiVersion}${path}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function instagramGraphRequest<T>(
  path: string,
  accessToken?: string | null,
  params?: Record<string, string>,
): Promise<T | null> {
  const url = buildGraphUrl(path, {
    ...params,
    ...(accessToken ? { access_token: accessToken } : {}),
  });
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let details = `Instagram Graph API request failed with ${response.status}.`;

    try {
      const payload = (await response.json()) as {
        error?: {
          code?: number;
          message?: string;
          type?: string;
        };
      };

      if (payload.error?.message) {
        details = `${details} ${payload.error.message}`;
      } else if (payload.error?.type || payload.error?.code) {
        details = `${details} ${payload.error?.type ?? "GraphError"} (${payload.error?.code ?? "unknown"}).`;
      }
    } catch {
      // Keep the generic error.
    }

    throw new Error(details);
  }

  return (await response.json()) as T;
}

async function instagramGraphPostRequest<T>(
  path: string,
  accessToken?: string | null,
  params?: Record<string, string>,
): Promise<T | null> {
  const url = buildGraphUrl(path, {
    ...params,
    ...(accessToken ? { access_token: accessToken } : {}),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let details = `Instagram Graph API POST request failed with ${response.status}.`;

    try {
      const payload = (await response.json()) as {
        error?: {
          code?: number;
          message?: string;
          type?: string;
        };
      };

      if (payload.error?.message) {
        details = `${details} ${payload.error.message}`;
      }
    } catch {
      // Keep the generic error.
    }

    throw new Error(details);
  }

  return (await response.json()) as T;
}

export async function fetchInstagramProfessionalAccounts(userAccessToken: string) {
  const {
    discoveryWarnings: pageWarnings,
    usablePages,
  } = await fetchFacebookManagedPages(userAccessToken);
  const rawPages: InstagramConnectionDebugPage[] = [];
  const usableAccounts: InstagramConnectionOption[] = [];
  const warnings = pageWarnings.map((warning) => warning.message);

  await Promise.all(
    usablePages.map(async (page) => {
      try {
        const response = await instagramGraphRequest<InstagramGraphPageAccount>(
          `/${encodeURIComponent(page.pageId)}`,
          page.pageAccessToken,
          {
            fields: "id,name,instagram_business_account{id,username}",
          },
        );
        const instagramAccountId = response?.instagram_business_account?.id ?? null;
        const instagramUsername =
          response?.instagram_business_account?.username ?? null;

        rawPages.push({
          error: null,
          hasInstagramAccount: Boolean(instagramAccountId),
          hasPageAccessToken: page.pageAccessToken.length > 0,
          instagramAccountId,
          instagramUsername,
          pageId: page.pageId,
          pageName: page.pageName,
          tokenHint:
            page.pageAccessToken.length >= 6
              ? page.pageAccessToken.slice(-6)
              : null,
        });

        if (!instagramAccountId) {
          return;
        }

        usableAccounts.push({
          accessToken: page.pageAccessToken,
          instagramAccountId,
          instagramUsername,
          pageId: page.pageId,
          pageName: page.pageName,
        });
      } catch (error) {
        rawPages.push({
          error: error instanceof Error ? error.message : "Could not inspect linked Instagram account.",
          hasInstagramAccount: false,
          hasPageAccessToken: page.pageAccessToken.length > 0,
          instagramAccountId: null,
          instagramUsername: null,
          pageId: page.pageId,
          pageName: page.pageName,
          tokenHint:
            page.pageAccessToken.length >= 6
              ? page.pageAccessToken.slice(-6)
              : null,
        });
      }
    }),
  );

  if (usableAccounts.length === 0) {
    warnings.push(
      "Meta did not return any Instagram professional accounts linked to the discovered Facebook Pages.",
    );
  }

  return {
    rawPages,
    usableAccounts: usableAccounts.sort((left, right) =>
      `${left.pageName}:${left.instagramUsername ?? ""}`.localeCompare(
        `${right.pageName}:${right.instagramUsername ?? ""}`,
      ),
    ),
    warnings,
  };
}

export async function subscribeInstagramAccountToWebhooks(
  accessToken: string,
  subscribedFields = ["comments"],
) {
  try {
    return await instagramGraphPostRequest<{ success?: boolean }>(
      "/me/subscribed_apps",
      accessToken,
      {
        subscribed_fields: subscribedFields.join(","),
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Meta can reject `comments` on this subscription surface even when the
    // Instagram webhook is already configured in the dashboard. In that case we
    // keep the saved connection and rely on the dashboard webhook setup plus
    // fallback reconciliation, instead of blocking task/config changes.
    if (
      message.includes("Param subscribed_fields") &&
      message.includes('got "comments"')
    ) {
      return null;
    }

    throw error;
  }
}

export function parseInstagramCommentEvents(payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    !["instagram", "page"].includes(
      typeof (payload as { object?: unknown }).object === "string"
        ? (payload as { object: string }).object
        : "",
    )
  ) {
    return [] satisfies InstagramCommentEvent[];
  }

  const entries = Array.isArray((payload as { entry?: unknown[] }).entry)
    ? (payload as { entry: unknown[] }).entry
    : [];
  const events: InstagramCommentEvent[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const instagramAccountId =
      typeof (entry as { id?: unknown }).id === "string"
        ? (entry as { id: string }).id
        : null;
    const changes = Array.isArray((entry as { changes?: unknown[] }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];

    for (const change of changes) {
      if (!change || typeof change !== "object" || Array.isArray(change)) {
        continue;
      }

      const field = (change as { field?: unknown }).field;
      const value = (change as { value?: unknown }).value;

      if (
        field !== "comments" ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        continue;
      }

      const verb = (value as { verb?: unknown }).verb;
      const commentId =
        typeof (value as { id?: unknown }).id === "string"
          ? (value as { id: string }).id
          : typeof (value as { comment_id?: unknown }).comment_id === "string"
            ? (value as { comment_id: string }).comment_id
            : null;

      if (!commentId) {
        continue;
      }

      const media =
        (value as { media?: unknown }).media &&
        typeof (value as { media?: unknown }).media === "object" &&
        !Array.isArray((value as { media?: unknown }).media)
          ? ((value as { media: { id?: unknown } }).media as { id?: unknown })
          : null;

      events.push({
        commentId,
        createdTime:
          typeof (value as { timestamp?: unknown }).timestamp === "string"
            ? (value as { timestamp: string }).timestamp
            : null,
        instagramAccountId,
        message:
          typeof (value as { text?: unknown }).text === "string"
            ? (value as { text: string }).text
            : typeof (value as { message?: unknown }).message === "string"
              ? (value as { message: string }).message
              : null,
        parentId:
          typeof (value as { parent_id?: unknown }).parent_id === "string"
            ? (value as { parent_id: string }).parent_id
            : null,
        postId:
          typeof media?.id === "string"
            ? media.id
            : typeof (value as { media_id?: unknown }).media_id === "string"
              ? (value as { media_id: string }).media_id
              : null,
        rawPayload: change,
        username:
          typeof (value as { from?: { username?: unknown } }).from?.username ===
          "string"
            ? ((value as { from: { username: string } }).from.username ?? null)
            : null,
        verb: typeof verb === "string" ? verb : null,
      });
    }
  }

  return events;
}

export async function fetchInstagramMediaComments(
  mediaId: string,
  accessToken?: string | null,
) {
  const response = await instagramGraphRequest<{
    data?: InstagramGraphComment[];
  }>(`/${encodeURIComponent(mediaId)}/comments`, accessToken, {
    fields: "id,text,timestamp,username,parent_id",
    limit: "100",
  });

  return response?.data ?? [];
}

export async function fetchInstagramAccountMedia(
  instagramAccountId: string,
  accessToken?: string | null,
) {
  const response = await instagramGraphRequest<{
    data?: InstagramGraphMedia[];
  }>(`/${encodeURIComponent(instagramAccountId)}/media`, accessToken, {
    fields: "id,caption,media_type,permalink,timestamp",
    limit: "25",
  });

  return response?.data ?? [];
}

export async function enrichInstagramCommentEvent(
  commentEvent: InstagramCommentEvent,
  accessTokens?: string[],
) {
  if (commentEvent.message && commentEvent.postId) {
    return commentEvent;
  }

  const uniqueTokens = [...new Set((accessTokens ?? []).filter(Boolean))];

  for (const accessToken of uniqueTokens) {
    try {
      const response = await instagramGraphRequest<InstagramGraphComment>(
        `/${encodeURIComponent(commentEvent.commentId)}`,
        accessToken,
        {
          fields: "id,text,timestamp,username,parent_id,media{id}",
        },
      );

      if (!response) {
        continue;
      }

      return {
        ...commentEvent,
        createdTime: response.timestamp ?? commentEvent.createdTime ?? null,
        message: response.text ?? commentEvent.message,
        parentId: response.parent_id ?? commentEvent.parentId ?? null,
        postId: response.media?.id ?? commentEvent.postId,
        username: response.username ?? commentEvent.username ?? null,
      };
    } catch {
      continue;
    }
  }

  return commentEvent;
}
