import { type FastifyInstance } from "fastify";
import {
  SESSION_COOKIE_NAME,
} from "@qianlu-events/config";
import {
  taskClaimBodySchema,
  taskAwaitAutoVerificationBodySchema,
  taskConfigSchema,
  taskFormSubmissionBodySchema,
  taskResetBodySchema,
} from "@qianlu-events/schemas";

import { prisma } from "../lib/prisma.js";
import {
  awaitSocialCommentVerification,
  isAutoVerifiableSocialCommentTask,
} from "../lib/social-comment-verification.js";
import {
  findEventSessionByToken,
  recalculateSessionState,
} from "../lib/session-state.js";

async function loadTaskForEvent(taskId: string, eventSlug: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      event: {
        slug: eventSlug,
      },
    },
    include: {
      event: {
        include: {
          facebookConnection: true,
          instagramConnection: true,
        },
      },
    },
  });
}

type TaskSubmissionResponseValue = string | boolean | string[];

function getTaskFormQuestions(taskConfig: unknown) {
  const parsed = taskConfigSchema.safeParse(taskConfig ?? null);

  if (!parsed.success) {
    return [];
  }

  return [
    ...(parsed.data.formQuestions ?? []),
    ...((parsed.data.formGroups ?? []).flatMap((group) => group.questions)),
  ];
}

function getResponseString(value: TaskSubmissionResponseValue | undefined) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value) && value.length === 1) {
    return value[0]?.trim() ?? "";
  }

  return "";
}

function getResponseBoolean(value: TaskSubmissionResponseValue | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value === "true";
  }

  return null;
}

function deriveSubmissionMetadata(args: {
  otherResponses?: Record<string, string>;
  responses?: Record<string, TaskSubmissionResponseValue>;
  taskConfig: unknown;
}) {
  const questions = getTaskFormQuestions(args.taskConfig);
  let name: string | undefined;
  let email: string | undefined;
  let phone: string | undefined;
  let optIn: boolean | undefined;
  let contactMethod: string | string[] | undefined;

  for (const question of questions) {
    const response = args.responses?.[question.id];

    if (question.fieldKey === "NAME") {
      const value = getResponseString(response);

      if (value) {
        name = value;
      }
    }

    if (question.fieldKey === "EMAIL") {
      const candidate = getResponseString(response).toLowerCase();
      const parsedEmail = taskFormSubmissionBodySchema.shape.email.safeParse(candidate);

      if (parsedEmail.success) {
        email = parsedEmail.data;
      }
    }

    if (question.fieldKey === "PHONE") {
      const value = getResponseString(response);

      if (value) {
        phone = value;
      }
    }

    if (question.fieldKey === "OPT_IN") {
      const value = getResponseBoolean(response);

      if (value !== null) {
        optIn = value;
      }
    }

    if (question.fieldKey === "CONTACT_METHOD") {
      if (Array.isArray(response) && response.length > 0) {
        contactMethod = response;
      } else {
        const value = getResponseString(response);

        if (value) {
          contactMethod = value;
        }
      }
    }
  }

  return {
    contactMethod,
    email,
    name,
    optIn,
    otherResponses: args.otherResponses,
    responses: args.responses,
    phone,
  };
}

