import { type FastifyInstance, type FastifyRequest } from "fastify";
import { isValidStaffPin } from "@qianlu-events/config";
import {
  staffSessionLookupResponseSchema,
  staffSessionParamsSchema,
  staffTaskDecisionBodySchema,
} from "@qianlu-events/schemas";

import { serializeEventForClient } from "../lib/event-payload.js";
import { prisma } from "../lib/prisma.js";
import {
  ensureSessionTaskAttempts,
  recalculateSessionState,
} from "../lib/session-state.js";
import { serializeParticipantSessionForClient } from "../lib/session-payload.js";

function invalidPin(reply: { code: (statusCode: number) => void }) {
  reply.code(401);

  return {
    message: "Invalid staff PIN.",
  };
}

function readStaffPinHeader(request: FastifyRequest) {
  const value = request.headers["x-staff-pin"];

  return Array.isArray(value) ? value[0] : value;
}

async function loadStaffSession(eventSlug: string, verificationCode: string) {
  const event = await prisma.event.findUnique({
    where: { slug: eventSlug },
    include: {
      tasks: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!event) {
    return null;
  }

  const session = await prisma.participantSession.findFirst({
    where: {
      eventId: event.id,
      verificationCode,
    },
    include: {
      taskAttempts: true,
      rewardEligibility: true,
    },
  });

  if (!session) {
    return null;
  }

  const hadMissingAttempts = await ensureSessionTaskAttempts({
    sessionId: session.id,
    tasks: event.tasks,
  });
  const currentSession = hadMissingAttempts
    ? await recalculateSessionState(session.id)
    : serializeParticipantSessionForClient(session);

  return staffSessionLookupResponseSchema.parse({
    event: serializeEventForClient(event),
    session: currentSession,
  });
}

async function loadStaffSessionOr404(
  reply: { code: (statusCode: number) => void },
  eventSlug: string,
  verificationCode: string,
) {
  const staffSession = await loadStaffSession(eventSlug, verificationCode);

  if (!staffSession) {
    reply.code(404);

    return {
      message: "Participant session not found.",
    };
  }

  return staffSession;
}

export function registerStaffRoutes(app: FastifyInstance) {
  app.get<{ Params: { eventSlug: string; verificationCode: string } }>(
    "/staff/events/:eventSlug/sessions/:verificationCode",
    async (request, reply) => {
      const params = staffSessionParamsSchema.parse(request.params);
      const pin = readStaffPinHeader(request);

      if (!pin || !isValidStaffPin(pin)) {
        return invalidPin(reply);
      }

      return loadStaffSessionOr404(
        reply,
        params.eventSlug,
        params.verificationCode,
      );
    },
  );

  app.post<{
    Body: { pin: string };
    Params: {
      eventSlug: string;
      verificationCode: string;
      taskAttemptId: string;
    };
  }>(
    "/staff/events/:eventSlug/sessions/:verificationCode/task-attempts/:taskAttemptId/approve",
    async (request, reply) => {
      const params = staffSessionParamsSchema.parse(request.params);
      const body = staffTaskDecisionBodySchema.parse(request.body);

      if (!isValidStaffPin(body.pin)) {
        return invalidPin(reply);
      }

      const staffSession = await loadStaffSessionOr404(
        reply,
        params.eventSlug,
        params.verificationCode,
      );

      if ("message" in staffSession) {
        return staffSession;
      }

      const taskAttempt = await prisma.taskAttempt.findFirst({
        where: {
          id: request.params.taskAttemptId,
          participantSessionId: staffSession.session.id,
          status: {
            notIn: ["NOT_STARTED", "IN_PROGRESS"],
          },
        },
      });

      if (!taskAttempt) {
        reply.code(404);

        return {
          message: "Claimed task attempt not found.",
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
            participantSessionId: staffSession.session.id,
            taskAttemptId: taskAttempt.id,
            action: "APPROVED",
            verifiedByType: "STAFF_PIN",
            verifiedByIdentifier: "staff-panel",
            notes: "Approved from staff verification panel.",
          },
        }),
      ]);

      await recalculateSessionState(staffSession.session.id);

      return loadStaffSessionOr404(
        reply,
        params.eventSlug,
        params.verificationCode,
      );
    },
  );

  app.post<{
    Body: { pin: string };
    Params: {
      eventSlug: string;
      verificationCode: string;
      taskAttemptId: string;
    };
  }>(
    "/staff/events/:eventSlug/sessions/:verificationCode/task-attempts/:taskAttemptId/reject",
    async (request, reply) => {
      const params = staffSessionParamsSchema.parse(request.params);
      const body = staffTaskDecisionBodySchema.parse(request.body);

      if (!isValidStaffPin(body.pin)) {
        return invalidPin(reply);
      }

      const staffSession = await loadStaffSessionOr404(
        reply,
        params.eventSlug,
        params.verificationCode,
      );

      if ("message" in staffSession) {
        return staffSession;
      }

      const taskAttempt = await prisma.taskAttempt.findFirst({
        where: {
          id: request.params.taskAttemptId,
          participantSessionId: staffSession.session.id,
          status: {
            notIn: ["NOT_STARTED", "IN_PROGRESS"],
          },
        },
      });

      if (!taskAttempt) {
        reply.code(404);

        return {
          message: "Claimed task attempt not found.",
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
            participantSessionId: staffSession.session.id,
            taskAttemptId: taskAttempt.id,
            action: "REJECTED",
            verifiedByType: "STAFF_PIN",
            verifiedByIdentifier: "staff-panel",
            notes: "Rejected from staff verification panel.",
          },
        }),
      ]);

      await recalculateSessionState(staffSession.session.id);

      return loadStaffSessionOr404(
        reply,
        params.eventSlug,
        params.verificationCode,
      );
    },
  );
}
