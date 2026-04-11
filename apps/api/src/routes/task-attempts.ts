import { type FastifyInstance } from "fastify";
import {
  SESSION_COOKIE_NAME,
} from "@qianlu-events/config";
import {
  taskClaimBodySchema,
  taskAwaitAutoVerificationBodySchema,
  taskFormSubmissionBodySchema,
} from "@qianlu-events/schemas";

import { prisma } from "../lib/prisma.js";
import {
  awaitFacebookCommentVerification,
  isAutoVerifiableFacebookCommentTask,
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
        },
      },
    },
  });
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

      if (isAutoVerifiableFacebookCommentTask(task)) {
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

      if (!isAutoVerifiableFacebookCommentTask(task)) {
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

      return awaitFacebookCommentVerification({
        participantSessionId: session.id,
        task: {
          configJson: task.configJson,
          eventId: task.eventId,
          facebookConnection: task.event.facebookConnection,
          id: task.id,
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

      await prisma.$transaction([
        prisma.participantSession.update({
          where: { id: session.id },
          data: {
            name: body.name ?? session.name,
            email: body.email ?? session.email,
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
            proofJson: body,
          },
          create: {
            participantSessionId: session.id,
            taskId: task.id,
            status: taskStatus,
            claimedAt: new Date(),
            verificationRequired: task.requiresVerification,
            proofJson: body,
          },
        }),
      ]);

      return recalculateSessionState(session.id);
    },
  );
}
