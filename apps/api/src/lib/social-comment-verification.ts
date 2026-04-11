import { type Prisma } from "@prisma/client";
import {
  buildFacebookCommentText,
  extractVerificationCodeFromFacebookComment,
  getFacebookCommentTaskConfig,
  matchesFacebookCommentText,
} from "@qianlu-events/domain";

import {
  enrichFacebookCommentEvent,
  fetchFacebookPostComments,
  type FacebookCommentEvent,
} from "./facebook.js";
import { prisma } from "./prisma.js";
import { recalculateSessionState } from "./session-state.js";

type TaskRecord = {
  id: string;
  eventId: string;
  facebookConnection: {
    pageAccessToken: string;
    pageId: string;
  } | null;
  platform: string;
  requiresVerification: boolean;
  title: string;
  type: string;
  configJson: Prisma.JsonValue | null;
};

type TaskAttemptRecord = {
  id: string;
  claimedAt: Date | null;
  participantSessionId: string;
  proofJson: Prisma.JsonValue | null;
  status: string;
  taskId: string;
};

function getProofObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
}

function buildAutoVerificationProof(args: {
  existingProofJson: Prisma.JsonValue | null;
  expectedCommentText: string;
  facebookPostId: string;
  matchedComment?: {
    commentId: string;
    message: string;
    source: string;
  } | null;
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
      expectedCommentText: args.expectedCommentText,
      facebookPostId: args.facebookPostId,
      verificationCode: args.verificationCode,
      awaitingAutoVerificationAt:
        typeof socialComment.awaitingAutoVerificationAt === "string"
          ? socialComment.awaitingAutoVerificationAt
          : new Date().toISOString(),
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

async function loadFacebookCommentTasksForPost(postId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      type: "SOCIAL_COMMENT",
      platform: "FACEBOOK",
      isActive: true,
    },
    select: {
      event: {
        select: {
          facebookConnection: {
            select: {
              pageAccessToken: true,
              pageId: true,
            },
          },
        },
      },
      id: true,
      eventId: true,
      title: true,
      type: true,
      platform: true,
      requiresVerification: true,
      configJson: true,
    },
  });

  return tasks.filter((task) => {
    const config = getFacebookCommentTaskConfig(task);

    return (
      config?.autoVerify === true &&
      config.requireVerificationCode === true &&
      config.facebookPostId === postId
    );
  }).map((task) => ({
    configJson: task.configJson,
    eventId: task.eventId,
    facebookConnection: task.event.facebookConnection,
    id: task.id,
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

async function findTaskAttemptForComment(args: {
  commentEvent: FacebookCommentEvent;
  task: TaskRecord;
}) {
  const config = getFacebookCommentTaskConfig(args.task);

  if (!config || !args.commentEvent.message) {
    return null;
  }

  const verificationCode = extractVerificationCodeFromFacebookComment({
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

  const expectedCommentText = buildFacebookCommentText({
    task: args.task,
    verificationCode,
  });

  if (
    !expectedCommentText ||
    !matchesFacebookCommentText({
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
  commentEvent: FacebookCommentEvent;
  matched: boolean;
  participantSessionId?: string;
  taskAttemptId?: string;
  taskId?: string;
}) {
  return prisma.socialCommentVerification.upsert({
    where: {
      platform_externalCommentId: {
        externalCommentId: args.commentEvent.commentId,
        platform: "FACEBOOK",
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
      platform: "FACEBOOK",
      processedAt: new Date(),
      rawPayload: args.commentEvent.rawPayload as Prisma.InputJsonValue,
      taskAttemptId: args.taskAttemptId,
      taskId: args.taskId,
    },
  });
}

async function verifyMatchedTaskAttempt(args: {
  commentEvent: FacebookCommentEvent;
  expectedCommentText: string;
  source: "facebook-graph-lookup" | "facebook-webhook";
  task: TaskRecord;
  taskAttempt: TaskAttemptRecord;
  verificationCode: string;
}) {
  const config = getFacebookCommentTaskConfig(args.task);

  if (!config || !args.commentEvent.message || !args.commentEvent.postId) {
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
        facebookPostId: config.facebookPostId,
        matchedComment: {
          commentId: args.commentEvent.commentId,
          message: args.commentEvent.message,
          source: args.source,
        },
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
        notes: `Auto-verified from Facebook comment ${args.commentEvent.commentId}.`,
        participantSessionId: args.taskAttempt.participantSessionId,
        taskAttemptId: args.taskAttempt.id,
        verifiedByIdentifier: args.commentEvent.commentId,
        verifiedByType:
          args.source === "facebook-webhook"
            ? "FACEBOOK_WEBHOOK"
            : "FACEBOOK_GRAPH_LOOKUP",
      },
    }),
    prisma.socialCommentVerification.upsert({
      where: {
        platform_externalCommentId: {
          externalCommentId: args.commentEvent.commentId,
          platform: "FACEBOOK",
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
        platform: "FACEBOOK",
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

export function isAutoVerifiableFacebookCommentTask(task: {
  configJson: Prisma.JsonValue | null;
  platform: string;
  type: string;
}) {
  const config = getFacebookCommentTaskConfig(task);

  return Boolean(config?.autoVerify);
}

export async function processFacebookCommentEvent(
  commentEvent: FacebookCommentEvent,
) {
  const enrichedEvent =
    !commentEvent.message || !commentEvent.postId
      ? await enrichFacebookCommentEvent(
          commentEvent,
          await getFacebookAccessTokensForPage(commentEvent.pageId),
        )
      : commentEvent;

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

  const tasks = await loadFacebookCommentTasksForPost(enrichedEvent.postId);

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
      source: "facebook-webhook",
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

export async function awaitFacebookCommentVerification(args: {
  task: TaskRecord;
  taskAttemptId: string;
  verificationCode: string;
  participantSessionId: string;
}) {
  const config = getFacebookCommentTaskConfig(args.task);

  if (!config) {
    throw new Error("Task is not configured for Facebook comment verification.");
  }

  const expectedCommentText = buildFacebookCommentText({
    task: args.task,
    verificationCode: args.verificationCode,
  });

  if (!expectedCommentText) {
    throw new Error("Task could not build a required Facebook comment string.");
  }

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
        facebookPostId: config.facebookPostId,
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

  const pendingEvent = await prisma.socialCommentVerification.findFirst({
    where: {
      matched: false,
      taskAttemptId: pendingAttempt.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (
    pendingEvent?.externalPostId === config.facebookPostId &&
    pendingEvent.commentText &&
    matchesFacebookCommentText({
      actualCommentText: pendingEvent.commentText,
      expectedCommentText,
    })
  ) {
    await verifyMatchedTaskAttempt({
      commentEvent: {
        commentId: pendingEvent.externalCommentId,
        message: pendingEvent.commentText,
        postId: pendingEvent.externalPostId,
        rawPayload: pendingEvent.rawPayload,
      },
      expectedCommentText,
      source: "facebook-webhook",
      task: args.task,
      taskAttempt: pendingAttempt,
      verificationCode: args.verificationCode,
    });

    return recalculateSessionState(args.participantSessionId);
  }

  let comments: Awaited<ReturnType<typeof fetchFacebookPostComments>> = [];

  try {
    comments = await fetchFacebookPostComments(
      config.facebookPostId,
      args.task.facebookConnection?.pageAccessToken ?? null,
    );
  } catch {
    return recalculateSessionState(args.participantSessionId);
  }

  const matchedComment = comments.find(
    (comment) =>
      typeof comment.message === "string" &&
      matchesFacebookCommentText({
        actualCommentText: comment.message,
        expectedCommentText,
      }),
  );

  if (!matchedComment?.message) {
    return recalculateSessionState(args.participantSessionId);
  }

  await verifyMatchedTaskAttempt({
    commentEvent: {
      commentId: matchedComment.id,
      createdTime: matchedComment.created_time,
      message: matchedComment.message,
      parentId: matchedComment.parent?.id ?? null,
      postId: config.facebookPostId,
      rawPayload: {
        source: "facebook-graph-lookup",
        comment: matchedComment,
      },
    },
    expectedCommentText,
    source: "facebook-graph-lookup",
    task: args.task,
    taskAttempt: pendingAttempt,
    verificationCode: args.verificationCode,
  });

  return recalculateSessionState(args.participantSessionId);
}