export function registerTaskAttemptRoutes(app: FastifyInstance) {
  app.post<{ Params: { taskId: string } }>(
    "/task-attempts/:taskId/claim",
    async (request, reply) => {
      const body = taskClaimBodySchema.parse(request.body);
      const session = await findEventSessionByToken({
        eventSlug: body.eventSlug,
        token: request.cookies[SESSION_COOKIE_NAME],
      });

      if (!session) {
        reply.code(404);

        return {
          message: "Participant session not found.",
        };
      }

      const task = await loadTaskForEvent(request.params.taskId, body.eventSlug);

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      if (isAutoVerifiableSocialCommentTask(task)) {
        reply.code(400);

        return {
          message:
            "This task waits for automatic verification. Use the auto-verification action instead.",
        };
      }

      if (task.type === "STAMP_SCAN") {
        reply.code(400);

        return {
          message: "Stamp scan tasks must be completed by scanning their QR code.",
        };
      }

      await prisma.taskAttempt.upsert({
        where: {
          participantSessionId_taskId: {
            participantSessionId: session.id,
            taskId: task.id,
          },
        },
        update: {
          status: body.status,
          claimedAt: new Date(),
          rejectedAt: null,
          verificationRequired: task.requiresVerification,
        },
        create: {
          participantSessionId: session.id,
          taskId: task.id,
          status: body.status,
          claimedAt: new Date(),
          verificationRequired: task.requiresVerification,
        },
      });

      return recalculateSessionState(session.id);
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/task-attempts/:taskId/reset",
    async (request, reply) => {
      const body = taskResetBodySchema.parse(request.body);
      const session = await findEventSessionByToken({
        eventSlug: body.eventSlug,
        token: request.cookies[SESSION_COOKIE_NAME],
      });

      if (!session) {
        reply.code(404);

        return {
          message: "Participant session not found.",
        };
      }

      const task = await loadTaskForEvent(request.params.taskId, body.eventSlug);

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      await prisma.taskAttempt.updateMany({
        where: {
          participantSessionId: session.id,
          taskId: task.id,
        },
        data: {
          claimedAt: null,
          proofJson: undefined,
          rejectedAt: null,
          status: "NOT_STARTED",
          verifiedAt: null,
          verificationRequired: task.requiresVerification,
        },
      });

      return recalculateSessionState(session.id);
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/task-attempts/:taskId/await-auto-verification",
    async (request, reply) => {
      const body = taskAwaitAutoVerificationBodySchema.parse(request.body);
      const session = await findEventSessionByToken({
        eventSlug: body.eventSlug,
        token: request.cookies[SESSION_COOKIE_NAME],
      });

      if (!session) {
        reply.code(404);

        return {
          message: "Participant session not found.",
        };
      }

      const task = await loadTaskForEvent(request.params.taskId, body.eventSlug);

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      if (!isAutoVerifiableSocialCommentTask(task)) {
        reply.code(400);

        return {
          message: "This task does not support automatic verification.",
        };
      }

      const taskAttempt = await prisma.taskAttempt.findUnique({
        where: {
          participantSessionId_taskId: {
            participantSessionId: session.id,
            taskId: task.id,
          },
        },
      });

      if (!taskAttempt) {
        reply.code(404);

        return {
          message: "Task attempt not found.",
        };
      }

      return awaitSocialCommentVerification({
        participantSessionId: session.id,
        task: {
          configJson: task.configJson,
          eventId: task.eventId,
          facebookConnection: task.event.facebookConnection,
          id: task.id,
          instagramConnection: task.event.instagramConnection,
          platform: task.platform,
          requiresVerification: task.requiresVerification,
          title: task.title,
          type: task.type,
        },
        taskAttemptId: taskAttempt.id,
        verificationCode: session.verificationCode,
      });
    },
  );

  app.post<{ Params: { taskId: string } }>(
    "/task-attempts/:taskId/form-submit",
    async (request, reply) => {
      const body = taskFormSubmissionBodySchema.parse(request.body);
      const session = await findEventSessionByToken({
        eventSlug: body.eventSlug,
        token: request.cookies[SESSION_COOKIE_NAME],
      });

      if (!session) {
        reply.code(404);

        return {
          message: "Participant session not found.",
        };
      }

      const task = await loadTaskForEvent(request.params.taskId, body.eventSlug);

      if (!task) {
        reply.code(404);

        return {
          message: "Task not found.",
        };
      }

      if (task.type === "STAMP_SCAN") {
        reply.code(400);

        return {
          message: "Stamp scan tasks must be completed by scanning their QR code.",
        };
      }

      const taskStatus = task.requiresVerification
        ? "PENDING_STAFF_CHECK"
        : "COMPLETED_BY_USER";
      const submissionMetadata = deriveSubmissionMetadata({
        otherResponses: body.otherResponses,
        responses: body.responses,
        taskConfig: task.configJson,
      });

      await prisma.$transaction([
        prisma.participantSession.update({
          where: { id: session.id },
          data: {
            name: submissionMetadata.name ?? body.name ?? session.name,
            email: submissionMetadata.email ?? body.email ?? session.email,
          },
        }),
        prisma.taskAttempt.upsert({
          where: {
            participantSessionId_taskId: {
              participantSessionId: session.id,
              taskId: task.id,
            },
          },
          update: {
            status: taskStatus,
            claimedAt: new Date(),
            rejectedAt: null,
            verificationRequired: task.requiresVerification,
            proofJson: {
              ...body,
              ...submissionMetadata,
            },
          },
          create: {
            participantSessionId: session.id,
            taskId: task.id,
            status: taskStatus,
            claimedAt: new Date(),
            verificationRequired: task.requiresVerification,
            proofJson: {
              ...body,
              ...submissionMetadata,
            },
          },
        }),
      ]);

      return recalculateSessionState(session.id);
    },
  );
}
