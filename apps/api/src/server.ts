import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(serverDir, "..");
const repoRoot = resolve(apiDir, "..", "..");

dotenv.config({ path: resolve(repoRoot, ".env") });
dotenv.config({ path: resolve(apiDir, ".env"), override: true });

const [{ getApiConfig }, { createApp }] = await Promise.all([
  import("@qianlu-events/config"),
  import("./app.js"),
]);

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
