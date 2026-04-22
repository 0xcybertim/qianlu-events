import { createHash, randomBytes } from "node:crypto";

import { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Prisma, type AdminRole } from "@prisma/client";
import { ADMIN_SESSION_COOKIE_NAME } from "@qianlu-events/config";
import {
  getFacebookCommentTaskConfig,
  getInstagramCommentTaskConfig,
  getSocialCommentTaskConfig,
  getSocialCommentTargetId,
  matchesFacebookCommentText,
  matchesSocialCommentText,
  normalizeCommentText,
} from "@qianlu-events/domain";
import {
  adminAuthLoginBodySchema,
  adminFacebookConnectionSelectBodySchema,
  adminEventCreateBodySchema,
  adminFacebookConnectionUpsertBodySchema,
  adminEventUpdateBodySchema,
  adminInstagramConnectionSelectBodySchema,
  adminInstagramConnectionUpsertBodySchema,
  adminQrCodeCreateBodySchema,
  adminTaskCreateBodyWithFacebookSourceSchema,
  adminTaskUpdateBodySchema,
  eventSettingsSchema,
  facebookCommentTaskConfigSchema,
  instagramCommentTaskConfigSchema,
  taskConfigSchema,
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
  fetchFacebookPostComments,
  fetchFacebookPagePosts,
  fetchFacebookGrantedPermissions,
  fetchFacebookManagedPages,
} from "../lib/facebook.js";
import {
  fetchInstagramAccountMedia,
  fetchInstagramMediaComments,
  fetchInstagramProfessionalAccounts,
  subscribeInstagramAccountToWebhooks,
} from "../lib/instagram.js";
import { prisma } from "../lib/prisma.js";
import { recalculateEventSessions } from "../lib/session-state.js";

const leadTaskTypes = [
  "LEAD_FORM",
  "QUIZ",
  "NEWSLETTER_OPT_IN",
  "WHATSAPP_OPT_IN",
] as const;

function parseSocialCommentTaskConfig(task: {
  configJson?: Prisma.JsonValue | null;
  platform: string;
  type: string;
}) {
  if (task.type !== "SOCIAL_COMMENT") {
    return null;
  }

  if (task.platform === "FACEBOOK") {
    return facebookCommentTaskConfigSchema.parse(task.configJson ?? null);
  }

  if (task.platform === "INSTAGRAM") {
    return instagramCommentTaskConfigSchema.parse(task.configJson ?? null);
  }

  return null;
}

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
    instagramConnection: true;
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
      instagramConnection: true,
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

function getProofRecord(proofJson: unknown, key: string) {
  const proof = getProofObject(proofJson);
  const value = proof?.[key];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeLeadAnswerValue(value: unknown) {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    const values = value.filter(
      (entry): entry is string => typeof entry === "string" && entry.length > 0,
    );

    return values.length > 0 ? values : null;
  }

  return null;
}

function buildLeadSubmissionDetails(args: {
  proofJson: unknown;
  taskConfig: unknown;
}) {
  const parsedConfig = taskConfigSchema.safeParse(args.taskConfig ?? null);
  const responses = getProofRecord(args.proofJson, "responses");
  const otherResponses = getProofRecord(args.proofJson, "otherResponses");
  const groupSelections = getProofRecord(args.proofJson, "groupSelections");

  if (!parsedConfig.success) {
    return {
      answers: [],
      selectedInterests: [],
    };
  }

  const selectedInterests =
    parsedConfig.data.formGroups
      ?.filter((group) => groupSelections[group.id] === true)
      .map((group) => group.title) ?? [];

  const questions = [
    ...(parsedConfig.data.formQuestions ?? []).map((question) => ({
      groupTitle: null,
      question,
    })),
    ...(parsedConfig.data.formGroups ?? []).flatMap((group) =>
      group.questions.map((question) => ({
        groupTitle: group.title,
        question,
      })),
    ),
  ];

  const answers = questions.flatMap(({ groupTitle, question }) => {
    const value = normalizeLeadAnswerValue(responses[question.id]);
    const otherValue =
      typeof otherResponses[question.id] === "string"
        ? otherResponses[question.id]
        : null;

    if (value === null && !otherValue) {
      return [];
    }

    return [
      {
        id: question.id,
        label: question.label,
        groupTitle,
        value,
        otherValue,
      },
    ];
  });

  return {
    answers,
    selectedInterests,
  };
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

function normalizeTaskComparisonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTaskComparisonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeTaskComparisonValue(entry)]),
    );
  }

  if (typeof value === "string") {
    return value.trim();
  }

  return value ?? null;
}

type ComparableTaskDefinition = {
  configJson: unknown;
  description: string;
  platform: string;
  points: number;
  requiresVerification: boolean;
  title: string;
  type: string;
  verificationType: string;
};

