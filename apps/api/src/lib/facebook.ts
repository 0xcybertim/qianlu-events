import { createHmac, timingSafeEqual } from "node:crypto";

import { getFacebookConfig } from "@qianlu-events/config";

const facebookApiVersion = "v22.0";
const facebookOAuthScopes = [
  "business_management",
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

type FacebookPermissionStatus = {
  permission?: string;
  status?: string;
};

type FacebookManagedPage = {
  access_token?: string;
  id?: string;
  name?: string;
  permitted_tasks?: string[];
  tasks?: string[];
};

type FacebookBusiness = {
  id?: string;
  name?: string;
  permitted_roles?: string[];
};

export type FacebookPageConnectionOption = {
  pageAccessToken: string;
  pageId: string;
  pageName: string;
};

export type FacebookManagedPageSource =
  | "user_accounts"
  | "business_owned_pages"
  | "business_client_pages";

export type FacebookManagedPageBusiness = {
  businessId: string | null;
  businessName: string | null;
  permittedRoles: string[];
};

export type FacebookManagedPageDebug = {
  accessTokenReturned: boolean;
  businesses: FacebookManagedPageBusiness[];
  pageId: string | null;
  pageName: string | null;
  permittedTasks: string[];
  sources: FacebookManagedPageSource[];
  tasks: string[];
  tokenLookupAttempted: boolean;
  tokenLookupError: string | null;
};

export type FacebookManagedPageDrop = {
  pageId: string | null;
  pageName: string | null;
  reason:
    | "missing_access_token"
    | "missing_id"
    | "missing_name"
    | "token_lookup_failed";
};

export type FacebookManagedPageDiscoveryWarning = {
  businessId: string | null;
  businessName: string | null;
  message: string;
  stage: "business_client_pages" | "business_owned_pages" | "user_businesses";
};

export type FacebookManagedPageDiscoveryLog = {
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
};

export async function fetchFacebookGrantedPermissions(userAccessToken: string) {
  const response = await facebookGraphRequest<{
    data?: FacebookPermissionStatus[];
  }>("/me/permissions", userAccessToken, {
    limit: "200",
  });

  return (response?.data ?? [])
    .filter((item): item is Required<Pick<FacebookPermissionStatus, "permission" | "status">> =>
      typeof item.permission === "string" && typeof item.status === "string",
    )
    .map((item) => ({
      permission: item.permission,
      status: item.status,
    }));
}

type FacebookManagedPageDiscoveryTrace = {
  businessId?: string | null;
  businessName?: string | null;
  count?: number | null;
  endpoint:
    | "/me/accounts"
    | "/me/businesses"
    | "/{business-id}/owned_pages"
    | "/{business-id}/client_pages"
    | "/{page-id}";
  error?: string | null;
  event:
    | "discovery_complete"
    | "endpoint_error"
    | "endpoint_result"
    | "page_token_lookup_error"
    | "page_token_lookup_result";
  pageId?: string | null;
  pageName?: string | null;
};

type FacebookManagedPageDiscoveryLogger = (
  trace: FacebookManagedPageDiscoveryTrace,
) => void;

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
    let details = `Facebook Graph API request failed with ${response.status}.`;

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
        details = `${details} ${payload.error.type ?? "GraphError"} (${payload.error.code ?? "unknown"}).`;
      }
    } catch {
      // Keep the generic error message when Meta does not return JSON.
    }

    throw new Error(details);
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

