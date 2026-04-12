import { createHmac, timingSafeEqual } from "node:crypto";

import { getFacebookConfig } from "@qianlu-events/config";

const facebookApiVersion = "v22.0";
const facebookOAuthScopes = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
].join(",");

export type FacebookCommentEvent = {
  commentId: string;
  createdTime?: string | null;
  message: string | null;
  pageId?: string | null;
  parentId?: string | null;
  postId: string | null;
  rawPayload: unknown;
  verb?: string | null;
};

type FacebookGraphComment = {
  id: string;
  created_time?: string;
  message?: string;
  parent?: {
    id?: string;
  };
};

type FacebookOAuthTokenResponse = {
  access_token?: string;
};

export type FacebookManagedPage = {
  access_token?: string;
  id?: string;
  name?: string;
};

export type FacebookPageConnectionOption = {
  pageAccessToken: string;
  pageId: string;
  pageName: string;
};

export type FacebookManagedPageDrop = {
  pageId: string | null;
  pageName: string | null;
  reason: "missing_access_token" | "missing_id" | "missing_name";
};

function buildGraphUrl(path: string, params?: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${facebookApiVersion}${path}`);

  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function facebookGraphRequest<T>(
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
    throw new Error(
      `Facebook Graph API request failed with ${response.status}.`,
    );
  }

  return (await response.json()) as T;
}

export function buildFacebookOAuthUrl(args: {
  redirectUri: string;
  state: string;
}) {
  const config = getFacebookConfig();

  if (!config.appId) {
    throw new Error("FACEBOOK_APP_ID is required for Facebook OAuth.");
  }

  const url = new URL(
    `https://www.facebook.com/${facebookApiVersion}/dialog/oauth`,
  );

  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", facebookOAuthScopes);

  if (config.loginConfigurationId) {
    url.searchParams.set("config_id", config.loginConfigurationId);
  }

  return url.toString();
}

export async function exchangeFacebookCodeForUserAccessToken(args: {
  code: string;
  redirectUri: string;
}) {
  const config = getFacebookConfig();

  if (!config.appId || !config.appSecret) {
    throw new Error(
      "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET are required for Facebook OAuth.",
    );
  }

  const response = await facebookGraphRequest<FacebookOAuthTokenResponse>(
    "/oauth/access_token",
    null,
    {
      client_id: config.appId,
      client_secret: config.appSecret,
      code: args.code,
      redirect_uri: args.redirectUri,
    },
  );

  if (!response?.access_token) {
    throw new Error("Facebook did not return a user access token.");
  }

  return response.access_token;
}

export async function fetchFacebookManagedPages(userAccessToken: string) {
  const response = await facebookGraphRequest<{
    data?: FacebookManagedPage[];
  }>("/me/accounts", userAccessToken, {
    fields: "id,name,access_token",
    limit: "100",
  });

  const rawPages = response?.data ?? [];
  const usablePages: FacebookPageConnectionOption[] = [];
  const droppedPages: FacebookManagedPageDrop[] = [];

  for (const page of rawPages) {
    if (!page.id) {
      droppedPages.push({
        pageId: null,
        pageName: page.name ?? null,
        reason: "missing_id",
      });
      continue;
    }

    if (!page.name) {
      droppedPages.push({
        pageId: page.id,
        pageName: null,
        reason: "missing_name",
      });
      continue;
    }

    if (!page.access_token) {
      droppedPages.push({
        pageId: page.id,
        pageName: page.name,
        reason: "missing_access_token",
      });
      continue;
    }

    usablePages.push({
      pageAccessToken: page.access_token,
      pageId: page.id,
      pageName: page.name,
    });
  }

  return {
    droppedPages,
    rawPages,
    usablePages,
  };
}