function serializeComparableTaskDefinition(task: ComparableTaskDefinition) {
  return JSON.stringify(normalizeTaskComparisonValue(task));
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
  const socialCommentConfig = parseSocialCommentTaskConfig(body);

  return {
    eventId,
    title: body.title,
    description: body.description,
    type: body.type,
    platform: body.platform,
    points: body.points,
    sortOrder: body.sortOrder,
    isActive: body.isActive,
    requiresVerification: socialCommentConfig ? true : body.requiresVerification,
    verificationType: socialCommentConfig ? "AUTOMATIC" : body.verificationType,
    configJson: (socialCommentConfig ?? body.configJson) ?? Prisma.JsonNull,
  } satisfies Prisma.TaskUncheckedCreateInput;
}

function toComparableTaskDefinitionForCreate(
  body: z.infer<typeof adminTaskCreateBodyWithFacebookSourceSchema>,
): ComparableTaskDefinition {
  const socialCommentConfig = parseSocialCommentTaskConfig(body);

  return {
    configJson: (socialCommentConfig ?? body.configJson) ?? null,
    description: body.description.trim(),
    platform: body.platform,
    points: body.points,
    requiresVerification: socialCommentConfig ? true : body.requiresVerification,
    title: body.title.trim(),
    type: body.type,
    verificationType: socialCommentConfig ? "AUTOMATIC" : body.verificationType,
  };
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
  const socialCommentConfig = parseSocialCommentTaskConfig({
    configJson: body.configJson ?? currentTask.configJson ?? null,
    platform: body.platform ?? currentTask.platform,
    type: body.type ?? currentTask.type,
  });

  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.type !== undefined) data.type = body.type;
  if (body.platform !== undefined) data.platform = body.platform;
  if (body.points !== undefined) data.points = body.points;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.requiresVerification !== undefined) {
    data.requiresVerification = socialCommentConfig ? true : body.requiresVerification;
  }
  if (body.verificationType !== undefined) {
    data.verificationType = socialCommentConfig
      ? "AUTOMATIC"
      : body.verificationType;
  }
  if (body.configJson !== undefined) {
    data.configJson =
      (socialCommentConfig ?? body.configJson) ?? Prisma.JsonNull;
  } else if (socialCommentConfig) {
    data.configJson = socialCommentConfig;
  }
  if (socialCommentConfig) data.requiresVerification = true;
  if (socialCommentConfig) data.verificationType = "AUTOMATIC";

  return data;
}

function toComparableTaskDefinitionForUpdate(args: {
  body: z.infer<typeof adminTaskUpdateBodySchema>;
  currentTask: {
    configJson: Prisma.JsonValue | null;
    description: string;
    platform: string;
    points: number;
    requiresVerification: boolean;
    title: string;
    type: string;
    verificationType: string;
  };
}) {
  const { body, currentTask } = args;
  const merged = {
    configJson: body.configJson ?? currentTask.configJson,
    description: body.description ?? currentTask.description,
    platform: body.platform ?? currentTask.platform,
    points: body.points ?? currentTask.points,
    requiresVerification:
      body.requiresVerification ?? currentTask.requiresVerification,
    title: body.title ?? currentTask.title,
    type: body.type ?? currentTask.type,
    verificationType: body.verificationType ?? currentTask.verificationType,
  };
  const socialCommentConfig = parseSocialCommentTaskConfig({
    configJson: merged.configJson ?? null,
    platform: merged.platform,
    type: merged.type,
  });

  return {
    configJson: (socialCommentConfig ?? merged.configJson) ?? null,
    description: merged.description.trim(),
    platform: merged.platform,
    points: merged.points,
    requiresVerification: socialCommentConfig ? true : merged.requiresVerification,
    title: merged.title.trim(),
    type: merged.type,
    verificationType: socialCommentConfig ? "AUTOMATIC" : merged.verificationType,
  } satisfies ComparableTaskDefinition;
}

function toComparableTaskDefinitionFromExisting(task: {
  configJson: Prisma.JsonValue | null;
  description: string;
  platform: string;
  points: number;
  requiresVerification: boolean;
  title: string;
  type: string;
  verificationType: string;
}) {
  return {
    configJson: task.configJson,
    description: task.description.trim(),
    platform: task.platform,
    points: task.points,
    requiresVerification: task.requiresVerification,
    title: task.title.trim(),
    type: task.type,
    verificationType: task.verificationType,
  } satisfies ComparableTaskDefinition;
}

