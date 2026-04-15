import { type FastifyInstance } from "fastify";

import {
  isFacebookWebhookVerificationValid,
  verifyFacebookWebhookSignature,
} from "../lib/facebook.js";
import { parseInstagramCommentEvents } from "../lib/instagram.js";
import { processInstagramCommentEvent } from "../lib/social-comment-verification.js";

type RawBodyRequest = {
  rawBody?: string;
};

export function registerInstagramRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      "hub.challenge"?: string;
      "hub.mode"?: string;
      "hub.verify_token"?: string;
    };
  }>("/integrations/instagram/webhook", async (request, reply) => {
    const challenge = request.query["hub.challenge"];
    const mode = request.query["hub.mode"];
    const verifyToken = request.query["hub.verify_token"];

    if (
      !isFacebookWebhookVerificationValid({
        challenge,
        mode,
        verifyToken,
      })
    ) {
      reply.code(403);

      return {
        message: "Instagram webhook verification failed.",
      };
    }

    reply.type("text/plain");

    return challenge;
  });

  app.post("/integrations/instagram/webhook", async (request, reply) => {
    const rawBody = (request as typeof request & RawBodyRequest).rawBody;
    const signatureHeader = request.headers["x-hub-signature-256"];

    if (
      !verifyFacebookWebhookSignature({
        rawBody,
        signatureHeader:
          typeof signatureHeader === "string" ? signatureHeader : undefined,
      })
    ) {
      reply.code(401);

      return {
        message: "Invalid Instagram webhook signature.",
      };
    }

    const commentEvents = parseInstagramCommentEvents(request.body);
    let processed = 0;
    let verified = 0;

    for (const commentEvent of commentEvents) {
      try {
        const result = await processInstagramCommentEvent(commentEvent);

        processed += 1;

        if (result.verified) {
          verified += 1;
        }
      } catch (error) {
        request.log.error(
          {
            commentId: commentEvent.commentId,
            error,
            instagramAccountId: commentEvent.instagramAccountId ?? null,
          },
          "Failed to process Instagram comment webhook event.",
        );
      }
    }

    return {
      ok: true,
      processed,
      received: true,
      verified,
    };
  });
}
