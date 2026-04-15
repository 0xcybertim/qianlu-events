import { type Prisma } from "@prisma/client";
import {
  buildFacebookCommentText,
  buildSocialCommentText,
  extractVerificationCodeFromFacebookComment,
  extractVerificationCodeFromSocialComment,
  getFacebookCommentTaskConfig,
  getSocialCommentTargetId,
  getSocialCommentTaskConfig,
  isAutoVerifiableSocialCommentTask as isAutoVerifiableSocialCommentTaskDomain,
  isSupportedSocialCommentPlatform,
  matchesFacebookCommentText,
  matchesSocialCommentText,
  type SupportedSocialCommentPlatform,
} from "@qianlu-events/domain";

import {
  enrichFacebookCommentEvent,
  fetchFacebookPostComments,
  type FacebookCommentEvent,
} from "./facebook.js";
import {
  enrichInstagramCommentEvent,
  fetchInstagramMediaComments,
  type InstagramCommentEvent,
} from "./instagram.js";
import { prisma } from "./prisma.js";
import { recalculateSessionState } from "./session-state.js";

type TaskRecord = {
  configJson: Prisma.JsonValue | null;
  eventId: string;
  facebookConnection: {
    pageAccessToken: string;
    pageId: string;
  } | null;
  id: string;
  instagramConnection: {
    accessToken: string;
    instagramAccountId: string;
    pageId: string;
  } | null;
  platform: string;
  requiresVerification: boolean;
  title: string;
  type: string;
};

type TaskAttemptRecord = {
  claimedAt: Date | null;
  id: string;
  participantSessionId: string;
  proofJson: Prisma.JsonValue | null;
  status: string;
  taskId: string;
};

type SocialCommentEvent = {
  commentId: string;
  createdTime?: string | null;
  instagramAccountId?: string | null;
  message: string | null;
  pageId?: string | null;
  parentId?: string | null;
  platform: SupportedSocialCommentPlatform;
  postId: string | null;
  rawPayload: unknown;
  username?: string | null;
};

type ProviderCommentRecord = {
  commentId: string;
  createdTime: string | null;
  message: string | null;
  parentId: string | null;
  postId: string | null;
  rawPayload: unknown;
  username?: string | null;
};

type VerificationSource = "graph-lookup" | "webhook";

function logSocialCommentVerification(
  platform: SupportedSocialCommentPlatform,
  event: string,
  data: Record<string, unknown>,
) {
  console.info(
    JSON.stringify({
      event,
      platform,
      scope: "social-comment-verification",
      time: Date.now(),
      ...data,
    }),
  );
}

function getProofObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function buildAutoVerificationProof(args: {
  existingProofJson: Prisma.JsonValue | null;
  expectedCommentText: string;
  externalPostId: string;
  matchedComment?: {
    commentId: string;
    message: string;
    source: string;
  } | null;
  platform: SupportedSocialCommentPlatform;
  verificationCode: string;
}) {
  const existing = getProofObject(args.existingProofJson);
  const socialComment =
    existing.socialComment &&
    typeof existing.socialComment === "object" &&
    !Array.isArray(existing.socialComment)
      ? (existing.socialComment as Record<string, unknown>)
      : {};

  return {
    ...existing,
    socialComment: {
      ...socialComment,
      awaitingAutoVerificationAt:
        typeof socialComment.awaitingAutoVerificationAt === "string"
          ? socialComment.awaitingAutoVerificationAt
          : new Date().toISOString(),
      expectedCommentText: args.expectedCommentText,
      externalPostId: args.externalPostId,
      platform: args.platform,
      verificationCode: args.verificationCode,
      ...(args.platform === "FACEBOOK"
        ? {
            facebookPostId: args.externalPostId,
          }
        : {
            instagramMediaId: args.externalPostId,
          }),
      ...(args.matchedComment
        ? {
            matchedCommentId: args.matchedComment.commentId,
            matchedCommentText: args.matchedComment.message,
            source: args.matchedComment.source,
            verifiedAutomaticallyAt: new Date().toISOString(),
          }
        : {}),
    },
  } satisfies Prisma.JsonObject;
}

