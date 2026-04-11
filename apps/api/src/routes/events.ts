import { type FastifyInstance } from "fastify";

import { SESSION_COOKIE_NAME } from "@qianlu-events/config";
import { serializeEventForClient } from "../lib/event-payload.js";
import { prisma } from "../lib/prisma.js";
import {
  ensureSessionTaskAttempts,
  recalculateSessionState,
} from "../lib/session-state.js";
import { serializeParticipantSessionForClient } from "../lib/session-payload.js";

export function registerEventRoutes(app: FastifyInstance) {
  app.get<{ Params: { slug: string } }>("/events/:slug", async (request, reply) => {
    const event = await prisma.event.findUnique({
      where: { slug: request.params.slug },
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

    return serializeEventForClient(event);
  });

  app.get<{ Params: { slug: string } }>(
    "/events/:slug/experience",
    async (request, reply) => {
      const event = await prisma.event.findUnique({
        where: { slug: request.params.slug },
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

      const token = request.cookies[SESSION_COOKIE_NAME];
      const session = token
        ? await prisma.participantSession.findFirst({
            where: {
              anonymousToken: token,
              eventId: event.id,
            },
            include: {
              taskAttempts: true,
              rewardEligibility: true,
            },
          })
        : null;

      if (!session) {
        return {
          event: serializeEventForClient(event),
          session: null,
        };
      }

      const hadMissingAttempts = await ensureSessionTaskAttempts({
        sessionId: session.id,
        tasks: event.tasks,
      });
      const currentSession = hadMissingAttempts
        ? await recalculateSessionState(session.id)
        : serializeParticipantSessionForClient(session);

      return {
        event: serializeEventForClient(event),
        session: currentSession,
      };
    },
  );
}
