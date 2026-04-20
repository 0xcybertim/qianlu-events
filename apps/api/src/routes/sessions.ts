import { type FastifyInstance, type FastifyReply } from "fastify";
import { clerkClient, getAuth } from "@clerk/fastify";
import { Prisma } from "@prisma/client";
import {
  createSessionBodySchema,
  participantClerkLinkBodySchema,
  participantLoginLinkConsumeBodySchema,
  participantLoginLinkRequestBodySchema,
} from "@qianlu-events/schemas";

import { SESSION_COOKIE_NAME } from "@qianlu-events/config";
import { prisma } from "../lib/prisma.js";
import {
  buildParticipantLoginUrl,
  createParticipantLoginToken,
  hashParticipantLoginToken,
} from "../lib/participant-auth.js";
import {
  ensureSessionTaskAttempts,
  recalculateSessionState,
} from "../lib/session-state.js";
import { serializeParticipantSessionForClient } from "../lib/session-payload.js";
import { createUniqueVerificationCode } from "../lib/verification-code.js";

const participantSessionInclude = {
  participantAccount: {
    select: {
      accountUuid: true,
    },
  },
  taskAttempts: true,
  rewardEligibility: true,
} as const;

type EventWithActiveTasks = Prisma.EventGetPayload<{
  include: {
    tasks: true;
  };
}>;

async function resolveParticipantAccountSession(args: {
  currentAnonymousToken?: string;
  email: string;
  event: EventWithActiveTasks;
  participantAccountId: string;
}) {
  const currentSession = args.currentAnonymousToken
    ? await prisma.participantSession.findFirst({
        where: {
          anonymousToken: args.currentAnonymousToken,
          eventId: args.event.id,
        },
        include: participantSessionInclude,
      })
    : null;

  const accountSession = await prisma.participantSession.findFirst({
    where: {
      participantAccountId: args.participantAccountId,
      eventId: args.event.id,
    },
    include: participantSessionInclude,
  });

  let session = accountSession
    ? await prisma.participantSession.update({
        where: { id: accountSession.id },
        data: { email: args.email },
        include: participantSessionInclude,
      })
    : null;

  if (
    !session &&
    currentSession &&
    (!currentSession.participantAccountId ||
      currentSession.participantAccountId === args.participantAccountId)
  ) {
    session = await prisma.participantSession.update({
      where: { id: currentSession.id },
      data: {
        participantAccountId: args.participantAccountId,
        email: args.email,
      },
      include: participantSessionInclude,
    });
  }

  if (!session) {
    const anonymousToken = crypto.randomUUID();
    const verificationCode = await createUniqueVerificationCode(args.event.id);

    session = await prisma.participantSession.create({
      data: {
        anonymousToken,
        eventId: args.event.id,
        participantAccountId: args.participantAccountId,
        verificationCode,
        email: args.email,
        taskAttempts: {
          create: args.event.tasks.map((task) => ({
            taskId: task.id,
            verificationRequired: task.requiresVerification,
          })),
        },
      },
      include: participantSessionInclude,
    });
  }

  const hadMissingAttempts = await ensureSessionTaskAttempts({
    sessionId: session.id,
    tasks: args.event.tasks,
  });

  return {
    session,
    sessionState: hadMissingAttempts
      ? await recalculateSessionState(session.id)
      : serializeParticipantSessionForClient(session),
  };
}

async function resolveParticipantAccountForClerk(args: {
  clerkUserId: string;
  email: string;
}) {
  const existingByClerkUserId = await prisma.participantAccount.findUnique({
    where: {
      clerkUserId: args.clerkUserId,
    },
  });

  if (existingByClerkUserId) {
    return prisma.participantAccount.update({
      where: {
        id: existingByClerkUserId.id,
      },
      data: {
        email: args.email,
      },
    });
  }

  const existingByEmail = await prisma.participantAccount.findUnique({
    where: {
      email: args.email,
    },
  });

  if (!existingByEmail) {
    return prisma.participantAccount.create({
      data: {
        clerkUserId: args.clerkUserId,
        email: args.email,
      },
    });
  }

  if (
    existingByEmail.clerkUserId &&
    existingByEmail.clerkUserId !== args.clerkUserId
  ) {
    throw new Error("Participant account already linked to a different Clerk user.");
  }

  return prisma.participantAccount.update({
    where: {
      id: existingByEmail.id,
    },
    data: {
      clerkUserId: args.clerkUserId,
      email: args.email,
    },
  });
}

function setParticipantSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function registerSessionRoutes(app: FastifyInstance) {
  app.post("/participant-auth/login-link", async (request, reply) => {
    const body = participantLoginLinkRequestBodySchema.parse(request.body);
    const event = await prisma.event.findUnique({
      where: { slug: body.eventSlug },
    });

    if (!event) {
      reply.code(404);

      return {
        message: "Event not found.",
      };
    }

    const account = await prisma.participantAccount.upsert({
      where: {
        email: body.email,
      },
      update: {},
      create: {
        email: body.email,
      },
    });

    await prisma.participantLoginToken.updateMany({
      where: {
        participantAccountId: account.id,
        eventId: event.id,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
      },
    });

    const token = createParticipantLoginToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15);

    await prisma.participantLoginToken.create({
      data: {
        participantAccountId: account.id,
        eventId: event.id,
        tokenHash: hashParticipantLoginToken(token),
        expiresAt,
      },
    });

    const loginUrl = buildParticipantLoginUrl({
      eventSlug: event.slug,
      token,
    });

    request.log.info(
      {
        email: account.email,
        eventSlug: event.slug,
        loginUrl,
      },
      "Participant login link created.",
    );

    return {
      ok: true,
      email: account.email,
      expiresAt: expiresAt.toISOString(),
      devLoginUrl: process.env.NODE_ENV === "production" ? null : loginUrl,
    };
  });

  app.post("/participant-auth/consume-login-link", async (request, reply) => {
    const body = participantLoginLinkConsumeBodySchema.parse(request.body);
    const token = await prisma.participantLoginToken.findUnique({
      where: {
        tokenHash: hashParticipantLoginToken(body.token),
      },
      include: {
        event: {
          include: {
            tasks: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        participantAccount: true,
      },
    });

    if (!token || token.consumedAt || token.expiresAt <= new Date()) {
      reply.code(401);

      return {
        message: "Participant login link is invalid or expired.",
      };
    }

    await prisma.participantLoginToken.update({
      where: { id: token.id },
      data: { consumedAt: new Date() },
    });

    const { session, sessionState } = await resolveParticipantAccountSession({
      currentAnonymousToken: request.cookies[SESSION_COOKIE_NAME],
      email: token.participantAccount.email,
      event: token.event,
      participantAccountId: token.participantAccountId,
    });

    setParticipantSessionCookie(reply, session.anonymousToken);

    return {
      ok: true,
      eventSlug: token.event.slug,
      session: sessionState,
    };
  });

  app.post("/participant-auth/clerk-link", async (request, reply) => {
    if (!process.env.CLERK_SECRET_KEY) {
      reply.code(503);

      return {
        message: "Clerk is not configured.",
      };
    }

    const body = participantClerkLinkBodySchema.parse(request.body);
    const auth = getAuth(request);

    if (!auth.isAuthenticated || !auth.userId) {
      reply.code(401);

      return {
        message: "Clerk authentication required.",
      };
    }

    const user = await clerkClient.users.getUser(auth.userId);
    const primaryEmail =
      user.emailAddresses.find(
        (emailAddress) => emailAddress.id === user.primaryEmailAddressId,
      ) ?? user.emailAddresses[0];

    if (!primaryEmail?.emailAddress) {
      reply.code(422);

      return {
        message: "Clerk account does not have an email address.",
      };
    }

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

    const email = primaryEmail.emailAddress.toLowerCase();
    let account;

    try {
      account = await resolveParticipantAccountForClerk({
        clerkUserId: auth.userId,
        email,
      });
    } catch (error) {
      reply.code(409);

      return {
        message:
          error instanceof Error
            ? error.message
            : "Participant account could not be linked.",
      };
    }

    const { session, sessionState } = await resolveParticipantAccountSession({
      currentAnonymousToken: request.cookies[SESSION_COOKIE_NAME],
      email,
      event,
      participantAccountId: account.id,
    });

    setParticipantSessionCookie(reply, session.anonymousToken);

    return {
      ok: true,
      eventSlug: event.slug,
      session: sessionState,
    };
  });

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
          participantAccount: {
            select: {
              accountUuid: true,
            },
          },
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
            participantAccount: {
              select: {
                accountUuid: true,
              },
            },
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
        participantAccount: {
          select: {
            accountUuid: true,
          },
        },
        taskAttempts: true,
        rewardEligibility: true,
      },
    });

    setParticipantSessionCookie(reply, anonymousToken);

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
          participantAccount: {
            select: {
              accountUuid: true,
            },
          },
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
