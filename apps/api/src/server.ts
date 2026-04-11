import "dotenv/config";

import { getApiConfig } from "@qianlu-events/config";

import { createApp } from "./app.js";

const config = getApiConfig();
const app = createApp();

try {
  await app.listen({
    host: config.host,
    port: config.port,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