function normalizeFacebookCommentEvent(commentEvent: FacebookCommentEvent): SocialCommentEvent {
  return {
    commentId: commentEvent.commentId,
    createdTime: commentEvent.createdTime ?? null,
    message: commentEvent.message,
    pageId: commentEvent.pageId ?? null,
    parentId: commentEvent.parentId ?? null,
    platform: "FACEBOOK",
    postId: commentEvent.postId,
    rawPayload: commentEvent.rawPayload,
  };
}

function normalizeInstagramCommentEvent(commentEvent: InstagramCommentEvent): SocialCommentEvent {
  return {
    commentId: commentEvent.commentId,
    createdTime: commentEvent.createdTime ?? null,
    instagramAccountId: commentEvent.instagramAccountId ?? null,
    message: commentEvent.message,
    parentId: commentEvent.parentId ?? null,
    platform: "INSTAGRAM",
    postId: commentEvent.postId,
    rawPayload: commentEvent.rawPayload,
    username: commentEvent.username ?? null,
  };
}

async function loadAutoVerifiableSocialCommentTasksForTarget(args: {
  platform: SupportedSocialCommentPlatform;
  targetId: string;
}) {
  const tasks = await prisma.task.findMany({
    where: {
      type: "SOCIAL_COMMENT",
      platform: args.platform,
      isActive: true,
    },
    select: {
      configJson: true,
      event: {
        select: {
          facebookConnection: {
            select: {
              pageAccessToken: true,
              pageId: true,
            },
          },
          instagramConnection: {
            select: {
              accessToken: true,
              instagramAccountId: true,
              pageId: true,
            },
          },
        },
      },
      eventId: true,
      id: true,
      platform: true,
      requiresVerification: true,
      title: true,
      type: true,
    },
  });

  return tasks
    .filter((task) => {
      const config = getSocialCommentTaskConfig(task);

      return (
        config?.autoVerify === true &&
        config.requireVerificationCode === true &&
        getSocialCommentTargetId(config) === args.targetId
      );
    })
    .map((task) => ({
      configJson: task.configJson,
      eventId: task.eventId,
      facebookConnection: task.event.facebookConnection,
      id: task.id,
      instagramConnection: task.event.instagramConnection,
      platform: task.platform,
      requiresVerification: task.requiresVerification,
      title: task.title,
      type: task.type,
    })) as TaskRecord[];
}

async function getFacebookAccessTokensForPage(pageId?: string | null) {
  if (!pageId) {
    return [];
  }

  const connections = await prisma.eventFacebookConnection.findMany({
    where: {
      pageId,
    },
    select: {
      pageAccessToken: true,
    },
  });

  return connections
    .map((connection) => connection.pageAccessToken)
    .filter((token) => token.length > 0);
}

async function getInstagramAccessTokensForAccount(instagramAccountId?: string | null) {
  if (!instagramAccountId) {
    return [];
  }

  const connections = await prisma.eventInstagramConnection.findMany({
    where: {
      instagramAccountId,
    },
    select: {
      accessToken: true,
    },
  });

  return connections
    .map((connection) => connection.accessToken)
    .filter((token) => token.length > 0);
}

async function enrichSocialCommentEvent(commentEvent: SocialCommentEvent): Promise<SocialCommentEvent> {
  if (commentEvent.platform === "FACEBOOK") {
    const enriched = await enrichFacebookCommentEvent(
      {
        commentId: commentEvent.commentId,
        createdTime: commentEvent.createdTime ?? null,
        message: commentEvent.message,
        pageId: commentEvent.pageId ?? null,
        parentId: commentEvent.parentId ?? null,
        postId: commentEvent.postId,
        rawPayload: commentEvent.rawPayload,
      },
      await getFacebookAccessTokensForPage(commentEvent.pageId),
    );

    return normalizeFacebookCommentEvent(enriched);
  }

  const enriched = await enrichInstagramCommentEvent(
    {
      commentId: commentEvent.commentId,
      createdTime: commentEvent.createdTime ?? null,
      instagramAccountId: commentEvent.instagramAccountId ?? null,
      message: commentEvent.message,
      parentId: commentEvent.parentId ?? null,
      postId: commentEvent.postId,
      rawPayload: commentEvent.rawPayload,
      username: commentEvent.username ?? null,
    },
    await getInstagramAccessTokensForAccount(commentEvent.instagramAccountId),
  );

  return normalizeInstagramCommentEvent(enriched);
}

