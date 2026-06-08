import dotenv from "dotenv";
dotenv.config();
import prisma from "./config/db.js";
import { ensureRuntimeConfigEntries } from "./api-url/runtime-config.service.js";
import { closeCacheConnection } from "./utils/cache.js";

// ── Startup secret validation — crash early rather than run insecure ──────────
const REQUIRED_ENV = {
  JWT_SECRET:      32,
  SESSION_SECRET:  32,
  SMS_API_KEY:     10,
  SMS_SENDER_ID:   1,
  SMS_TEMP_DLT_ID: 1,
};

let startupError = false;
for (const [key, minLen] of Object.entries(REQUIRED_ENV)) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set in .env`);
    startupError = true;
  } else if (process.env[key].length < minLen) {
    console.error(`FATAL: ${key} must be at least ${minLen} characters (got ${process.env[key].length})`);
    startupError = true;
  }
}
if (startupError) {
  console.error("Server refused to start due to missing/weak secrets. Fix .env first.");
  process.exit(1);
}

import app, { disconnectRedisSessionClient } from "./app.js";

app.get("/", (req, res) => {
  res.send("API working");
});

const PORT = process.env.PORT || 8080;

const shutdown = async (signal) => {
  console.log(`Shutdown requested (${signal}). Closing resources...`);
  try {
    await disconnectRedisSessionClient();
    await closeCacheConnection();
    await prisma.$disconnect();
    console.log("Shutdown complete.");
    process.exit(0);
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  shutdown("uncaughtException");
});

async function cleanupOldLoginLogs() {
  try {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.loginSessionLog.deleteMany({
      where: {
        createdAt: { lt: twoDaysAgo },
      },
    });
    console.log(`Login log cleanup removed ${deleted.count} entries older than 2 days.`);
  } catch (error) {
    console.error("Login log cleanup failed:", error);
  }
}

async function startServer() {
  try {
    await prisma.$connect();
    const seeded = await ensureRuntimeConfigEntries(prisma);
    console.log(`Runtime config seed check complete (created: ${seeded.created}/${seeded.total})`);
    await cleanupOldLoginLogs();
    setInterval(cleanupOldLoginLogs, 24 * 60 * 60 * 1000);
  } catch (error) {
    console.error("FATAL: could not ensure runtime config entries in api_urls:", error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
