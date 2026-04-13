import { createHash, randomBytes } from "node:crypto";

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Prisma, type AdminRole } from "@prisma/client";
import { ADMIN_SESSION_COOKIE_NAME } from "@qianlu-events/config";
import { getFacebookCommentTaskConfig } from "@qianlu-events/domain";
import {
  adminAuthLoginBodySchema,
  adminFacebookConnectionSelectBodySchema,
  adminEventCreateBodySchema,
  adminFacebookConnectionUpsertBodySchema,
  adminEventUpdateBodySchema,
  adminQrCodeCreateBodySchema,
  adminTaskCreateBodyWithFacebookSourceSchema,
  adminTaskUpdateBodySchema,
  eventSettingsSchema,
  facebookCommentTaskConfigSchema,
  type TaskAttemptStatus,
} from "@qianlu-events/schemas";
import { z } from "zod";

import {
  createAdminSessionToken,
  hashAdminSessionToken,
  verifyAdminPassword,
} from "../lib/admin-auth.js";
import {
  buildFacebookOAuthUrl,
  exchangeFacebookCodeForUserAccessToken,
  fetchFacebookPagePosts,
  fetchFacebookGrantedPermissions,
  fetchFacebookManagedPages,
} from "../lib/facebook.js";
import { prisma } from "../lib/prisma.js";

const leadTaskTypes = [
  "LEAD_FORM",
  "NEWSLETTER_OPT_IN",
  "WHATSAPP_OPT_IN",
] as const;

const taskAttemptStatuses: TaskAttemptStatus[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED_BY_USER",
  "PENDING_STAFF_CHECK",
  "PENDING_AUTO_VERIFICATION",
  "VERIFIED",
  "REJECTED",
];

const roleRank: Record<AdminRole, number> = {
  VIEWER: 1,
  EDITOR: 2,
  OWNER: 3,
};

type AdminAccountForRequest = {
  id: string;
  email: string;
  name: string | null;
};

type AdminEventWithTasks = Prisma.EventGetPayload<{
  include: {
    facebookConnection: true;
    tasks: true;
  };
}>;

type QrScanStatusCount = {
  qrCodeId: string;
  status: "ACCEPTED" | "DUPLICATE" | "EXPIRED" | "INACTIVE" | "WRONG_EVENT";
  _count: {
    _all: number;
  };
};

function unauthorized(reply: FastifyReply) {
  reply.code(401);

  return {
    message: "Admin authentication required.",
  };
}

function forbidden(reply: FastifyReply) {
  reply.code(403);

  return {
    message: "You do not have access to this event.",
  };
}

function setAdminCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(ADMIN_SESSION_COOKIE_NAME, token, {
    expires: expiresAt,
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function clearAdminCookie(reply: FastifyReply) {
  reply.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

function serializeAdminAccount(account: AdminAccountForRequest) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
  };
}

async function loadAdminAccount(request: FastifyRequest) {
  const token = request.cookies[ADMIN_SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  const session = await prisma.adminSession.findUnique({
    where: {
      tokenHash: hashAdminSessionToken(token),
    },
    include: {
      adminAccount: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date() || !session.adminAccount.isActive) {
    await prisma.adminSession.deleteMany({
      where: {
        id: session.id,
      },
    });

    return null;
  }

  return session.adminAccount;
}

async function requireAdminAccount(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const account = await loadAdminAccount(request);

  if (!account) {
    unauthorized(reply);

    return null;
  }

  return account;
}

async function requireEventAccess(args: {
  eventSlug: string;
  minRole: AdminRole;
  reply: FastifyReply;
  request: FastifyRequest;
}) {
  const account = await requireAdminAccount(args.request, args.reply);

  if (!account) {
    return null;
  }

  const event = await prisma.event.findUnique({
    where: { slug: args.eventSlug },
    include: {
      adminAccess: {
        where: {
          adminAccountId: account.id,
        },
      },
      facebookConnection: true,
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!event) {
    args.reply.code(404);

    return {
      message: "Event not found.",
    };
  }

  const access = event.adminAccess[0];

  if (!access || roleRank[access.role] < roleRank[args.minRole]) {
    return forbidden(args.reply);
  }

  return {
    account,
    event,
    role: access.role,
  };
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getProofObject(proofJson: unknown) {
  if (!proofJson || typeof proofJson !== "object" || Array.isArray(proofJson)) {
    return null;
  }

  return proofJson as Record<string, unknown>;
}

function getProofBoolean(proofJson: unknown, key: string) {
  const proof = getProofObject(proofJson);
  const value = proof?.[key];

  return typeof value === "boolean" ? value : null;
}

function getSocialCommentProof(proofJson: unknown) {
  const proof = getProofObject(proofJson);
  const socialComment = proof?.socialComment;

  if (
    !socialComment ||
    typeof socialComment !== "object" ||
    Array.isArray(socialComment)
  ) {
    return null;
  }

  return socialComment as Record<string, unknown>;
}

function getProofString(proofJson: unknown, key: string) {
  const proof = getSocialCommentProof(proofJson);
  const value = proof?.[key];

  return typeof value === "string" ? value : null;
}

function toStatusCounts(
  attempts: {
    status: TaskAttemptStatus;
  }[],
) {
  const counts = Object.fromEntries(
    taskAttemptStatuses.map((status) => [status, 0]),
  ) as Record<TaskAttemptStatus, number>;

  for (const attempt of attempts) {
    counts[attempt.status] += 1;
  }

  return counts;
}

function serializeAdminParticipant(
  session: {
    id: string;
    verificationCode: string;
    name: string | null;
    email: string | null;
    claimedPoints: number;
    verifiedPoints: number;
    rewardTier: string | null;
    instantRewardEligible: boolean;
    dailyDrawEligible: boolean;
    createdAt: Date;
    updatedAt: Date;
    taskAttempts: { status: TaskAttemptStatus }[];
  },
) {
  return {
    id: session.id,
    verificationCode: session.verificationCode,
    name: session.name,
    email: session.email,
    claimedPoints: session.claimedPoints,
    verifiedPoints: session.verifiedPoints,
    rewardTier: session.rewardTier,
    instantRewardEligible: session.instantRewardEligible,
    dailyDrawEligible: session.dailyDrawEligible,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    statusCounts: toStatusCounts(session.taskAttempts),
  };
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseOptionalDate(value: string | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

async function createDefaultQrCodeForStampTask(task: {
  eventId: string;
  id: string;
  title: string;
  type: string;
}) {
  if (task.type !== "STAMP_SCAN") {
    return null;
  }

  const existingQrCode = await prisma.qrCode.findFirst({
    where: {
      taskId: task.id,
    },
  });

  if (existingQrCode) {
    return existingQrCode;
  }

  const token = randomBytes(24).toString("base64url");

  return prisma.qrCode.create({
    data: {
      eventId: task.eventId,
      taskId: task.id,
      label: task.title,
      publicToken: token,
      tokenHash: hashQrToken(token),
    },
  });
}

function toTaskCreateData(
  eventId: string,
  body: z.infer<typeof adminTaskCreateBodyWithFacebookSourceSchema>,
) {
  const facebookCommentConfig =
    body.type === "SOCIAL_COMMENT" && body.platform === "FACEBOOK"
      ? facebookCommentTaskConfigSchema.parse(body.configJson ?? null)
      : null;

  return {
    eventId,
    title: body.title,
    description: body.description,
    type: body.type,
    platform: body.platform,
    points: body.points,
    sortOrder: body.sortOrder,
    isActive: body.isActive,
    requiresVerification: facebookCommentConfig ? true : body.requiresVerification,
    verificationType: facebookCommentConfig ? "AUTOMATIC" : body.verificationType,
    configJson: (facebookCommentConfig ?? body.configJson) ?? Prisma.JsonNull,
  } satisfies Prisma.TaskUncheckedCreateInput;
}

function toTaskUpdateData(args: {
  body: z.infer<typeof adminTaskUpdateBodySchema>;
  currentTask: {
    configJson: Prisma.JsonValue | null;
    platform: string;
    type: string;
  };
}) {
  const { body, currentTask } = args;
  const data: Prisma.TaskUpdateInput = {};
  const facebookCommentConfig =
    (body.type ?? currentTask.type) === "SOCIAL_COMMENT" &&
    (body.platform ?? currentTask.platform) === "FACEBOOK"
      ? facebookCommentTaskConfigSchema.parse(
          body.configJson ?? currentTask.configJson ?? null,
        )
      : null;

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.type !== undefined) data.type = body.type;
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.points !== undefined) data.points = body.points;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.requiresVerification !== undefined) {
    data.requiresVerification = facebookCommentConfig ? true : body.requiresVerification;
  }
  if (body.verificationType !== undefined) {
    data.verificationType = facebookCommentConfig
      ? "AUTOMATIC"
      : body.verificationType;
  }
  if (body.configJson !== undefined) {
    data.configJson =
      (facebookCommentConfig ?? body.configJson) ?? Prisma.JsonNull;
  } else if (facebookCommentConfig) {
    data.configJson = facebookCommentConfig;
  }
  if (facebookCommentConfig) data.requiresVerification = true;
  if (facebookCommentConfig) data.verificationType = "AUTOMATIC";

  return data;
}

async function countLeads(eventId: string) {
  return prisma.taskAttempt.count({
    where: {
      task: {
        eventId,
        type: {
          in: [...leadTaskTypes],
        },
      },
      proofJson: {
        not: Prisma.AnyNull,
      },
    },
  });
}

async function serializeAdminEventSummary(access: {
  role: AdminRole;
  event: {
    id: string;
    slug: string;
    name: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    brandingJson: unknown;
    settingsJson: unknown;
    _count: {
      tasks: number;
      sessions: number;
    };
  };
}) {
  return {
    id: access.event.id,
    slug: access.event.slug,
    name: access.event.name,
    status: access.event.status,
    brandingJson: access.event.brandingJson,
    settingsJson: access.event.settingsJson,
    taskCount: access.event._count.tasks,
    participantCount: access.event._count.sessions,
    leadCount: await countLeads(access.event.id),
    adminRole: access.role,
  };
}

async function serializeAdminEventDetail(event: AdminEventWithTasks | null) {
  if (!event) {
    return null;
  }

  const [participantCount, leadCount] = await Promise.all([
    prisma.participantSession.count({
      where: { eventId: event.id },
    }),
    countLeads(event.id),
  ]);

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    status: event.status,
    brandingJson: event.brandingJson,
    settingsJson: event.settingsJson,
    tasks: event.tasks.map((task) => ({
      id: task.id,
      eventId: task.eventId,
      type: task.type,
      platform: task.platform,
      title: task.title,
      description: task.description,
      points: task.points,
      sortOrder: task.sortOrder,
      requiresVerification: task.requiresVerification,
      verificationType: task.verificationType,
      configJson: task.configJson,
      isActive: task.isActive,
    })),
    participantCount,
    leadCount,
    facebookConnection: event.facebookConnection
      ? {
          pageId: event.facebookConnection.pageId,
          pageName: event.facebookConnection.pageName,
          hasAccessToken: event.facebookConnection.pageAccessToken.length > 0,
          tokenHint:
            event.facebookConnection.pageAccessToken.length >= 6
              ? event.facebookConnection.pageAccessToken.slice(-6)
              : "set",
          updatedAt: event.facebookConnection.updatedAt.toISOString(),
        }
      : null,
  };
}

const facebookPendingPageOptionSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  pageAccessToken: z.string().min(1),
});

const facebookOauthStoredPageSchema = z.object({
  accessTokenReturned: z.boolean().default(false),
  businesses: z
    .array(
      z.object({
        businessId: z.string().nullable(),
        businessName: z.string().nullable(),
        permittedRoles: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
  permittedTasks: z.array(z.string()).default([]),
  sources: z
    .array(
      z.enum([
        "user_accounts",
        "business_owned_pages",
        "business_client_pages",
      ]),
    )
    .default([]),
  tasks: z.array(z.string()).default([]),
  tokenLookupAttempted: z.boolean().default(false),
  tokenLookupError: z.string().nullable().default(null),
});

const facebookOauthDroppedPageSchema = z.object({
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
  reason: z.enum([
    "missing_access_token",
    "missing_id",
    "missing_name",
    "token_lookup_failed",
  ]),
});

const facebookOauthDiscoveryWarningSchema = z.object({
  businessId: z.string().nullable(),
  businessName: z.string().nullable(),
  message: z.string(),
  stage: z.enum([
    "business_client_pages",
    "business_owned_pages",
    "user_businesses",
  ]),
});

const facebookOauthDiscoveryLogSchema = z.object({
  businessId: z.string().nullable(),
  businessName: z.string().nullable(),
  count: z.number().int().nonnegative().nullable(),
  endpoint: z.enum([
    "/me/accounts",
    "/me/businesses",
    "/{business-id}/owned_pages",
    "/{business-id}/client_pages",
    "/{page-id}",
  ]),
  error: z.string().nullable(),
  pageId: z.string().nullable(),
  pageName: z.string().nullable(),
});

const facebookOauthStoredDebugSchema = z.object({
  discoveryLogs: z.array(facebookOauthDiscoveryLogSchema).default([]),
  discoveryWarnings: z.array(facebookOauthDiscoveryWarningSchema).default([]),
  usablePages: z.array(facebookPendingPageOptionSchema).default([]),
  rawPages: z.array(facebookOauthStoredPageSchema).default([]),
  droppedPages: z.array(facebookOauthDroppedPageSchema).default([]),
});

function getApiBaseUrl() {
  return (
    process.env.API_BASE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://localhost:4011"
  );
}

function getWebBaseUrl() {
  return process.env.WEB_BASE_URL?.trim() || "http://localhost:5173";
}

function getFacebookOAuthRedirectUri() {
  return `${getApiBaseUrl()}/admin/integrations/facebook/callback`;
}

function buildAdminEventTasksUrl(
  eventSlug: string,
  facebookConnect?: string,
) {
  const url = new URL(
    `/admin/events/${encodeURIComponent(eventSlug)}/tasks`,
    getWebBaseUrl(),
  );

  if (facebookConnect) {
    url.searchParams.set("facebookConnect", facebookConnect);
  }

  return url.toString();
}

function parsePendingFacebookPageOptions(value: Prisma.JsonValue | null) {
  const result = z.array(facebookPendingPageOptionSchema).safeParse(value);

  return result.success ? result.data : [];
}

function parseFacebookOauthStoredDebug(value: Prisma.JsonValue | null) {
  const result = facebookOauthStoredDebugSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  return {
    discoveryLogs: [],
    discoveryWarnings: [],
    droppedPages: [],
    rawPages: [],
    usablePages: parsePendingFacebookPageOptions(value),
  };
}

function serializePendingFacebookConnection(
  state: {
    expiresAt: Date;
    pageOptionsJson: Prisma.JsonValue | null;
  } | null,
) {
  if (!state) {
    return null;
  }

  const pages = parseFacebookOauthStoredDebug(state.pageOptionsJson).usablePages;

  if (pages.length === 0) {
    return null;
  }

  return {
    pages: pages.map((page) => ({
      pageId: page.pageId,
      pageName: page.pageName,
    })),
    expiresAt: state.expiresAt.toISOString(),
  };
}

function serializeFacebookOauthDebugState(
  state: {
    consumedAt: Date | null;
    createdAt: Date;
    expiresAt: Date;
    pageOptionsJson: Prisma.JsonValue | null;
    state: string;
  } | null,
) {
  if (!state) {
    return null;
  }

  return {
    createdAt: state.createdAt.toISOString(),
    consumedAt: state.consumedAt?.toISOString() ?? null,
    expiresAt: state.expiresAt.toISOString(),
    discoveryLogs: parseFacebookOauthStoredDebug(state.pageOptionsJson).discoveryLogs,
    discoveryWarnings: parseFacebookOauthStoredDebug(state.pageOptionsJson).discoveryWarnings,
    pages: parseFacebookOauthStoredDebug(state.pageOptionsJson).usablePages.map((page) => ({
      pageId: page.pageId,
      pageName: page.pageName,
    })),
    rawPages: parseFacebookOauthStoredDebug(state.pageOptionsJson).rawPages,
    droppedPages: parseFacebookOauthStoredDebug(state.pageOptionsJson).droppedPages,
    state: state.state,
  };
}

async function loadLatestUsableFacebookPagesForEvent(eventId: string) {
  const state = await findLatestFacebookOauthStateForEvent(eventId);

  return parseFacebookOauthStoredDebug(state?.pageOptionsJson ?? null).usablePages;
}

async function syncEventFacebookConnectionFromSelection(args: {
  eventId: string;
  pageId?: string | null;
}) {
  if (!args.pageId) {
    return;
  }

  const usablePages = await loadLatestUsableFacebookPagesForEvent(args.eventId);
  const selectedPage = usablePages.find((page) => page.pageId === args.pageId);

  if (!selectedPage) {
    throw new Error("Selected Facebook Page is no longer available from the latest OAuth session.");
  }

  await prisma.eventFacebookConnection.upsert({
    where: {
      eventId: args.eventId,
    },
    update: {
      pageAccessToken: selectedPage.pageAccessToken,
      pageId: selectedPage.pageId,
      pageName: selectedPage.pageName,
    },
    create: {
      eventId: args.eventId,
      pageAccessToken: selectedPage.pageAccessToken,
      pageId: selectedPage.pageId,
      pageName: selectedPage.pageName,
    },
  });
}

async function findPendingFacebookOauthState(args: {
  adminAccountId: string;
  eventId: string;
}) {
  return prisma.adminFacebookOAuthState.findFirst({
    where: {
      adminAccountId: args.adminAccountId,
      consumedAt: null,
      eventId: args.eventId,
      expiresAt: {
        gt: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function findLatestFacebookOauthStateForEvent(eventId: string) {
  return prisma.adminFacebookOAuthState.findFirst({
    where: {
      eventId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

async function loadLeads(eventSlug: string) {
  const attempts = await prisma.taskAttempt.findMany({
    where: {
      task: {
        event: {
          slug: eventSlug,
        },
        type: {
          in: [...leadTaskTypes],
        },
      },
      proofJson: {
        not: Prisma.AnyNull,
      },
    },
    include: {
      participantSession: true,
      task: true,
    },
    orderBy: [{ claimedAt: "desc" }, { updatedAt: "desc" }],
  });

  return attempts.map((attempt) => ({
    id: attempt.id,
    verificationCode: attempt.participantSession.verificationCode,
    name: attempt.participantSession.name,
    email: attempt.participantSession.email,
    optIn: getProofBoolean(attempt.proofJson, "optIn"),
    submittedTask: attempt.task.title,
    submittedTaskId: attempt.taskId,
    status: attempt.status,
    submittedAt: serializeDate(attempt.claimedAt ?? attempt.updatedAt),
    proofJson: attempt.proofJson,
  }));
}

function getQrCodeRunningState(qrCode: {
  isActive: boolean;
  task: {
    isActive: boolean;
    type: string;
  };
  validFrom: Date | null;
  validUntil: Date | null;
}) {
  const now = new Date();

  return (
    qrCode.isActive &&
    qrCode.task.isActive &&
    qrCode.task.type === "STAMP_SCAN" &&
    (!qrCode.validFrom || now >= qrCode.validFrom) &&
    (!qrCode.validUntil || now <= qrCode.validUntil)
  );
}

function emptyQrScanCounts() {
  return {
    accepted: 0,
    duplicate: 0,
    expired: 0,
    inactive: 0,
    wrongEvent: 0,
    total: 0,
  };
}

function buildQrScanCountMap(counts: QrScanStatusCount[]) {
  const countMap = new Map<string, ReturnType<typeof emptyQrScanCounts>>();

  for (const row of counts) {
    const current = countMap.get(row.qrCodeId) ?? emptyQrScanCounts();
    const count = row._count._all;

    if (row.status === "ACCEPTED") current.accepted = count;
    if (row.status === "DUPLICATE") current.duplicate = count;
    if (row.status === "EXPIRED") current.expired = count;
    if (row.status === "INACTIVE") current.inactive = count;
    if (row.status === "WRONG_EVENT") current.wrongEvent = count;

    current.total =
      current.accepted +
      current.duplicate +
      current.expired +
      current.inactive +
      current.wrongEvent;
    countMap.set(row.qrCodeId, current);
  }

  return countMap;
}

async function loadQrCodes(eventId: string, eventSlug: string) {
  const stampTasksWithoutQrCode = await prisma.task.findMany({
    where: {
      eventId,
      type: "STAMP_SCAN",
      qrCodes: {
        none: {},
      },
    },
  });

  for (const task of stampTasksWithoutQrCode) {
    await createDefaultQrCodeForStampTask(task);
  }

  const qrCodes = await prisma.qrCode.findMany({
    where: {
      eventId,
    },
    include: {
      task: true,
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  const counts = await prisma.qrScan.groupBy({
    by: ["qrCodeId", "status"],
    where: {
      qrCodeId: {
        in: qrCodes.map((qrCode) => qrCode.id),
      },
    },
    _count: {
      _all: true,
    },
  });
  const countMap = buildQrScanCountMap(counts);

  return qrCodes.map((qrCode) => ({
    id: qrCode.id,
    label: qrCode.label,
    taskId: qrCode.taskId,
    taskTitle: qrCode.task.title,
    taskType: qrCode.task.type,
    scanUrl: qrCode.publicToken
      ? `/${encodeURIComponent(eventSlug)}/scan/${encodeURIComponent(
          qrCode.publicToken,
        )}`
      : null,
    isActive: qrCode.isActive,
    isRunning: getQrCodeRunningState(qrCode),
    validFrom: serializeDate(qrCode.validFrom),
    validUntil: serializeDate(qrCode.validUntil),
    scanLimitPerSession: qrCode.scanLimitPerSession,
    cooldownSeconds: qrCode.cooldownSeconds,
    createdAt: qrCode.createdAt.toISOString(),
    updatedAt: qrCode.updatedAt.toISOString(),
    scanCounts: countMap.get(qrCode.id) ?? emptyQrScanCounts(),
  }));
}

export function registerAdminRoutes(app: FastifyInstance) {
  app.post("/admin/auth/login", async (request, reply) => {
    const body = adminAuthLoginBodySchema.parse(request.body);
    const account = await prisma.adminAccount.findUnique({
      where: {
        email: body.email,
      },
    });

    if (
      !account ||
      !account.isActive ||
      !(await verifyAdminPassword(body.password, account.passwordHash))
    ) {
      return unauthorized(reply);
    }

    const token = createAdminSessionToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8);

    await prisma.adminSession.create({
      data: {
        adminAccountId: account.id,
        tokenHash: hashAdminSessionToken(token),
        expiresAt,
      },
    });

    setAdminCookie(reply, token, expiresAt);

    return {
      ok: true,
      account: serializeAdminAccount(account),
    };
  });

  app.post("/admin/auth/logout", async (request, reply) => {
    const token = request.cookies[ADMIN_SESSION_COOKIE_NAME];

    if (token) {
      await prisma.adminSession.deleteMany({
        where: {
          tokenHash: hashAdminSessionToken(token),
        },
      });
    }

    clearAdminCookie(reply);

    return {
      ok: true,
    };
  });

  app.get("/admin/auth/session", async (request) => {
    const account = await loadAdminAccount(request);

    return {
      ok: Boolean(account),
      account: account ? serializeAdminAccount(account) : null,
    };
  });

  app.get("/admin/events", async (request, reply) => {
    const account = await requireAdminAccount(request, reply);

    if (!account) {
      return {
        events: [],
      };
    }

    const access = await prisma.adminEventAccess.findMany({
      where: {
        adminAccountId: account.id,
      },
      include: {
        event: {
          include: {
            _count: {
              select: {
                tasks: true,
                sessions: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return {
      events: await Promise.all(access.map(serializeAdminEventSummary)),
    };
  });

  app.post("/admin/events", async (request, reply) => {
    const account = await requireAdminAccount(request, reply);

    if (!account) {
      return {
        message: "Admin authentication required.",
      };
    }

    const body = adminEventCreateBodySchema.parse(request.body);
    const event = await prisma.event.create({
      data: {
        ...body,
        adminAccess: {
          create: {
            adminAccountId: account.id,
            role: "OWNER",
          },
        },
      },
      include: {
        facebookConnection: true,
        tasks: true,
      },
    });

    reply.code(201);

    return serializeAdminEventDetail(event);
  });

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      return serializeAdminEventDetail(access.event);
    },
  );

  app.patch<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const body = adminEventUpdateBodySchema.parse(request.body);
      const event = await prisma.event.update({
        where: { id: access.event.id },
        data: body,
        include: {
          facebookConnection: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      return serializeAdminEventDetail(event);
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/tasks",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const detail = await serializeAdminEventDetail(access.event);

      return {
        tasks: detail?.tasks ?? [],
      };
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/facebook-oauth/start",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const state = createAdminSessionToken();

      await prisma.adminFacebookOAuthState.updateMany({
        where: {
          adminAccountId: access.account.id,
          consumedAt: null,
          eventId: access.event.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      await prisma.adminFacebookOAuthState.create({
        data: {
          adminAccountId: access.account.id,
          eventId: access.event.id,
          expiresAt: new Date(Date.now() + 1000 * 60 * 15),
          state,
        },
      });

      try {
        return reply.redirect(
          buildFacebookOAuthUrl({
            redirectUri: getFacebookOAuthRedirectUri(),
            state,
          }),
        );
      } catch (error) {
        request.log.error({ error }, "Could not start Facebook OAuth flow.");
        reply.code(400);

        return {
          message: "Facebook OAuth is not configured on the server.",
        };
      }
    },
  );

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/facebook-connection/pending", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "EDITOR",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { message: "Admin authentication required." };
    }

    const state = await findPendingFacebookOauthState({
      adminAccountId: access.account.id,
      eventId: access.event.id,
    });

    return serializePendingFacebookConnection(state);
  });

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/facebook-connection/debug", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "EDITOR",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { message: "Admin authentication required." };
    }

    return serializeFacebookOauthDebugState(
      await findLatestFacebookOauthStateForEvent(access.event.id),
    );
  });

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/facebook-comment-debug", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "VIEWER",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { tasks: [] };
    }

    const facebookTasks = access.event.tasks
      .map((task) => ({
        config: getFacebookCommentTaskConfig(task),
        task,
      }))
      .filter(
        (
          entry,
        ): entry is {
          config: NonNullable<ReturnType<typeof getFacebookCommentTaskConfig>>;
          task: (typeof access.event.tasks)[number];
        } =>
          Boolean(
            entry.config &&
              entry.task.type === "SOCIAL_COMMENT" &&
              entry.task.platform === "FACEBOOK" &&
              entry.config.autoVerify,
          ),
      );

    const tasks = await Promise.all(
      facebookTasks.map(async ({ config, task }) => {
        const [pendingAttemptCount, verifiedAttemptCount, unmatchedCommentCount, recentAttempts, recentComments] =
          await Promise.all([
            prisma.taskAttempt.count({
              where: {
                status: "PENDING_AUTO_VERIFICATION",
                taskId: task.id,
              },
            }),
            prisma.taskAttempt.count({
              where: {
                status: "VERIFIED",
                taskId: task.id,
              },
            }),
            prisma.socialCommentVerification.count({
              where: {
                externalPostId: config.facebookPostId,
                matched: false,
                platform: "FACEBOOK",
              },
            }),
            prisma.taskAttempt.findMany({
              where: {
                taskId: task.id,
                status: {
                  in: ["PENDING_AUTO_VERIFICATION", "VERIFIED"],
                },
              },
              include: {
                participantSession: {
                  select: {
                    email: true,
                    id: true,
                    name: true,
                    verificationCode: true,
                  },
                },
              },
              orderBy: {
                updatedAt: "desc",
              },
              take: 10,
            }),
            prisma.socialCommentVerification.findMany({
              where: {
                platform: "FACEBOOK",
                OR: [
                  {
                    externalPostId: config.facebookPostId,
                  },
                  {
                    taskId: task.id,
                  },
                ],
              },
              include: {
                participantSession: {
                  select: {
                    verificationCode: true,
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
              take: 10,
            }),
          ]);

        const postIdPrefix = config.facebookPostId.includes("_")
          ? config.facebookPostId.split("_")[0]
          : null;

        return {
          autoVerify: config.autoVerify,
          connectedPageId: access.event.facebookConnection?.pageId ?? null,
          connectedPageMatchesPostIdPrefix:
            access.event.facebookConnection?.pageId && postIdPrefix
              ? access.event.facebookConnection.pageId === postIdPrefix
              : null,
          connectedPageName: access.event.facebookConnection?.pageName ?? null,
          facebookPostId: config.facebookPostId,
          pendingAttemptCount,
          primaryUrl: config.primaryUrl ?? null,
          recentAttempts: recentAttempts.map((attempt) => ({
            awaitingAutoVerificationAt: getProofString(
              attempt.proofJson,
              "awaitingAutoVerificationAt",
            ),
            expectedCommentText: getProofString(
              attempt.proofJson,
              "expectedCommentText",
            ),
            matchedCommentId: getProofString(
              attempt.proofJson,
              "matchedCommentId",
            ),
            matchedCommentText: getProofString(
              attempt.proofJson,
              "matchedCommentText",
            ),
            participantEmail: attempt.participantSession.email,
            participantName: attempt.participantSession.name,
            participantSessionId: attempt.participantSession.id,
            source: getProofString(attempt.proofJson, "source"),
            status: attempt.status,
            taskAttemptId: attempt.id,
            updatedAt: attempt.updatedAt.toISOString(),
            verificationCode: attempt.participantSession.verificationCode,
            verifiedAutomaticallyAt: getProofString(
              attempt.proofJson,
              "verifiedAutomaticallyAt",
            ),
          })),
          recentComments: recentComments.map((comment) => ({
            commentText: comment.commentText,
            createdAt: comment.createdAt.toISOString(),
            externalCommentId: comment.externalCommentId,
            externalPostId: comment.externalPostId,
            matched: comment.matched,
            participantSessionId: comment.participantSessionId,
            participantVerificationCode:
              comment.participantSession?.verificationCode ?? null,
            processedAt: serializeDate(comment.processedAt),
            taskAttemptId: comment.taskAttemptId,
          })),
          requiredPrefix: config.requiredPrefix,
          requireVerificationCode: config.requireVerificationCode,
          taskId: task.id,
          taskTitle: task.title,
          unmatchedCommentCount,
          verifiedAttemptCount,
        };
      }),
    );

    return {
      tasks,
    };
  });

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/facebook-post-options", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "VIEWER",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { error: null, pages: [], selectedPageId: null };
    }

    const usablePages = await loadLatestUsableFacebookPagesForEvent(access.event.id);

    if (usablePages.length === 0) {
      return {
        error:
          "Run Facebook Page connect once before selecting a source Page and post.",
        pages: [],
        selectedPageId: access.event.facebookConnection?.pageId ?? null,
      };
    }

    const selectedPageId =
      access.event.facebookConnection?.pageId ?? usablePages[0]?.pageId ?? null;

    try {
      const pages = await Promise.all(
        usablePages.map(async (page) => {
          const posts = await fetchFacebookPagePosts(
            page.pageId,
            page.pageAccessToken,
          );

          return {
            pageId: page.pageId,
            pageName: page.pageName,
            posts: posts.map((post) => ({
              createdAt: post.created_time ?? null,
              messagePreview:
                (post.message ?? post.story ?? "").trim().slice(0, 140) ||
                `Facebook post ${post.id}`,
              permalinkUrl: post.permalink_url ?? null,
              postId: post.id,
            })),
          };
        }),
      );

      return {
        error: null,
        pages,
        selectedPageId,
      };
    } catch (error) {
      request.log.warn(
        {
          error,
          eventId: access.event.id,
          pageId: selectedPageId,
        },
        "Could not load Facebook source page post options for admin task form.",
      );

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not load recent Facebook posts for the available Pages.",
        pages: [],
        selectedPageId,
      };
    }
  });

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/facebook-connection/select",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const body = adminFacebookConnectionSelectBodySchema.parse(request.body);
      const state = await findPendingFacebookOauthState({
        adminAccountId: access.account.id,
        eventId: access.event.id,
      });

      if (!state) {
        reply.code(404);

        return {
          message: "No pending Facebook Page selection was found for this event.",
        };
      }

      const selectedPage = parseFacebookOauthStoredDebug(
        state.pageOptionsJson,
      ).usablePages.find((page) => page.pageId === body.pageId);

      if (!selectedPage) {
        reply.code(400);

        return {
          message: "The selected Facebook Page is no longer available.",
        };
      }

      await prisma.$transaction([
        prisma.eventFacebookConnection.upsert({
          where: {
            eventId: access.event.id,
          },
          update: {
            pageAccessToken: selectedPage.pageAccessToken,
            pageId: selectedPage.pageId,
            pageName: selectedPage.pageName,
          },
          create: {
            eventId: access.event.id,
            pageAccessToken: selectedPage.pageAccessToken,
            pageId: selectedPage.pageId,
            pageName: selectedPage.pageName,
          },
        }),
        prisma.adminFacebookOAuthState.update({
          where: {
            id: state.id,
          },
          data: {
            consumedAt: new Date(),
          },
        }),
      ]);

      const event = await prisma.event.findUnique({
        where: { id: access.event.id },
        include: {
          facebookConnection: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      return serializeAdminEventDetail(event);
    },
  );

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/facebook-connection",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const body = adminFacebookConnectionUpsertBodySchema.parse(request.body);
      const existingConnection = await prisma.eventFacebookConnection.findUnique({
        where: {
          eventId: access.event.id,
        },
      });

      if (!existingConnection && !body.pageAccessToken) {
        reply.code(400);

        return {
          message: "A page access token is required the first time you connect a Facebook Page.",
        };
      }

      await prisma.eventFacebookConnection.upsert({
        where: {
          eventId: access.event.id,
        },
        update: {
          pageId: body.pageId,
          pageName: body.pageName ?? null,
          ...(body.pageAccessToken
            ? {
                pageAccessToken: body.pageAccessToken,
              }
            : {}),
        },
        create: {
          eventId: access.event.id,
          pageId: body.pageId,
          pageName: body.pageName ?? null,
          pageAccessToken: body.pageAccessToken ?? "",
        },
      });

      const event = await prisma.event.findUnique({
        where: { id: access.event.id },
        include: {
          facebookConnection: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      return serializeAdminEventDetail(event);
    },
  );

  app.get<{
    Querystring: {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };
  }>("/admin/integrations/facebook/callback", async (request, reply) => {
    const stateValue = request.query.state;
    request.log.info(
      {
        hasCode: Boolean(request.query.code),
        hasError: Boolean(request.query.error),
        state: stateValue ?? null,
      },
      "Facebook OAuth callback received.",
    );
    const oauthState = stateValue
      ? await prisma.adminFacebookOAuthState.findUnique({
          where: {
            state: stateValue,
          },
          include: {
            event: true,
          },
        })
      : null;

    const fallbackUrl = oauthState
      ? buildAdminEventTasksUrl(oauthState.event.slug, "connect-failed")
      : new URL("/admin/events", getWebBaseUrl()).toString();

    if (
      !oauthState ||
      oauthState.consumedAt ||
      oauthState.expiresAt <= new Date()
    ) {
      request.log.warn(
        {
          eventId: oauthState?.eventId ?? null,
          state: stateValue ?? null,
        },
        "Facebook OAuth callback state was invalid, consumed, or expired.",
      );
      return reply.redirect(fallbackUrl);
    }

    if (request.query.error || !request.query.code) {
      request.log.warn(
        {
          error: request.query.error ?? null,
          errorDescription: request.query.error_description ?? null,
          eventId: oauthState.eventId,
          state: stateValue ?? null,
        },
        "Facebook OAuth callback denied or missing code.",
      );
      await prisma.adminFacebookOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      return reply.redirect(
        buildAdminEventTasksUrl(oauthState.event.slug, "oauth-denied"),
      );
    }

    try {
      const userAccessToken = await exchangeFacebookCodeForUserAccessToken({
        code: request.query.code,
        redirectUri: getFacebookOAuthRedirectUri(),
      });
      try {
        const grantedPermissions =
          await fetchFacebookGrantedPermissions(userAccessToken);

        request.log.info(
          {
            eventId: oauthState.eventId,
            grantedPermissions,
            state: stateValue ?? null,
          },
          "Facebook OAuth granted permissions.",
        );
      } catch (error) {
        request.log.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            eventId: oauthState.eventId,
            state: stateValue ?? null,
          },
          "Could not read Facebook OAuth granted permissions.",
        );
      }
      const {
        discoveryLogs,
        discoveryWarnings,
        droppedPages,
        rawPages,
        usablePages,
      } =
        await fetchFacebookManagedPages(userAccessToken, (trace) => {
          const level =
            trace.event === "endpoint_error" ||
            trace.event === "page_token_lookup_error"
              ? "warn"
              : "info";

          request.log[level](
            {
              businessId: trace.businessId ?? null,
              businessName: trace.businessName ?? null,
              count: trace.count ?? null,
              endpoint: trace.endpoint,
              error: trace.error ?? null,
              event: trace.event,
              eventId: oauthState.eventId,
              pageId: trace.pageId ?? null,
              pageName: trace.pageName ?? null,
              state: stateValue ?? null,
            },
            "Facebook discovery trace.",
          );
        });
      const debugPayload = {
        discoveryLogs,
        discoveryWarnings,
        droppedPages,
        rawPages,
        usablePages,
      } satisfies Prisma.InputJsonValue;

      request.log.info(
        {
          discoveryLogCount: discoveryLogs.length,
          discoveryWarningCount: discoveryWarnings.length,
          droppedPageCount: droppedPages.length,
          eventId: oauthState.eventId,
          rawPageCount: rawPages.length,
          state: stateValue ?? null,
          usablePageCount: usablePages.length,
        },
        "Facebook OAuth discovery completed.",
      );

      if (usablePages.length === 0) {
        await prisma.adminFacebookOAuthState.update({
          where: {
            id: oauthState.id,
          },
          data: {
            consumedAt: new Date(),
            pageOptionsJson: debugPayload,
          },
        });

        return reply.redirect(
          buildAdminEventTasksUrl(oauthState.event.slug, "no-pages"),
        );
      }

      if (usablePages.length === 1) {
        const [page] = usablePages;

        await prisma.$transaction([
          prisma.eventFacebookConnection.upsert({
            where: {
              eventId: oauthState.eventId,
            },
            update: {
              pageAccessToken: page.pageAccessToken,
              pageId: page.pageId,
              pageName: page.pageName,
            },
            create: {
              eventId: oauthState.eventId,
              pageAccessToken: page.pageAccessToken,
              pageId: page.pageId,
              pageName: page.pageName,
            },
          }),
          prisma.adminFacebookOAuthState.update({
            where: {
              id: oauthState.id,
            },
            data: {
              consumedAt: new Date(),
              pageOptionsJson: debugPayload,
            },
          }),
        ]);

        return reply.redirect(
          buildAdminEventTasksUrl(oauthState.event.slug, "connected"),
        );
      }

      await prisma.adminFacebookOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          pageOptionsJson: debugPayload,
        },
      });

      return reply.redirect(
        buildAdminEventTasksUrl(oauthState.event.slug, "select-page"),
      );
    } catch (error) {
      request.log.error(
        {
          error,
          eventId: oauthState.eventId,
        },
        "Facebook OAuth callback failed.",
      );

      await prisma.adminFacebookOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      return reply.redirect(
        buildAdminEventTasksUrl(oauthState.event.slug, "connect-failed"),
      );
    }
  });

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/tasks",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const body = adminTaskCreateBodyWithFacebookSourceSchema.parse(request.body);

      if (body.type === "SOCIAL_COMMENT" && body.platform === "FACEBOOK") {
        await syncEventFacebookConnectionFromSelection({
          eventId: access.event.id,
          pageId: body.facebookSourcePageId ?? null,
        });
      }

      const task = await prisma.task.create({
        data: toTaskCreateData(access.event.id, body),
      });

      await createDefaultQrCodeForStampTask(task);

      reply.code(201);

      return task;
    },
  );

  app.patch<{ Params: { eventSlug: string; taskId: string } }>(
    "/admin/events/:eventSlug/tasks/:taskId",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const task = await prisma.task.findFirst({
        where: {
          id: request.params.taskId,
          eventId: access.event.id,
        },
      });

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      const body = adminTaskUpdateBodySchema.parse(request.body);

      if (
        (body.type ?? task.type) === "SOCIAL_COMMENT" &&
        (body.platform ?? task.platform) === "FACEBOOK"
      ) {
        await syncEventFacebookConnectionFromSelection({
          eventId: access.event.id,
          pageId: body.facebookSourcePageId ?? null,
        });
      }

      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: toTaskUpdateData({
          body,
          currentTask: task,
        }),
      });

      await createDefaultQrCodeForStampTask(updatedTask);

      return updatedTask;
    },
  );

  app.delete<{ Params: { eventSlug: string; taskId: string } }>(
    "/admin/events/:eventSlug/tasks/:taskId",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const task = await prisma.task.findFirst({
        where: {
          id: request.params.taskId,
          eventId: access.event.id,
        },
      });

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      return prisma.task.update({
        where: { id: task.id },
        data: {
          isActive: false,
        },
      });
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/participants",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { participants: [] };
      }

      const sessions = await prisma.participantSession.findMany({
        where: {
          eventId: access.event.id,
        },
        include: {
          taskAttempts: true,
        },
        orderBy: { createdAt: "desc" },
      });

      return {
        participants: sessions.map(serializeAdminParticipant),
      };
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/leads",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { leads: [] };
      }

      return {
        leads: await loadLeads(access.event.slug),
      };
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/qr-codes",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { qrCodes: [] };
      }

      return {
        qrCodes: await loadQrCodes(access.event.id, access.event.slug),
      };
    },
  );

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/qr-codes",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "EDITOR",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const body = adminQrCodeCreateBodySchema.parse(request.body);
      const task = await prisma.task.findFirst({
        where: {
          id: body.taskId,
          eventId: access.event.id,
          type: "STAMP_SCAN",
        },
      });

      if (!task) {
        reply.code(404);

        return {
          message: "Stamp scan task not found.",
        };
      }

      const token = randomBytes(24).toString("base64url");
      const qrCode = await prisma.qrCode.create({
        data: {
          eventId: access.event.id,
          taskId: task.id,
          label: body.label ?? task.title,
          publicToken: token,
          tokenHash: hashQrToken(token),
          validFrom: parseOptionalDate(body.validFrom),
          validUntil: parseOptionalDate(body.validUntil),
          scanLimitPerSession: body.scanLimitPerSession,
          cooldownSeconds: body.cooldownSeconds ?? null,
          isActive: body.isActive,
        },
        include: {
          task: true,
        },
      });

      reply.code(201);

      return {
        id: qrCode.id,
        label: qrCode.label,
        taskId: qrCode.taskId,
        taskTitle: qrCode.task.title,
        taskType: qrCode.task.type,
        scanUrl: `/${encodeURIComponent(access.event.slug)}/scan/${encodeURIComponent(
          token,
        )}`,
        isActive: qrCode.isActive,
        isRunning: getQrCodeRunningState(qrCode),
        validFrom: serializeDate(qrCode.validFrom),
        validUntil: serializeDate(qrCode.validUntil),
        scanLimitPerSession: qrCode.scanLimitPerSession,
        cooldownSeconds: qrCode.cooldownSeconds,
        createdAt: qrCode.createdAt.toISOString(),
        updatedAt: qrCode.updatedAt.toISOString(),
        scanCounts: emptyQrScanCounts(),
      };
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/rewards",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? { message: "Admin authentication required." };
      }

      const sessions = await prisma.participantSession.findMany({
        where: {
          eventId: access.event.id,
        },
        include: {
          taskAttempts: true,
        },
        orderBy: { verifiedPoints: "desc" },
      });
      const participants = sessions.map(serializeAdminParticipant);
      const eventSettings = eventSettingsSchema.safeParse(
        access.event.settingsJson,
      );
      const rewardTiers = eventSettings.success
        ? eventSettings.data.rewardTiers
        : [];

      return {
        instantRewardEligibleCount: participants.filter(
          (participant) => participant.instantRewardEligible,
        ).length,
        dailyDrawEligibleCount: participants.filter(
          (participant) => participant.dailyDrawEligible,
        ).length,
        tierCounts: rewardTiers.map((tier) => ({
          ...tier,
          claimedCount: participants.filter(
            (participant) => participant.claimedPoints >= tier.threshold,
          ).length,
          verifiedCount: participants.filter(
            (participant) => participant.verifiedPoints >= tier.threshold,
          ).length,
        })),
        eligibleParticipants: {
          instantReward: participants.filter(
            (participant) => participant.instantRewardEligible,
          ),
          dailyDraw: participants.filter(
            (participant) => participant.dailyDrawEligible,
          ),
        },
      };
    },
  );

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/export.csv",
    async (request, reply) => {
      const access = await requireEventAccess({
        eventSlug: request.params.eventSlug,
        minRole: "VIEWER",
        reply,
        request,
      });

      if (!access || "message" in access) {
        return access ?? unauthorized(reply);
      }

      const leads = await loadLeads(access.event.slug);
      const csv = toCsv([
        [
          "verificationCode",
          "name",
          "email",
          "optIn",
          "submittedTask",
          "status",
          "submittedAt",
        ],
        ...leads.map((lead) => [
          lead.verificationCode,
          lead.name,
          lead.email,
          lead.optIn,
          lead.submittedTask,
          lead.status,
          lead.submittedAt,
        ]),
      ]);

      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="${access.event.slug}-leads.csv"`,
        );

      return `${csv}\n`;
    },
  );
}