async function findTaskAttemptForComment(args: {
  commentEvent: SocialCommentEvent;
  task: TaskRecord;
}) {
  const config = getSocialCommentTaskConfig(args.task);

  if (!config || !args.commentEvent.message) {
    return null;
  }

  const verificationCode = extractVerificationCodeFromSocialComment({
    commentText: args.commentEvent.message,
    requiredPrefix: config.requiredPrefix,
  });

  if (!verificationCode) {
    return null;
  }

  const participantSession = await prisma.participantSession.findUnique({
    where: {
      eventId_verificationCode: {
        eventId: args.task.eventId,
        verificationCode,
      },
    },
  });

  if (!participantSession) {
    return null;
  }

  const taskAttempt = await prisma.taskAttempt.findUnique({
    where: {
      participantSessionId_taskId: {
        participantSessionId: participantSession.id,
        taskId: args.task.id,
      },
    },
  });

  if (!taskAttempt) {
    return null;
  }

  const expectedCommentText = buildSocialCommentText({
    task: args.task,
    verificationCode,
  });

  if (
    !expectedCommentText ||
    !matchesSocialCommentText({
      actualCommentText: args.commentEvent.message,
      expectedCommentText,
    })
  ) {
    return null;
  }

  return {
    expectedCommentText,
    participantSession,
    taskAttempt,
    verificationCode,
  };
}

async function saveSocialCommentVerification(args: {
  commentEvent: SocialCommentEvent;
  matched: boolean;
  participantSessionId?: string;
  taskAttemptId?: string;
  taskId?: string;
}) {
  return prisma.socialCommentVerification.upsert({
    where: {
      platform_externalCommentId: {
        externalCommentId: args.commentEvent.commentId,
        platform: args.commentEvent.platform,
      },
    },
    update: {
      commentText: args.commentEvent.message,
      externalPostId: args.commentEvent.postId,
      matched: args.matched,
      participantSessionId: args.participantSessionId,
      processedAt: new Date(),
      rawPayload: args.commentEvent.rawPayload as Prisma.InputJsonValue,
      taskAttemptId: args.taskAttemptId,
      taskId: args.taskId,
    },
    create: {
      commentText: args.commentEvent.message,
      externalCommentId: args.commentEvent.commentId,
      externalPostId: args.commentEvent.postId,
      matched: args.matched,
      participantSessionId: args.participantSessionId,
      platform: args.commentEvent.platform,
      processedAt: new Date(),
      rawPayload: args.commentEvent.rawPayload as Prisma.InputJsonValue,
      taskAttemptId: args.taskAttemptId,
      taskId: args.taskId,
    },
  });
}

function getVerificationSourceMetadata(
  platform: SupportedSocialCommentPlatform,
  source: VerificationSource,
  commentId: string,
) {
  const platformLabel = platform === "FACEBOOK" ? "Facebook" : "Instagram";
  const sourceLabel = `${platform.toLowerCase()}-${source === "webhook" ? "webhook" : "graph-lookup"}`;

  return {
    note: `Auto-verified from ${platformLabel} comment ${commentId}.`,
    proofSource: sourceLabel,
    verifiedByType: `${platform}_${source === "webhook" ? "WEBHOOK" : "GRAPH_LOOKUP"}`,
  };
}

