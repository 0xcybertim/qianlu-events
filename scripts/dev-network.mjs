import { spawn } from "node:child_process";
import net from "node:net";
import process from "node:process";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

const databaseUrl = new URL(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:54329/qianlu_events?schema=public",
);
const databaseHost = databaseUrl.hostname;
const databasePort = Number(databaseUrl.port || 5432);
const dockerStartTimeoutMs = 30000;

function canConnect(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    let timeout;
    if (options.timeoutMs) {
      timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`${command} ${args.join(" ")} timed out`));
      }, options.timeoutMs);
    }

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${signal ?? `code ${code}`}`,
        ),
      );
    });
  });
}

async function ensureDatabase() {
  if (await canConnect(databaseHost, databasePort)) {
    console.log(`Database is already reachable at ${databaseHost}:${databasePort}`);
    return;
  }

  console.log("Starting database with Docker Compose...");

  try {
    await run("docker", ["compose", "up", "-d", "db"], {
      timeoutMs: dockerStartTimeoutMs,
    });
  } catch (error) {
    if (await canConnect(databaseHost, databasePort)) {
      console.warn(
        `Docker did not finish cleanly, but the database is reachable at ${databaseHost}:${databasePort}. Continuing.`,
      );
      return;
    }

    throw error;
  }

  if (!(await canConnect(databaseHost, databasePort, 5000))) {
    throw new Error(
      `Database is not reachable at ${databaseHost}:${databasePort} after Docker Compose startup.`,
    );
  }
}

await ensureDatabase();

const runner = process.platform === "win32" ? "npx.cmd" : "npx";
const dev = spawn(
  runner,
  [
    "concurrently",
    "-n",
    "web,api",
    "-c",
    "cyan,magenta",
    "npm run dev --workspace @qianlu-events/web -- --host 0.0.0.0 --port 5173 --strictPort",
    "npm run dev:api",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: "../../.env",
    },
  },
);

dev.once("exit", (code) => {
  process.exit(code ?? 0);
});
