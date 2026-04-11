import { type FastifyInstance } from "fastify";
import { createSessionBodySchema } from "@qianlu-events/schemas";

import { SESSION_COOKIE_NAME } from "@qianlu-events/config";
import { prisma } from "../lib/prisma.js";
import {
  ensureSessionTaskAttempts,
  recalculateSessionState,
} from "../lib/session-state.js";
import { serializeParticipantSessionForClient } from "../lib/session-payload.js";
import { createUniqueVerificationCode } from "../lib/verification-code.js";

export function registerSessionRoutes(app: FastifyInstance) {
  app.post<{ Body: { eventSlug: string } }>("/sessions", async (request, reply) => {
    const body = createSessionBodySchema.parse(request.body);

    const event = await prisma.event.findUnique({
      where: { slug: body.eventSlug },
      include: {
        tasks: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!event) {
      reply.code(404);

      return {
        message: "Event not found.",
      };
    }

    const existingToken = request.cookies[SESSION_COOKIE_NAME];

    if (existingToken) {
      const existingSession = await prisma.participantSession.findFirst({
        where: {
          anonymousToken: existingToken,
          eventId: event.id,
        },
        include: {
          taskAttempts: true,
          rewardEligibility: true,
        },
      });

      if (existingSession) {
        const hadMissingAttempts = await ensureSessionTaskAttempts({
          sessionId: existingSession.id,
          tasks: event.tasks,
        });

        if (hadMissingAttempts) {
          return recalculateSessionState(existingSession.id);
        }

        const refreshedSession = await prisma.participantSession.findUniqueOrThrow({
          where: { id: existingSession.id },
          include: {
            taskAttempts: true,
            rewardEligibility: true,
          },
        });

        return serializeParticipantSessionForClient(refreshedSession);
      }
    }

    const anonymousToken = crypto.randomUUID();
    const verificationCode = await createUniqueVerificationCode(event.id);
    const session = await prisma.participantSession.create({
      data: {
        anonymousToken,
        verificationCode,
        eventId: event.id,
        taskAttempts: {
          create: event.tasks.map((task) => ({
            taskId: task.id,
            verificationRequired: task.requiresVerification,
          })),
        },
      },
      include: {
        taskAttempts: true,
        rewardEligibility: true,
      },
    });

    reply.setCookie(SESSION_COOKIE_NAME, anonymousToken, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return serializeParticipantSessionForClient(session);
  });

  app.get<{ Querystring: { eventSlug?: string } }>(
    "/sessions/current",
    async (request, reply) => {
      const eventSlug = request.query.eventSlug;

      if (!eventSlug) {
        reply.code(400);

        return {
          message: "eventSlug is required.",
        };
      }

      const token = request.cookies[SESSION_COOKIE_NAME];

      if (!token) {
        return null;
      }

      const session = await prisma.participantSession.findFirst({
        where: {
          anonymousToken: token,
          event: {
            slug: eventSlug,
          },
        },
        include: {
          taskAttempts: true,
          rewardEligibility: true,
        },
      });

      if (!session) {
        return null;
      }

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
        return serializeParticipantSessionForClient(session);
      }

      const hadMissingAttempts = await ensureSessionTaskAttempts({
        sessionId: session.id,
        tasks: event.tasks,
      });

      if (hadMissingAttempts) {
        return recalculateSessionState(session.id);
      }

      return serializeParticipantSessionForClient(session);
    },
  );
}
