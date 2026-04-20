import { createHash } from "node:crypto";

import { type FastifyInstance } from "fastify";
import { SESSION_COOKIE_NAME } from "@qianlu-events/config";
import {
  type QrScanStatus,
  qrScanBodySchema,
  qrScanResultSchema,
} from "@qianlu-events/schemas";

import { prisma } from "../lib/prisma.js";
import { serializeParticipantSessionForClient } from "../lib/session-payload.js";
import {
  ensureSessionTaskAttempts,
  findEventSessionByToken,
  recalculateSessionState,
} from "../lib/session-state.js";

const POINT_AWARDING_STATUSES = new Set([
  "COMPLETED_BY_USER",
  "PENDING_STAFF_CHECK",
  "VERIFIED",
]);

function hashQrToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function loadSessionPayload(sessionId: string) {
  const session = await prisma.participantSession.findUniqueOrThrow({
    where: { id: sessionId },
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

  return serializeParticipantSessionForClient(session);
}

async function recordRejectedScan(args: {
  participantSessionId: string;
  qrCodeId: string;
  taskId: string;
  status: Exclude<QrScanStatus, "ACCEPTED">;
  rejectionReason: string;
  scannedAt: Date;
}) {
  await prisma.qrScan.create({
    data: {
      participantSessionId: args.participantSessionId,
      qrCodeId: args.qrCodeId,
      taskId: args.taskId,
      status: args.status,
      rejectionReason: args.rejectionReason,
      scannedAt: args.scannedAt,
    },
  });
}

function buildResult(args: {
  status: QrScanStatus;
  message: string;
  pointsAwarded?: number;
  session: Awaited<ReturnType<typeof loadSessionPayload>>;
}) {
  return qrScanResultSchema.parse({
    status: args.status,
    message: args.message,
    pointsAwarded: args.pointsAwarded ?? 0,
    session: args.session,
  });
}

export function registerQrScanRoutes(app: FastifyInstance) {
  app.post<{ Params: { eventSlug: string } }>(
    "/events/:eventSlug/qr-scans",
    async (request, reply) => {
      const body = qrScanBodySchema.parse(request.body);
      const session = await findEventSessionByToken({
        eventSlug: request.params.eventSlug,
        token: request.cookies[SESSION_COOKIE_NAME],
      });

      if (!session) {
        reply.code(404);

        return {
          message: "Participant session not found.",
        };
      }

      await ensureSessionTaskAttempts({
        sessionId: session.id,
        tasks: session.event.tasks,
      });

      const now = new Date();
      const qrCode = await prisma.qrCode.findUnique({
        where: { tokenHash: hashQrToken(body.token) },
        include: {
          event: true,
          task: true,
        },
      });

      if (!qrCode) {
        return buildResult({
          status: "INACTIVE",
          message: "This stamp code is not available.",
          session: await loadSessionPayload(session.id),
        });
      }

      const reject = async (
        status: Exclude<QrScanStatus, "ACCEPTED">,
        message: string,
        rejectionReason = message,
      ) => {
        await recordRejectedScan({
          participantSessionId: session.id,
          qrCodeId: qrCode.id,
          taskId: qrCode.taskId,
          status,
          rejectionReason,
          scannedAt: now,
        });

        return buildResult({
          status,
          message,
          session: await loadSessionPayload(session.id),
        });
      };

      if (qrCode.event.slug !== request.params.eventSlug) {
        return reject(
          "WRONG_EVENT",
          "This stamp belongs to a different event.",
        );
      }

      if (
        qrCode.event.status !== "PUBLISHED" ||
        !qrCode.isActive ||
        !qrCode.task.isActive ||
        qrCode.task.eventId !== qrCode.eventId ||
        qrCode.task.type !== "STAMP_SCAN"
      ) {
        return reject(
          "INACTIVE",
          "This stamp is not active right now.",
        );
      }

      if (qrCode.validFrom && now < qrCode.validFrom) {
        return reject(
          "INACTIVE",
          "This stamp is not active yet.",
          "QR code validFrom is in the future.",
        );
      }

      if (qrCode.validUntil && now > qrCode.validUntil) {
        return reject(
          "EXPIRED",
          "This stamp has expired.",
          "QR code validUntil is in the past.",
        );
      }

      const scanLimitPerSession = Math.max(qrCode.scanLimitPerSession, 1);
      const scanResult = await prisma.$transaction(async (tx) => {
        const acceptedScanCount = await tx.qrScan.count({
          where: {
            participantSessionId: session.id,
            qrCodeId: qrCode.id,
            status: "ACCEPTED",
          },
        });

        if (acceptedScanCount >= scanLimitPerSession) {
          await tx.qrScan.create({
            data: {
              participantSessionId: session.id,
              qrCodeId: qrCode.id,
              taskId: qrCode.taskId,
              status: "DUPLICATE",
              rejectionReason: "Participant session already accepted this QR code.",
              scannedAt: now,
            },
          });

          return {
            status: "DUPLICATE" as const,
            message: "This stamp is already on your card.",
            pointsAwarded: 0,
          };
        }

        const existingAttempt = await tx.taskAttempt.findUnique({
          where: {
            participantSessionId_taskId: {
              participantSessionId: session.id,
              taskId: qrCode.taskId,
            },
          },
          select: {
            claimedAt: true,
            status: true,
          },
        });
        const wasAlreadyCounted = existingAttempt
          ? POINT_AWARDING_STATUSES.has(existingAttempt.status)
          : false;
        const pointsAwarded = wasAlreadyCounted ? 0 : qrCode.task.points;
        const nextStatus =
          existingAttempt?.status === "VERIFIED"
            ? "VERIFIED"
            : "COMPLETED_BY_USER";

        await tx.qrScan.create({
          data: {
            participantSessionId: session.id,
            qrCodeId: qrCode.id,
            taskId: qrCode.taskId,
            status: "ACCEPTED",
            pointsAwarded,
            scannedAt: now,
          },
        });

        await tx.taskAttempt.upsert({
          where: {
            participantSessionId_taskId: {
              participantSessionId: session.id,
              taskId: qrCode.taskId,
            },
          },
          update: {
            status: nextStatus,
            claimedAt: existingAttempt?.claimedAt ?? now,
            rejectedAt: null,
            verificationRequired: false,
            proofJson: {
              type: "QR_SCAN",
              qrCodeId: qrCode.id,
              scannedAt: now.toISOString(),
            },
          },
          create: {
            participantSessionId: session.id,
            taskId: qrCode.taskId,
            status: "COMPLETED_BY_USER",
            claimedAt: now,
            verificationRequired: false,
            proofJson: {
              type: "QR_SCAN",
              qrCodeId: qrCode.id,
              scannedAt: now.toISOString(),
            },
          },
        });

        return {
          status: "ACCEPTED" as const,
          message:
            pointsAwarded > 0
              ? `Stamp accepted. ${pointsAwarded} point${
                  pointsAwarded === 1 ? "" : "s"
                } added.`
              : "Stamp accepted. This task was already counted.",
          pointsAwarded,
        };
      });

      const updatedSession =
        scanResult.status === "ACCEPTED"
          ? await recalculateSessionState(session.id)
          : await loadSessionPayload(session.id);

      return buildResult({
        ...scanResult,
        session: updatedSession,
      });
    },
  );
}
