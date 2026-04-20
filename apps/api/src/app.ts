import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { clerkPlugin } from "@clerk/fastify";
import Fastify from "fastify";

import { registerAdminRoutes } from "./routes/admin.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerFacebookRoutes } from "./routes/facebook.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerInstagramRoutes } from "./routes/instagram.js";
import { registerQrScanRoutes } from "./routes/qr-scans.js";
import { registerSessionRoutes } from "./routes/sessions.js";
import { registerStaffRoutes } from "./routes/staff.js";
import { registerTaskAttemptRoutes } from "./routes/task-attempts.js";
import { registerVerificationRoutes } from "./routes/verification.js";

export function createApp() {
  const app = Fastify({
    logger: true,
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (request, body, done) => {
      const rawBody =
        typeof body === "string" ? body : body.toString("utf8");

      (request as typeof request & { rawBody?: string }).rawBody = rawBody;

      if (!rawBody) {
        done(null, null);

        return;
      }

      try {
        done(null, JSON.parse(rawBody));
      } catch (error) {
        done(error as Error, undefined);
      }
    },
  );

  void app.register(cors, {
    origin: true,
    credentials: true,
  });

  void app.register(cookie, {
    hook: "onRequest",
  });

  if (process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY) {
    void app.register(clerkPlugin, {
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }

  registerHealthRoutes(app);
  registerFacebookRoutes(app);
  registerInstagramRoutes(app);
  registerEventRoutes(app);
  registerSessionRoutes(app);
  registerQrScanRoutes(app);
  registerTaskAttemptRoutes(app);
  registerVerificationRoutes(app);
  registerStaffRoutes(app);
  registerAdminRoutes(app);

  return app;
}
