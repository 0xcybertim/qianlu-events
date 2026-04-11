import { type FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({
    ok: true,
    service: "@qianlu-events/api",
    timestamp: new Date().toISOString(),
  }));
}