async function verifyMatchedTaskAttempt(args: {
  commentEvent: SocialCommentEvent;
  expectedCommentText: string;
  source: VerificationSource;
  task: TaskRecord;
  taskAttempt: TaskAttemptRecord;
  verificationCode: string;
}) {
  const config = getSocialCommentTaskConfig(args.task);

  if (!config || !args.commentEvent.message || !args.commentEvent.postId) {
    return false;
  }

  const externalPostId = getSocialCommentTargetId(config);

  if (!externalPostId) {
    return false;
  }

  if (args.taskAttempt.status === "VERIFIED") {
    await saveSocialCommentVerification({
      commentEvent: args.commentEvent,
      matched: true,
      participantSessionId: args.taskAttempt.participantSessionId,
      taskAttemptId: args.taskAttempt.id,
      taskId: args.task.id,
    });

    return false;
  }

  if (args.taskAttempt.status !== "PENDING_AUTO_VERIFICATION") {
    await saveSocialCommentVerification({
      commentEvent: args.commentEvent,
      matched: false,
      participantSessionId: args.taskAttempt.participantSessionId,
      taskAttemptId: args.taskAttempt.id,
      taskId: args.task.id,
    });

    return false;
  }

  const metadata = getVerificationSourceMetadata(
    args.commentEvent.platform,
    args.source,
    args.commentEvent.commentId,
  );

  const updated = await prisma.taskAttempt.updateMany({
    where: {
      id: args.taskAttempt.id,
      status: "PENDING_AUTO_VERIFICATION",
    },
    data: {
      claimedAt: args.taskAttempt.claimedAt ?? new Date(),
      proofJson: buildAutoVerificationProof({
        existingProofJson: args.taskAttempt.proofJson,
        expectedCommentText: args.expectedCommentText,
        externalPostId,
        matchedComment: {
          commentId: args.commentEvent.commentId,
          message: args.commentEvent.message,
          source: metadata.proofSource,
        },
        platform: args.commentEvent.platform,
        verificationCode: args.verificationCode,
      }) as Prisma.InputJsonValue,
      rejectedAt: null,
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return false;
  }

  await prisma.$transaction([
    prisma.verificationAction.create({
      data: {
        action: "APPROVED",
        notes: metadata.note,
        participantSessionId: args.taskAttempt.participantSessionId,
        taskAttemptId: args.taskAttempt.id,
        verifiedByIdentifier: args.commentEvent.commentId,
        verifiedByType: metadata.verifiedByType,
      },
    }),
    prisma.socialCommentVerification.upsert({
      where: {
        platform_externalCommentId: {
          externalCommentId: args.commentEvent.commentId,
          platform: args.commentEvent.platform,
        },
      },
      update: {
        commentText: args.commentEvent.message,
        externalPostId: args.commentEvent.postId,
        matched: true,
        participantSessionId: args.taskAttempt.participantSessionId,
        processedAt: new Date(),
        rawPayload: args.commentEvent.rawPayload as Prisma.InputJsonValue,
        taskAttemptId: args.taskAttempt.id,
        taskId: args.task.id,
      },
      create: {
        commentText: args.commentEvent.message,
        externalCommentId: args.commentEvent.commentId,
        externalPostId: args.commentEvent.postId,
        matched: true,
        participantSessionId: args.taskAttempt.participantSessionId,
        platform: args.commentEvent.platform,
        processedAt: new Date(),
        rawPayload: args.commentEvent.rawPayload as Prisma.InputJsonValue,
        taskAttemptId: args.taskAttempt.id,
        taskId: args.task.id,
      },
    }),
  ]);

  await recalculateSessionState(args.taskAttempt.participantSessionId);

  return true;
}

async function fetchProviderComments(args: {
  config: NonNullable<ReturnType<typeof getSocialCommentTaskConfig>>;
  task: TaskRecord;
}): Promise<ProviderCommentRecord[]> {
  if (args.task.platform === "FACEBOOK" && "facebookPostId" in args.config) {
    const externalPostId = args.config.facebookPostId;

    if (!externalPostId) {
      return [];
    }

    const comments = await fetchFacebookPostComments(
      externalPostId,
      args.task.facebookConnection?.pageAccessToken ?? null,
    );

    return comments.map((comment) => ({
      commentId: comment.id,
      createdTime: comment.created_time ?? null,
      message: comment.message ?? null,
      parentId: comment.parent?.id ?? null,
      postId: externalPostId,
      rawPayload: {
        comment,
        source: "facebook-graph-lookup",
      },
    }));
  }

  if (args.task.platform === "INSTAGRAM" && "instagramMediaId" in args.config) {
    const externalPostId = args.config.instagramMediaId;

    if (!externalPostId) {
      return [];
    }

    const comments = await fetchInstagramMediaComments(
      externalPostId,
      args.task.instagramConnection?.accessToken ?? null,
    );

    return comments.map((comment) => ({
      commentId: comment.id,
      createdTime: comment.timestamp ?? null,
      message: comment.text ?? null,
      parentId: comment.parent_id ?? null,
      postId: externalPostId,
      rawPayload: {
        comment,
        source: "instagram-graph-lookup",
      },
      username: comment.username ?? null,
    }));
  }

  return [];
}

export function isAutoVerifiableSocialCommentTask(task: {
  configJson: Prisma.JsonValue | null;
  platform: string;
  type: string;
}) {
  return isAutoVerifiableSocialCommentTaskDomain(task);
}

export function isAutoVerifiableFacebookCommentTask(task: {
  configJson: Prisma.JsonValue | null;
  platform: string;
  type: string;
}) {
  return Boolean(getFacebookCommentTaskConfig(task)?.autoVerify);
}

async function processSocialCommentEvent(commentEvent: SocialCommentEvent) {
  logSocialCommentVerification(commentEvent.platform, "webhook_received", {
    commentId: commentEvent.commentId,
    hasMessage: Boolean(commentEvent.message),
    instagramAccountId: commentEvent.instagramAccountId ?? null,
    pageId: commentEvent.pageId ?? null,
    parentId: commentEvent.parentId ?? null,
    postId: commentEvent.postId ?? null,
  });

  const enrichedEvent = await enrichSocialCommentEvent(commentEvent);

  logSocialCommentVerification(commentEvent.platform, "webhook_enriched", {
    commentId: enrichedEvent.commentId,
    hasMessage: Boolean(enrichedEvent.message),
    instagramAccountId: enrichedEvent.instagramAccountId ?? null,
    pageId: enrichedEvent.pageId ?? null,
    postId: enrichedEvent.postId ?? null,
  });

  if (!enrichedEvent.postId || !enrichedEvent.message) {
    await saveSocialCommentVerification({
      commentEvent: enrichedEvent,
      matched: false,
    });

    return {
      matched: false,
      verified: false,
    };
  }

  const tasks = await loadAutoVerifiableSocialCommentTasksForTarget({
    platform: enrichedEvent.platform,
    targetId: enrichedEvent.postId,
  });

  for (const task of tasks) {
    const match = await findTaskAttemptForComment({
      commentEvent: enrichedEvent,
      task,
    });

    if (!match) {
      continue;
    }

    const verified = await verifyMatchedTaskAttempt({
      commentEvent: enrichedEvent,
      expectedCommentText: match.expectedCommentText,
      source: "webhook",
      task,
      taskAttempt: match.taskAttempt,
      verificationCode: match.verificationCode,
    });

    return {
      matched: true,
      taskId: task.id,
      verified,
    };
  }

  await saveSocialCommentVerification({
    commentEvent: enrichedEvent,
    matched: false,
  });

  return {
    matched: false,
    verified: false,
  };
}

export async function processFacebookCommentEvent(commentEvent: FacebookCommentEvent) {
  return processSocialCommentEvent(normalizeFacebookCommentEvent(commentEvent));
}

export async function processInstagramCommentEvent(commentEvent: InstagramCommentEvent) {
  return processSocialCommentEvent(normalizeInstagramCommentEvent(commentEvent));
}

export async function awaitSocialCommentVerification(args: {
  participantSessionId: string;
  task: TaskRecord;
  taskAttemptId: string;
  verificationCode: string;
}) {
  const config = getSocialCommentTaskConfig(args.task);

  if (!config || !isAutoVerifiableSocialCommentTaskDomain(args.task)) {
    throw new Error("Task is not configured for social comment auto-verification.");
  }

  if (!isSupportedSocialCommentPlatform(args.task.platform)) {
    throw new Error("Task platform is not supported for social comment auto-verification.");
  }

  const expectedCommentText = buildSocialCommentText({
    task: args.task,
    verificationCode: args.verificationCode,
  });

  if (!expectedCommentText) {
    throw new Error("Task could not build the required social comment string.");
  }

  const externalPostId = getSocialCommentTargetId(config);

  if (!externalPostId) {
    throw new Error("Task is missing the configured social comment target.");
  }

  logSocialCommentVerification(args.task.platform, "await_requested", {
    expectedCommentText,
    externalPostId,
    participantSessionId: args.participantSessionId,
    taskAttemptId: args.taskAttemptId,
    taskId: args.task.id,
  });

  const existingAttempt = await prisma.taskAttempt.findUniqueOrThrow({
    where: { id: args.taskAttemptId },
  });

  await prisma.taskAttempt.update({
    where: { id: args.taskAttemptId },
    data: {
      claimedAt: new Date(),
      proofJson: buildAutoVerificationProof({
        existingProofJson: existingAttempt.proofJson,
        expectedCommentText,
        externalPostId,
        platform: args.task.platform,
        verificationCode: args.verificationCode,
      }) as Prisma.InputJsonValue,
      rejectedAt: null,
      status: "PENDING_AUTO_VERIFICATION",
      verificationRequired: true,
      verifiedAt: null,
    },
  });

  const pendingAttempt = await prisma.taskAttempt.findUniqueOrThrow({
    where: { id: args.taskAttemptId },
  });

  const pendingEvents = await prisma.socialCommentVerification.findMany({
    where: {
      matched: false,
      platform: args.task.platform,
      OR: [
        {
          taskAttemptId: pendingAttempt.id,
        },
        {
          externalPostId,
        },
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const pendingEvent = pendingEvents.find(
    (event) =>
      event.commentText &&
      event.externalPostId === externalPostId &&
      matchesSocialCommentText({
        actualCommentText: event.commentText,
        expectedCommentText,
      }),
  );

  if (pendingEvent?.commentText && pendingEvent.externalPostId === externalPostId) {
    await verifyMatchedTaskAttempt({
      commentEvent: {
        commentId: pendingEvent.externalCommentId,
        message: pendingEvent.commentText,
        platform: args.task.platform,
        postId: pendingEvent.externalPostId,
        rawPayload: pendingEvent.rawPayload,
      },
      expectedCommentText,
      source: "webhook",
      task: args.task,
      taskAttempt: pendingAttempt,
      verificationCode: args.verificationCode,
    });

    return recalculateSessionState(args.participantSessionId);
  }

  let comments: ProviderCommentRecord[] = [];

  try {
    comments = await fetchProviderComments({
      config,
      task: args.task,
    });
  } catch {
    return recalculateSessionState(args.participantSessionId);
  }

  const matchedComment = comments.find(
    (comment) =>
      typeof comment.message === "string" &&
      matchesSocialCommentText({
        actualCommentText: comment.message,
        expectedCommentText,
      }),
  );

  if (!matchedComment?.message || !matchedComment.postId) {
    return recalculateSessionState(args.participantSessionId);
  }

  await verifyMatchedTaskAttempt({
    commentEvent: {
      commentId: matchedComment.commentId,
      createdTime: matchedComment.createdTime,
      message: matchedComment.message,
      parentId: matchedComment.parentId,
      platform: args.task.platform,
      postId: matchedComment.postId,
      rawPayload: matchedComment.rawPayload,
      username: matchedComment.username ?? null,
    },
    expectedCommentText,
    source: "graph-lookup",
    task: args.task,
    taskAttempt: pendingAttempt,
    verificationCode: args.verificationCode,
  });

  return recalculateSessionState(args.participantSessionId);
}

export async function awaitFacebookCommentVerification(args: {
  participantSessionId: string;
  task: TaskRecord;
  taskAttemptId: string;
  verificationCode: string;
}) {
  return awaitSocialCommentVerification(args);
}

export {
  buildFacebookCommentText,
  extractVerificationCodeFromFacebookComment,
  matchesFacebookCommentText,
};
