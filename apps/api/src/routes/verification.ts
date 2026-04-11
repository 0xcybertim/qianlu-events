import { type FastifyInstance } from "fastify";
import {
  isValidStaffPin,
  SESSION_COOKIE_NAME,
} from "@qianlu-events/config";
import {
  verificationPinBodySchema,
  verificationTaskDecisionBodySchema,
} from "@qianlu-events/schemas";

import { prisma } from "../lib/prisma.js";
import {
  findEventSessionByToken,
  recalculateSessionState,
} from "../lib/session-state.js";

function invalidPin(reply: { code: (statusCode: number) => void }) {
  reply.code(401);

  return {
    message: "Invalid staff PIN.",
  };
}

export function registerVerificationRoutes(app: FastifyInstance) {
  app.post("/verification/pin/verify", async (request, reply) => {
    const body = verificationPinBodySchema.parse(request.body);

    if (!isValidStaffPin(body.pin)) {
      return invalidPin(reply);
    }

    return {
      valid: true,
    };
  });

  app.post<{ Params: { taskAttemptId: string } }>(
    "/verification/task-attempts/:taskAttemptId/approve",
    async (request, reply) => {
      const body = verificationTaskDecisionBodySchema.parse(request.body);

      if (!isValidStaffPin(body.pin)) {
        return invalidPin(reply);
      }

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

      const taskAttempt = await prisma.taskAttempt.findFirst({
        where: {
          id: request.params.taskAttemptId,
          participantSessionId: session.id,
        },
      });

      if (!taskAttempt) {
        reply.code(404);

        return {
          message: "Task attempt not found.",
        };
      }

      await prisma.$transaction([
        prisma.taskAttempt.update({
          where: { id: taskAttempt.id },
          data: {
            status: "VERIFIED",
            verifiedAt: new Date(),
            rejectedAt: null,
          },
        }),
        prisma.verificationAction.create({
          data: {
            participantSessionId: session.id,
            taskAttemptId: taskAttempt.id,
            action: "APPROVED",
            verifiedByType: "STAFF_PIN",
            notes: "Approved via hidden staff verification flow.",
          },
        }),
      ]);

      return recalculateSessionState(session.id);
    },
  );

  app.post<{ Params: { taskAttemptId: string } }>(
    "/verification/task-attempts/:taskAttemptId/reject",
    async (request, reply) => {
      const body = verificationTaskDecisionBodySchema.parse(request.body);

      if (!isValidStaffPin(body.pin)) {
        return invalidPin(reply);
      }

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

      const taskAttempt = await prisma.taskAttempt.findFirst({
        where: {
          id: request.params.taskAttemptId,
          participantSessionId: session.id,
        },
      });

      if (!taskAttempt) {
        reply.code(404);

        return {
          message: "Task attempt not found.",
        };
      }

      await prisma.$transaction([
        prisma.taskAttempt.update({
          where: { id: taskAttempt.id },
          data: {
            status: "REJECTED",
            rejectedAt: new Date(),
            verifiedAt: null,
          },
        }),
        prisma.verificationAction.create({
          data: {
            participantSessionId: session.id,
            taskAttemptId: taskAttempt.id,
            action: "REJECTED",
            verifiedByType: "STAFF_PIN",
            notes: "Rejected via hidden staff verification flow.",
          },
        }),
      ]);

      return recalculateSessionState(session.id);
    },
  );
}