export async function fetchFacebookManagedPages(
  userAccessToken: string,
  logger?: FacebookManagedPageDiscoveryLogger,
) {
  const response = await facebookGraphRequest<{
    data?: FacebookManagedPage[];
  }>("/me/accounts", userAccessToken, {
    fields: "id,name,access_token,tasks",
    limit: "100",
  });

  const rawPages = response?.data ?? [];
  const rawDebugPages: FacebookManagedPageDebug[] = [];
  const usablePages: FacebookPageConnectionOption[] = [];
  const droppedPages: FacebookManagedPageDrop[] = [];
  const discoveryLogs: FacebookManagedPageDiscoveryLog[] = [];
  const discoveryWarnings: FacebookManagedPageDiscoveryWarning[] = [];
  const byPageId = new Map<
    string,
    {
      accessToken?: string;
      businesses: FacebookManagedPageBusiness[];
      pageId: string;
      pageName?: string;
      permittedTasks: Set<string>;
      sources: Set<FacebookManagedPageSource>;
      tasks: Set<string>;
      tokenLookupAttempted: boolean;
      tokenLookupError: string | null;
    }
  >();

  function ensureCandidate(args: {
    accessToken?: string;
    business?: FacebookManagedPageBusiness | null;
    pageId: string;
    pageName?: string;
    permittedTasks?: string[];
    source: FacebookManagedPageSource;
    tasks?: string[];
  }) {
    const existing = byPageId.get(args.pageId) ?? {
      businesses: [],
      pageId: args.pageId,
      permittedTasks: new Set<string>(),
      sources: new Set<FacebookManagedPageSource>(),
      tasks: new Set<string>(),
      tokenLookupAttempted: false,
      tokenLookupError: null,
    };

    existing.pageName = existing.pageName ?? args.pageName;
    existing.accessToken = existing.accessToken ?? args.accessToken;
    existing.sources.add(args.source);

    for (const task of args.tasks ?? []) {
      existing.tasks.add(task);
    }

    for (const task of args.permittedTasks ?? []) {
      existing.permittedTasks.add(task);
    }

    if (args.business) {
      const hasBusiness = existing.businesses.some(
        (business) =>
          business.businessId === args.business?.businessId &&
          business.businessName === args.business?.businessName,
      );

      if (!hasBusiness) {
        existing.businesses.push(args.business);
      }
    }

    byPageId.set(args.pageId, existing);
  }

  for (const page of rawPages) {
    if (!page.id) {
      droppedPages.push({
        pageId: null,
        pageName: page.name ?? null,
        reason: "missing_id",
      });
      continue;
    }

    ensureCandidate({
      accessToken: page.access_token,
      pageId: page.id,
      pageName: page.name,
      source: "user_accounts",
      tasks: page.tasks,
    });
  }

  discoveryLogs.push({
    businessId: null,
    businessName: null,
    count: rawPages.length,
    endpoint: "/me/accounts",
    error: null,
    pageId: null,
    pageName: null,
  });
  logger?.({
    count: rawPages.length,
    endpoint: "/me/accounts",
    event: "endpoint_result",
  });

  try {
    const businessesResponse = await facebookGraphRequest<{
      data?: FacebookBusiness[];
    }>("/me/businesses", userAccessToken, {
      fields: "id,name,permitted_roles",
      limit: "100",
    });
    const businesses = businessesResponse?.data ?? [];

    discoveryLogs.push({
      businessId: null,
      businessName: null,
      count: businesses.length,
      endpoint: "/me/businesses",
      error: null,
      pageId: null,
      pageName: null,
    });
    logger?.({
      count: businesses.length,
      endpoint: "/me/businesses",
      event: "endpoint_result",
    });

    if (businesses.length === 0) {
      discoveryWarnings.push({
        businessId: null,
        businessName: null,
        message:
          "Meta returned zero businesses from /me/businesses for this user access token.",
        stage: "user_businesses",
      });
    }

    for (const business of businesses) {
      if (!business.id) {
        continue;
      }

      const businessSummary: FacebookManagedPageBusiness = {
        businessId: business.id,
        businessName: business.name ?? null,
        permittedRoles: business.permitted_roles ?? [],
      };

      const businessEdges: Array<{
        fields: string;
        path: string;
        source: FacebookManagedPageSource;
        stage: FacebookManagedPageDiscoveryWarning["stage"];
      }> = [
        {
          fields: "id,name",
          path: `/${encodeURIComponent(business.id)}/owned_pages`,
          source: "business_owned_pages",
          stage: "business_owned_pages",
        },
        {
          fields: "id,name,permitted_tasks",
          path: `/${encodeURIComponent(business.id)}/client_pages`,
          source: "business_client_pages",
          stage: "business_client_pages",
        },
      ];

      for (const edge of businessEdges) {
        try {
          const pagesResponse = await facebookGraphRequest<{
            data?: FacebookManagedPage[];
          }>(edge.path, userAccessToken, {
            fields: edge.fields,
            limit: "100",
          });
          const pages = pagesResponse?.data ?? [];

          discoveryLogs.push({
            businessId: businessSummary.businessId,
            businessName: businessSummary.businessName,
            count: pages.length,
            endpoint:
              edge.source === "business_owned_pages"
                ? "/{business-id}/owned_pages"
                : "/{business-id}/client_pages",
            error: null,
            pageId: null,
            pageName: null,
          });
          logger?.({
            businessId: businessSummary.businessId,
            businessName: businessSummary.businessName,
            count: pages.length,
            endpoint:
              edge.source === "business_owned_pages"
                ? "/{business-id}/owned_pages"
                : "/{business-id}/client_pages",
            event: "endpoint_result",
          });

          for (const page of pages) {
            if (!page.id) {
              droppedPages.push({
                pageId: null,
                pageName: page.name ?? null,
                reason: "missing_id",
              });
              continue;
            }

            ensureCandidate({
              business: businessSummary,
              pageId: page.id,
              pageName: page.name,
              permittedTasks: page.permitted_tasks,
              source: edge.source,
            });
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Facebook business page discovery failed.";

          discoveryLogs.push({
            businessId: businessSummary.businessId,
            businessName: businessSummary.businessName,
            count: null,
            endpoint:
              edge.source === "business_owned_pages"
                ? "/{business-id}/owned_pages"
                : "/{business-id}/client_pages",
            error: message,
            pageId: null,
            pageName: null,
          });
          logger?.({
            businessId: businessSummary.businessId,
            businessName: businessSummary.businessName,
            endpoint:
              edge.source === "business_owned_pages"
                ? "/{business-id}/owned_pages"
                : "/{business-id}/client_pages",
            error: message,
            event: "endpoint_error",
          });
          discoveryWarnings.push({
            businessId: businessSummary.businessId,
            businessName: businessSummary.businessName,
            message,
            stage: edge.stage,
          });
        }
      }
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Facebook business discovery failed.";

    discoveryLogs.push({
      businessId: null,
      businessName: null,
      count: null,
      endpoint: "/me/businesses",
      error: message,
      pageId: null,
      pageName: null,
    });
    logger?.({
      endpoint: "/me/businesses",
      error: message,
      event: "endpoint_error",
    });
    discoveryWarnings.push({
      businessId: null,
      businessName: null,
      message,
      stage: "user_businesses",
    });
  }

  const candidates = [...byPageId.values()];

  await Promise.all(
    candidates.map(async (candidate) => {
      if (candidate.accessToken && candidate.pageName) {
        return;
      }

      candidate.tokenLookupAttempted = true;

      try {
        const page = await facebookGraphRequest<FacebookManagedPage>(
          `/${encodeURIComponent(candidate.pageId)}`,
          userAccessToken,
          {
            fields: "id,name,access_token,tasks",
          },
        );

        discoveryLogs.push({
          businessId: candidate.businesses[0]?.businessId ?? null,
          businessName: candidate.businesses[0]?.businessName ?? null,
          count: page ? 1 : 0,
          endpoint: "/{page-id}",
          error: null,
          pageId: candidate.pageId,
          pageName: page?.name ?? candidate.pageName ?? null,
        });
        logger?.({
          businessId: candidate.businesses[0]?.businessId ?? null,
          businessName: candidate.businesses[0]?.businessName ?? null,
          count: page ? 1 : 0,
          endpoint: "/{page-id}",
          event: "page_token_lookup_result",
          pageId: candidate.pageId,
          pageName: page?.name ?? candidate.pageName ?? null,
        });

        if (page?.name) {
          candidate.pageName = page.name;
        }

        if (page?.access_token) {
          candidate.accessToken = page.access_token;
        }

        for (const task of page?.tasks ?? []) {
          candidate.tasks.add(task);
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Facebook Page token lookup failed.";

        discoveryLogs.push({
          businessId: candidate.businesses[0]?.businessId ?? null,
          businessName: candidate.businesses[0]?.businessName ?? null,
          count: null,
          endpoint: "/{page-id}",
          error: message,
          pageId: candidate.pageId,
          pageName: candidate.pageName ?? null,
        });
        logger?.({
          businessId: candidate.businesses[0]?.businessId ?? null,
          businessName: candidate.businesses[0]?.businessName ?? null,
          endpoint: "/{page-id}",
          error: message,
          event: "page_token_lookup_error",
          pageId: candidate.pageId,
          pageName: candidate.pageName ?? null,
        });
        candidate.tokenLookupError =
          message;
      }
    }),
  );

  for (const candidate of candidates) {
    const pageName = candidate.pageName ?? null;

    rawDebugPages.push({
      accessTokenReturned: Boolean(candidate.accessToken),
      businesses: candidate.businesses,
      pageId: candidate.pageId,
      pageName,
      permittedTasks: [...candidate.permittedTasks].sort(),
      sources: [...candidate.sources].sort(),
      tasks: [...candidate.tasks].sort(),
      tokenLookupAttempted: candidate.tokenLookupAttempted,
      tokenLookupError: candidate.tokenLookupError,
    });

    if (!pageName) {
      droppedPages.push({
        pageId: candidate.pageId,
        pageName: null,
        reason: "missing_name",
      });
      continue;
    }

    if (!candidate.accessToken) {
      droppedPages.push({
        pageId: candidate.pageId,
        pageName,
        reason: candidate.tokenLookupError
          ? "token_lookup_failed"
          : "missing_access_token",
      });
      continue;
    }

    usablePages.push({
      pageAccessToken: candidate.accessToken,
      pageId: candidate.pageId,
      pageName,
    });
  }

  logger?.({
    count: usablePages.length,
    endpoint: "/me/accounts",
    event: "discovery_complete",
  });

  return {
    discoveryLogs,
    discoveryWarnings,
    droppedPages,
    rawPages: rawDebugPages,
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