export function verifyFacebookWebhookSignature(args: {
  rawBody?: string;
  signatureHeader?: string;
}) {
  const config = getFacebookConfig();

  if (!config.appSecret) {
    return true;
  }

  if (!args.rawBody || !args.signatureHeader) {
    return false;
  }

  const [algorithm, digest] = args.signatureHeader.split("=");

  if (algorithm !== "sha256" || !digest) {
    return false;
  }

  const expected = createHmac("sha256", config.appSecret)
    .update(args.rawBody)
    .digest("hex");

  const left = Buffer.from(digest);
  const right = Buffer.from(expected);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function isFacebookWebhookVerificationValid(args: {
  challenge?: string;
  mode?: string;
  verifyToken?: string;
}) {
  const config = getFacebookConfig();

  return (
    args.mode === "subscribe" &&
    Boolean(args.challenge) &&
    Boolean(config.verifyToken) &&
    args.verifyToken === config.verifyToken
  );
}

export function parseFacebookCommentEvents(payload: unknown) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    (payload as { object?: unknown }).object !== "page"
  ) {
    return [] satisfies FacebookCommentEvent[];
  }

  const entries = Array.isArray((payload as { entry?: unknown[] }).entry)
    ? (payload as { entry: unknown[] }).entry
    : [];
  const events: FacebookCommentEvent[] = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const pageId =
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
        field !== "feed" ||
        !value ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        continue;
      }

      const item = (value as { item?: unknown }).item;
      const verb = (value as { verb?: unknown }).verb;

      if (item !== "comment" || (verb && verb !== "add")) {
        continue;
      }

      const commentId =
        typeof (value as { comment_id?: unknown }).comment_id === "string"
          ? (value as { comment_id: string }).comment_id
          : typeof (value as { id?: unknown }).id === "string"
            ? (value as { id: string }).id
            : null;

      if (!commentId) {
        continue;
      }

      events.push({
        commentId,
        createdTime:
          typeof (value as { created_time?: unknown }).created_time === "string"
            ? (value as { created_time: string }).created_time
            : null,
        message:
          typeof (value as { message?: unknown }).message === "string"
            ? (value as { message: string }).message
            : null,
        pageId,
        parentId:
          typeof (value as { parent_id?: unknown }).parent_id === "string"
            ? (value as { parent_id: string }).parent_id
            : null,
        postId:
          typeof (value as { post_id?: unknown }).post_id === "string"
            ? (value as { post_id: string }).post_id
            : null,
        rawPayload: change,
        verb: typeof verb === "string" ? verb : null,
      });
    }
  }

  return events;
}

export async function fetchFacebookPostComments(
  postId: string,
  accessToken?: string | null,
) {
  const response = await facebookGraphRequest<{
    data?: FacebookGraphComment[];
  }>(
    `/${encodeURIComponent(postId)}/comments`,
    accessToken,
    {
    fields: "id,message,created_time,parent{id}",
    filter: "stream",
    limit: "100",
    },
  );

  return response?.data ?? [];
}

export async function enrichFacebookCommentEvent(
  commentEvent: FacebookCommentEvent,
  accessTokens?: string[],
) {
  if (commentEvent.message && commentEvent.postId) {
    return commentEvent;
  }

  const uniqueTokens = [...new Set((accessTokens ?? []).filter(Boolean))];

  if (uniqueTokens.length === 0) {
    return commentEvent;
  }

  for (const accessToken of uniqueTokens) {
    try {
      const response = await facebookGraphRequest<FacebookGraphComment>(
        `/${encodeURIComponent(commentEvent.commentId)}`,
        accessToken,
        {
          fields: "id,message,created_time,parent{id}",
        },
      );

      if (!response) {
        continue;
      }

      return {
        ...commentEvent,
        createdTime: response.created_time ?? commentEvent.createdTime ?? null,
        message: response.message ?? commentEvent.message,
        postId: response.parent?.id ?? commentEvent.postId,
      };
    } catch {
      continue;
    }
  }

  return {
    ...commentEvent,
  };
}