async function findDuplicateTaskForEvent(args: {
  eventId: string;
  excludeTaskId?: string;
  candidate: ComparableTaskDefinition;
}) {
  const signature = serializeComparableTaskDefinition(args.candidate);
  const tasks = await prisma.task.findMany({
    where: {
      eventId: args.eventId,
      ...(args.excludeTaskId
        ? {
            id: {
              not: args.excludeTaskId,
            },
          }
        : {}),
    },
    select: {
      configJson: true,
      description: true,
      id: true,
      platform: true,
      points: true,
      requiresVerification: true,
      title: true,
      type: true,
      verificationType: true,
    },
  });

  return (
    tasks.find(
      (task) =>
        serializeComparableTaskDefinition(
          toComparableTaskDefinitionFromExisting(task),
        ) === signature,
    ) ?? null
  );
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

async function findTaskWithDuplicateCommentPrefix(args: {
  eventId: string;
  excludeTaskId?: string;
  taskConfig: Prisma.JsonValue | null;
  taskPlatform: string;
  taskType: string;
}) {
  const candidateConfig = getSocialCommentTaskConfig({
    configJson: args.taskConfig,
    platform: args.taskPlatform,
    type: args.taskType,
  });

  if (!candidateConfig) {
    return null;
  }

  const tasks = await prisma.task.findMany({
    where: {
      eventId: args.eventId,
      ...(args.excludeTaskId
        ? {
            id: {
              not: args.excludeTaskId,
            },
          }
        : {}),
    },
    select: {
      configJson: true,
      id: true,
      platform: true,
      title: true,
      type: true,
    },
  });

  const normalizedCandidatePrefix = normalizeCommentText(
    candidateConfig.requiredPrefix,
  );

  return (
    tasks.find((task) => {
      const taskConfig = getSocialCommentTaskConfig(task);

      if (!taskConfig) {
        return false;
      }

      return (
        normalizeCommentText(taskConfig.requiredPrefix) ===
        normalizedCandidatePrefix
      );
    }) ?? null
  );
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
    instagramConnection: event.instagramConnection
      ? {
          pageId: event.instagramConnection.pageId,
          pageName: event.instagramConnection.pageName,
          instagramAccountId: event.instagramConnection.instagramAccountId,
          instagramUsername: event.instagramConnection.instagramUsername,
          hasAccessToken: event.instagramConnection.accessToken.length > 0,
          tokenHint:
            event.instagramConnection.accessToken.length >= 6
              ? event.instagramConnection.accessToken.slice(-6)
              : "set",
          tokenExpiresAt:
            event.instagramConnection.tokenExpiresAt?.toISOString() ?? null,
          updatedAt: event.instagramConnection.updatedAt.toISOString(),
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

const instagramPendingAccountOptionSchema = z.object({
  accessToken: z.string().min(1),
  instagramAccountId: z.string(),
  instagramUsername: z.string().nullable(),
  pageId: z.string(),
  pageName: z.string(),
});

const instagramOauthStoredDebugSchema = z.object({
  rawPages: z
    .array(
      z.object({
        error: z.string().nullable(),
        hasInstagramAccount: z.boolean().default(false),
        hasPageAccessToken: z.boolean().default(false),
        instagramAccountId: z.string().nullable(),
        instagramUsername: z.string().nullable(),
        pageId: z.string().nullable(),
        pageName: z.string().nullable(),
        tokenHint: z.string().nullable(),
      }),
    )
    .default([]),
  usableAccounts: z.array(instagramPendingAccountOptionSchema).default([]),
  warnings: z.array(z.string()).default([]),
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

function getInstagramOAuthRedirectUri() {
  return `${getApiBaseUrl()}/admin/integrations/instagram/callback`;
}

function buildAdminEventTasksUrl(
  eventSlug: string,
  facebookConnect?: string,
  instagramConnect?: string,
) {
  const url = new URL(
    `/admin/events/${encodeURIComponent(eventSlug)}/tasks`,
    getWebBaseUrl(),
  );

  if (facebookConnect) {
    url.searchParams.set("facebookConnect", facebookConnect);
  }

  if (instagramConnect) {
    url.searchParams.set("instagramConnect", instagramConnect);
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

function parseInstagramOauthStoredDebug(value: Prisma.JsonValue | null) {
  const result = instagramOauthStoredDebugSchema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  return {
    rawPages: [],
    usableAccounts: [],
    warnings: [],
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

function serializePendingInstagramConnection(
  state: {
    accountOptionsJson: Prisma.JsonValue | null;
    expiresAt: Date;
  } | null,
) {
  if (!state) {
    return null;
  }

  const accounts = parseInstagramOauthStoredDebug(
    state.accountOptionsJson,
  ).usableAccounts;

  if (accounts.length === 0) {
    return null;
  }

  return {
    accounts: accounts.map((account) => ({
      instagramAccountId: account.instagramAccountId,
      instagramUsername: account.instagramUsername,
      pageId: account.pageId,
      pageName: account.pageName,
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

function serializeInstagramOauthDebugState(
  state: {
    accountOptionsJson: Prisma.JsonValue | null;
    consumedAt: Date | null;
    createdAt: Date;
    expiresAt: Date;
    state: string;
  } | null,
) {
  if (!state) {
    return null;
  }

  const parsed = parseInstagramOauthStoredDebug(state.accountOptionsJson);

  return {
    accounts: parsed.usableAccounts.map((account) => ({
      instagramAccountId: account.instagramAccountId,
      instagramUsername: account.instagramUsername,
      pageId: account.pageId,
      pageName: account.pageName,
    })),
    consumedAt: state.consumedAt?.toISOString() ?? null,
    createdAt: state.createdAt.toISOString(),
    expiresAt: state.expiresAt.toISOString(),
    rawPages: parsed.rawPages,
    state: state.state,
    warnings: parsed.warnings,
  };
}

async function loadLatestUsableFacebookPagesForEvent(eventId: string) {
  const state = await findLatestFacebookOauthStateForEvent(eventId);

  return parseFacebookOauthStoredDebug(state?.pageOptionsJson ?? null).usablePages;
}

async function loadLatestUsableInstagramAccountsForEvent(eventId: string) {
  const state = await findLatestInstagramOauthStateForEvent(eventId);

  return parseInstagramOauthStoredDebug(
    state?.accountOptionsJson ?? null,
  ).usableAccounts;
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

async function syncEventInstagramConnectionFromSelection(args: {
  eventId: string;
  instagramAccountId?: string | null;
}) {
  if (!args.instagramAccountId) {
    return;
  }

  const usableAccounts = await loadLatestUsableInstagramAccountsForEvent(args.eventId);
  const selectedAccount = usableAccounts.find(
    (account) => account.instagramAccountId === args.instagramAccountId,
  );

  if (!selectedAccount) {
    throw new Error(
      "Selected Instagram professional account is no longer available from the latest OAuth session.",
    );
  }

  await prisma.eventInstagramConnection.upsert({
    where: {
      eventId: args.eventId,
    },
    update: {
      accessToken: selectedAccount.accessToken,
      instagramAccountId: selectedAccount.instagramAccountId,
      instagramUsername: selectedAccount.instagramUsername,
      pageId: selectedAccount.pageId,
      pageName: selectedAccount.pageName,
      tokenExpiresAt: null,
    },
    create: {
      accessToken: selectedAccount.accessToken,
      eventId: args.eventId,
      instagramAccountId: selectedAccount.instagramAccountId,
      instagramUsername: selectedAccount.instagramUsername,
      pageId: selectedAccount.pageId,
      pageName: selectedAccount.pageName,
    },
  });

  await subscribeInstagramAccountToWebhooks(selectedAccount.accessToken, [
    "comments",
  ]);
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

async function findPendingInstagramOauthState(args: {
  adminAccountId: string;
  eventId: string;
}) {
  return prisma.adminInstagramOAuthState.findFirst({
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

async function findLatestInstagramOauthStateForEvent(eventId: string) {
  return prisma.adminInstagramOAuthState.findFirst({
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

  return attempts.map((attempt) => {
    const submissionDetails = buildLeadSubmissionDetails({
      proofJson: attempt.proofJson,
      taskConfig: attempt.task.configJson,
    });

    return {
      id: attempt.id,
      verificationCode: attempt.participantSession.verificationCode,
      name: attempt.participantSession.name,
      email: attempt.participantSession.email,
      optIn: getProofBoolean(attempt.proofJson, "optIn"),
      submittedTask: attempt.task.title,
      submittedTaskId: attempt.taskId,
      status: attempt.status,
      submittedAt: serializeDate(attempt.claimedAt ?? attempt.updatedAt),
      selectedInterests: submissionDetails.selectedInterests,
      answers: submissionDetails.answers,
      proofJson: attempt.proofJson,
    };
  });
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
        instagramConnection: true,
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
          instagramConnection: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      await recalculateEventSessions(access.event.id);

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
        let liveComments: Awaited<ReturnType<typeof fetchFacebookPostComments>> = [];
        let liveLookupError: string | null = null;

        if (access.event.facebookConnection?.pageAccessToken) {
          try {
            liveComments = await fetchFacebookPostComments(
              config.facebookPostId,
              access.event.facebookConnection.pageAccessToken,
            );
          } catch (error) {
            liveLookupError =
              error instanceof Error
                ? error.message
                : "Could not fetch Facebook comments for this post.";
          }
        } else {
          liveLookupError = "No connected Page access token is available for this event.";
        }

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
          liveCommentCount: liveComments.length,
          liveComments: liveComments.map((comment) => {
            const matchingAttempts = recentAttempts.filter((attempt) => {
              const expectedCommentText = getProofString(
                attempt.proofJson,
                "expectedCommentText",
              );

              return Boolean(
                comment.message &&
                  expectedCommentText &&
                  matchesFacebookCommentText({
                    actualCommentText: comment.message,
                    expectedCommentText,
                  }),
              );
            });

            return {
              commentId: comment.id,
              createdAt: comment.created_time ?? null,
              matchingAttemptIds: matchingAttempts.map((attempt) => attempt.id),
              matchingExpectedCommentTexts: matchingAttempts
                .map((attempt) =>
                  getProofString(attempt.proofJson, "expectedCommentText"),
                )
                .filter((value): value is string => Boolean(value)),
              matchingVerificationCodes: matchingAttempts.map(
                (attempt) => attempt.participantSession.verificationCode,
              ),
              message: comment.message ?? null,
              normalizedMessage:
                typeof comment.message === "string"
                  ? normalizeCommentText(comment.message)
                  : null,
              parentId: comment.parent?.id ?? null,
            };
          }),
          liveLookupError,
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
  }>("/admin/events/:eventSlug/instagram-comment-debug", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "VIEWER",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { tasks: [] };
    }

    const instagramTasks = access.event.tasks
      .map((task) => ({
        config: getInstagramCommentTaskConfig(task),
        task,
      }))
      .filter(
        (
          entry,
        ): entry is {
          config: NonNullable<ReturnType<typeof getInstagramCommentTaskConfig>>;
          task: (typeof access.event.tasks)[number];
        } =>
          Boolean(
            entry.config &&
              entry.task.type === "SOCIAL_COMMENT" &&
              entry.task.platform === "INSTAGRAM" &&
              entry.config.autoVerify,
          ),
      );

    const tasks = await Promise.all(
      instagramTasks.map(async ({ config, task }) => {
        const [
          pendingAttemptCount,
          verifiedAttemptCount,
          unmatchedCommentCount,
          recentAttempts,
          recentComments,
        ] = await Promise.all([
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
              externalPostId: config.instagramMediaId,
              matched: false,
              platform: "INSTAGRAM",
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
              platform: "INSTAGRAM",
              OR: [
                {
                  externalPostId: config.instagramMediaId,
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
        let liveComments: Awaited<ReturnType<typeof fetchInstagramMediaComments>> = [];
        let liveLookupError: string | null = null;

        if (access.event.instagramConnection?.accessToken) {
          try {
            liveComments = await fetchInstagramMediaComments(
              config.instagramMediaId,
              access.event.instagramConnection.accessToken,
            );
          } catch (error) {
            liveLookupError =
              error instanceof Error
                ? error.message
                : "Could not fetch Instagram comments for this media.";
          }
        } else {
          liveLookupError =
            "No connected Instagram access token is available for this event.";
        }

        return {
          autoVerify: config.autoVerify,
          connectedInstagramAccountId:
            access.event.instagramConnection?.instagramAccountId ?? null,
          connectedInstagramUsername:
            access.event.instagramConnection?.instagramUsername ?? null,
          connectedPageId: access.event.instagramConnection?.pageId ?? null,
          connectedPageName: access.event.instagramConnection?.pageName ?? null,
          instagramMediaId: config.instagramMediaId,
          liveCommentCount: liveComments.length,
          liveComments: liveComments.map((comment) => {
            const matchingAttempts = recentAttempts.filter((attempt) => {
              const expectedCommentText = getProofString(
                attempt.proofJson,
                "expectedCommentText",
              );

              return Boolean(
                comment.text &&
                  expectedCommentText &&
                  matchesSocialCommentText({
                    actualCommentText: comment.text,
                    expectedCommentText,
                  }),
              );
            });

            return {
              commentId: comment.id,
              createdAt: comment.timestamp ?? null,
              matchingAttemptIds: matchingAttempts.map((attempt) => attempt.id),
              matchingExpectedCommentTexts: matchingAttempts
                .map((attempt) =>
                  getProofString(attempt.proofJson, "expectedCommentText"),
                )
                .filter((value): value is string => Boolean(value)),
              matchingVerificationCodes: matchingAttempts.map(
                (attempt) => attempt.participantSession.verificationCode,
              ),
              message: comment.text ?? null,
              normalizedMessage:
                typeof comment.text === "string"
                  ? normalizeCommentText(comment.text)
                  : null,
              parentId: comment.parent_id ?? null,
              username: comment.username ?? null,
            };
          }),
          liveLookupError,
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

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/instagram-media-options", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "VIEWER",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { account: null, error: null, media: [] };
    }

    if (!access.event.instagramConnection?.accessToken) {
      return {
        account: access.event.instagramConnection
          ? {
              instagramAccountId: access.event.instagramConnection.instagramAccountId,
              instagramUsername: access.event.instagramConnection.instagramUsername,
              pageId: access.event.instagramConnection.pageId,
              pageName: access.event.instagramConnection.pageName,
            }
          : null,
        error:
          "Run Instagram connect once before selecting a professional account and media.",
        media: [],
      };
    }

    try {
      const media = await fetchInstagramAccountMedia(
        access.event.instagramConnection.instagramAccountId,
        access.event.instagramConnection.accessToken,
      );

      return {
        account: {
          instagramAccountId: access.event.instagramConnection.instagramAccountId,
          instagramUsername: access.event.instagramConnection.instagramUsername,
          pageId: access.event.instagramConnection.pageId,
          pageName: access.event.instagramConnection.pageName,
        },
        error: null,
        media: media.map((item) => ({
          captionPreview:
            (item.caption ?? "").trim().slice(0, 140) || `Instagram media ${item.id}`,
          mediaId: item.id,
          mediaType: item.media_type ?? null,
          permalink: item.permalink ?? null,
          timestamp: item.timestamp ?? null,
        })),
      };
    } catch (error) {
      request.log.warn(
        {
          error,
          eventId: access.event.id,
          instagramAccountId: access.event.instagramConnection.instagramAccountId,
        },
        "Could not load Instagram media options for admin task form.",
      );

      return {
        account: {
          instagramAccountId: access.event.instagramConnection.instagramAccountId,
          instagramUsername: access.event.instagramConnection.instagramUsername,
          pageId: access.event.instagramConnection.pageId,
          pageName: access.event.instagramConnection.pageName,
        },
        error:
          error instanceof Error
            ? error.message
            : "Could not load recent Instagram media for the connected account.",
        media: [],
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
          instagramConnection: true,
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
          instagramConnection: true,
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

  app.get<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/instagram-oauth/start",
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

      await prisma.adminInstagramOAuthState.updateMany({
        where: {
          adminAccountId: access.account.id,
          consumedAt: null,
          eventId: access.event.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      await prisma.adminInstagramOAuthState.create({
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
            redirectUri: getInstagramOAuthRedirectUri(),
            state,
          }),
        );
      } catch (error) {
        request.log.error({ error }, "Could not start Instagram OAuth flow.");
        reply.code(400);

        return {
          message: "Meta OAuth is not configured on the server.",
        };
      }
    },
  );

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/instagram-connection/pending", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "EDITOR",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { message: "Admin authentication required." };
    }

    const state = await findPendingInstagramOauthState({
      adminAccountId: access.account.id,
      eventId: access.event.id,
    });

    return serializePendingInstagramConnection(state);
  });

  app.get<{
    Params: { eventSlug: string };
  }>("/admin/events/:eventSlug/instagram-connection/debug", async (request, reply) => {
    const access = await requireEventAccess({
      eventSlug: request.params.eventSlug,
      minRole: "EDITOR",
      reply,
      request,
    });

    if (!access || "message" in access) {
      return access ?? { message: "Admin authentication required." };
    }

    return serializeInstagramOauthDebugState(
      await findLatestInstagramOauthStateForEvent(access.event.id),
    );
  });

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/instagram-connection/select",
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

      const body = adminInstagramConnectionSelectBodySchema.parse(request.body);
      const state = await findPendingInstagramOauthState({
        adminAccountId: access.account.id,
        eventId: access.event.id,
      });

      if (!state) {
        reply.code(404);

        return {
          message:
            "No pending Instagram professional account selection was found for this event.",
        };
      }

      const selectedAccount = parseInstagramOauthStoredDebug(
        state.accountOptionsJson,
      ).usableAccounts.find(
        (account) => account.instagramAccountId === body.instagramAccountId,
      );

      if (!selectedAccount) {
        reply.code(400);

        return {
          message:
            "The selected Instagram professional account is no longer available.",
        };
      }

      await prisma.$transaction([
        prisma.eventInstagramConnection.upsert({
          where: {
            eventId: access.event.id,
          },
          update: {
            accessToken: selectedAccount.accessToken,
            instagramAccountId: selectedAccount.instagramAccountId,
            instagramUsername: selectedAccount.instagramUsername,
            pageId: selectedAccount.pageId,
            pageName: selectedAccount.pageName,
            tokenExpiresAt: null,
          },
          create: {
            accessToken: selectedAccount.accessToken,
            eventId: access.event.id,
            instagramAccountId: selectedAccount.instagramAccountId,
            instagramUsername: selectedAccount.instagramUsername,
            pageId: selectedAccount.pageId,
            pageName: selectedAccount.pageName,
          },
        }),
        prisma.adminInstagramOAuthState.update({
          where: {
            id: state.id,
          },
          data: {
            consumedAt: new Date(),
          },
        }),
      ]);

      try {
        await subscribeInstagramAccountToWebhooks(selectedAccount.accessToken, [
          "comments",
        ]);
      } catch (error) {
        request.log.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            eventId: access.event.id,
            instagramAccountId: selectedAccount.instagramAccountId,
          },
          "Could not subscribe Instagram account to webhook comments field.",
        );
      }

      const event = await prisma.event.findUnique({
        where: { id: access.event.id },
        include: {
          facebookConnection: true,
          instagramConnection: true,
          tasks: {
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          },
        },
      });

      return serializeAdminEventDetail(event);
    },
  );

  app.post<{ Params: { eventSlug: string } }>(
    "/admin/events/:eventSlug/instagram-connection",
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

      const body = adminInstagramConnectionUpsertBodySchema.parse(request.body);
      const existingConnection = await prisma.eventInstagramConnection.findUnique({
        where: {
          eventId: access.event.id,
        },
      });

      if (!existingConnection && !body.accessToken) {
        reply.code(400);

        return {
          message:
            "An access token is required the first time you connect an Instagram professional account.",
        };
      }

      await prisma.eventInstagramConnection.upsert({
        where: {
          eventId: access.event.id,
        },
        update: {
          accessToken: body.accessToken ?? existingConnection?.accessToken ?? "",
          instagramAccountId: body.instagramAccountId,
          instagramUsername: body.instagramUsername ?? null,
          pageId: body.pageId,
          pageName: body.pageName ?? null,
          tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        },
        create: {
          accessToken: body.accessToken ?? "",
          eventId: access.event.id,
          instagramAccountId: body.instagramAccountId,
          instagramUsername: body.instagramUsername ?? null,
          pageId: body.pageId,
          pageName: body.pageName ?? null,
          tokenExpiresAt: body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        },
      });

      if (body.accessToken) {
        try {
          await subscribeInstagramAccountToWebhooks(body.accessToken, [
            "comments",
          ]);
        } catch (error) {
          request.log.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              eventId: access.event.id,
              instagramAccountId: body.instagramAccountId,
            },
            "Could not subscribe manual Instagram connection to webhook comments field.",
          );
        }
      }

      const event = await prisma.event.findUnique({
        where: { id: access.event.id },
        include: {
          facebookConnection: true,
          instagramConnection: true,
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
  }>("/admin/integrations/instagram/callback", async (request, reply) => {
    const stateValue = request.query.state;
    const oauthState = stateValue
      ? await prisma.adminInstagramOAuthState.findUnique({
          where: {
            state: stateValue,
          },
          include: {
            event: true,
          },
        })
      : null;

    const fallbackUrl = oauthState
      ? buildAdminEventTasksUrl(oauthState.event.slug, undefined, "connect-failed")
      : new URL("/admin/events", getWebBaseUrl()).toString();

    if (
      !oauthState ||
      oauthState.consumedAt ||
      oauthState.expiresAt <= new Date()
    ) {
      return reply.redirect(fallbackUrl);
    }

    if (request.query.error || !request.query.code) {
      await prisma.adminInstagramOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      return reply.redirect(
        buildAdminEventTasksUrl(
          oauthState.event.slug,
          undefined,
          "oauth-denied",
        ),
      );
    }

    try {
      const userAccessToken = await exchangeFacebookCodeForUserAccessToken({
        code: request.query.code,
        redirectUri: getInstagramOAuthRedirectUri(),
      });
      const {
        rawPages,
        usableAccounts,
        warnings,
      } = await fetchInstagramProfessionalAccounts(userAccessToken);

      await prisma.adminInstagramOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          accountOptionsJson: {
            rawPages,
            usableAccounts,
            warnings,
          } satisfies Prisma.InputJsonValue,
        },
      });

      if (usableAccounts.length === 0) {
        await prisma.adminInstagramOAuthState.update({
          where: {
            id: oauthState.id,
          },
          data: {
            consumedAt: new Date(),
          },
        });

        return reply.redirect(
          buildAdminEventTasksUrl(
            oauthState.event.slug,
            undefined,
            "no-accounts",
          ),
        );
      }

      if (usableAccounts.length === 1) {
        const selectedAccount = usableAccounts[0];

        await prisma.$transaction([
          prisma.eventInstagramConnection.upsert({
            where: {
              eventId: oauthState.eventId,
            },
            update: {
              accessToken: selectedAccount.accessToken,
              instagramAccountId: selectedAccount.instagramAccountId,
              instagramUsername: selectedAccount.instagramUsername,
              pageId: selectedAccount.pageId,
              pageName: selectedAccount.pageName,
              tokenExpiresAt: null,
            },
            create: {
              accessToken: selectedAccount.accessToken,
              eventId: oauthState.eventId,
              instagramAccountId: selectedAccount.instagramAccountId,
              instagramUsername: selectedAccount.instagramUsername,
              pageId: selectedAccount.pageId,
              pageName: selectedAccount.pageName,
            },
          }),
          prisma.adminInstagramOAuthState.update({
            where: {
              id: oauthState.id,
            },
            data: {
              consumedAt: new Date(),
            },
          }),
        ]);

        try {
          await subscribeInstagramAccountToWebhooks(selectedAccount.accessToken, [
            "comments",
          ]);
        } catch (error) {
          request.log.warn(
            {
              error: error instanceof Error ? error.message : String(error),
              eventId: oauthState.eventId,
              instagramAccountId: selectedAccount.instagramAccountId,
            },
            "Could not subscribe Instagram account after OAuth callback.",
          );
        }

        return reply.redirect(
          buildAdminEventTasksUrl(
            oauthState.event.slug,
            undefined,
            "connected",
          ),
        );
      }

      return reply.redirect(
        buildAdminEventTasksUrl(
          oauthState.event.slug,
          undefined,
          "select-account",
        ),
      );
    } catch (error) {
      request.log.error(
        {
          error: error instanceof Error ? error.message : String(error),
          eventId: oauthState.eventId,
          state: stateValue ?? null,
        },
        "Instagram OAuth callback failed.",
      );

      await prisma.adminInstagramOAuthState.update({
        where: {
          id: oauthState.id,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      return reply.redirect(
        buildAdminEventTasksUrl(
          oauthState.event.slug,
          undefined,
          "connect-failed",
        ),
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

      const duplicateCommentPrefix = await findTaskWithDuplicateCommentPrefix({
        eventId: access.event.id,
        taskConfig: body.configJson ?? null,
        taskPlatform: body.platform,
        taskType: body.type,
      });

      if (duplicateCommentPrefix) {
        reply.code(409);

        return {
          message:
            `Required prefix is already used by "${duplicateCommentPrefix.title}". Use a unique prefix for each social comment task.`,
        };
      }

      if (body.type === "SOCIAL_COMMENT" && body.platform === "FACEBOOK") {
        await syncEventFacebookConnectionFromSelection({
          eventId: access.event.id,
          pageId: body.facebookSourcePageId ?? null,
        });
      }

      if (body.type === "SOCIAL_COMMENT" && body.platform === "INSTAGRAM") {
        await syncEventInstagramConnectionFromSelection({
          eventId: access.event.id,
          instagramAccountId: body.instagramSourceAccountId ?? null,
        });
      }

      const duplicateTask = await findDuplicateTaskForEvent({
        candidate: toComparableTaskDefinitionForCreate(body),
        eventId: access.event.id,
      });

      if (duplicateTask) {
        reply.code(409);

        return {
          message: `An identical task already exists for this event: ${duplicateTask.title}.`,
        };
      }

      const task = await prisma.task.create({
        data: toTaskCreateData(access.event.id, body),
      });

      await createDefaultQrCodeForStampTask(task);
      await recalculateEventSessions(access.event.id);

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

      const mergedType = body.type ?? task.type;
      const mergedPlatform = body.platform ?? task.platform;
      const mergedConfigJson = body.configJson ?? task.configJson ?? null;
      const duplicateCommentPrefix = await findTaskWithDuplicateCommentPrefix({
        eventId: access.event.id,
        excludeTaskId: task.id,
        taskConfig: mergedConfigJson,
        taskPlatform: mergedPlatform,
        taskType: mergedType,
      });

      if (duplicateCommentPrefix) {
        reply.code(409);

        return {
          message:
            `Required prefix is already used by "${duplicateCommentPrefix.title}". Use a unique prefix for each social comment task.`,
        };
      }

      if (
        mergedType === "SOCIAL_COMMENT" &&
        mergedPlatform === "FACEBOOK"
      ) {
        await syncEventFacebookConnectionFromSelection({
          eventId: access.event.id,
          pageId: body.facebookSourcePageId ?? null,
        });
      }

      if (
        mergedType === "SOCIAL_COMMENT" &&
        mergedPlatform === "INSTAGRAM"
      ) {
        await syncEventInstagramConnectionFromSelection({
          eventId: access.event.id,
          instagramAccountId: body.instagramSourceAccountId ?? null,
        });
      }

      const duplicateTask = await findDuplicateTaskForEvent({
        candidate: toComparableTaskDefinitionForUpdate({
          body,
          currentTask: task,
        }),
        eventId: access.event.id,
        excludeTaskId: task.id,
      });

      if (duplicateTask) {
        reply.code(409);

        return {
          message: `Another identical task already exists for this event: ${duplicateTask.title}.`,
        };
      }

      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: toTaskUpdateData({
          body,
          currentTask: task,
        }),
      });

      await createDefaultQrCodeForStampTask(updatedTask);
      await recalculateEventSessions(access.event.id);

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

      const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: {
          isActive: false,
        },
      });

      await recalculateEventSessions(access.event.id);

      return updatedTask;
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
          rewardEligibility: true,
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
      const configuredInstantRewards = eventSettings.success
        ? eventSettings.data.instantRewards
        : [];
      const taskInstantRewards = configuredInstantRewards.map((reward) => {
          const linkedTasks = reward.taskIds.flatMap((taskId) => {
            const task = access.event.tasks.find((entry) => entry.id === taskId);

            return task
              ? [
                  {
                    id: task.id,
                    title: task.title,
                  },
                ]
              : [];
          });
          const eligibleParticipants = sessions
            .filter((session) =>
              session.rewardEligibility.some(
                (eligibility) =>
                  eligibility.rewardType === "INSTANT_REWARD" &&
                  eligibility.rewardKey === reward.key &&
                  eligibility.eligible,
              ),
            )
            .map(serializeAdminParticipant);
          const verifiedParticipants = sessions
            .filter((session) =>
              session.rewardEligibility.some(
                (eligibility) =>
                  eligibility.rewardType === "INSTANT_REWARD" &&
                  eligibility.rewardKey === reward.key &&
                  eligibility.verified,
              ),
            )
            .map(serializeAdminParticipant);

          return {
            rewardKey: reward.key,
            label: reward.label,
            description: reward.description ?? null,
            taskMatchMode: reward.taskMatchMode,
            linkedTasks,
            eligibleCount: eligibleParticipants.length,
            verifiedCount: verifiedParticipants.length,
            eligibleParticipants,
            verifiedParticipants,
          };
        });

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
        taskInstantRewards,
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
