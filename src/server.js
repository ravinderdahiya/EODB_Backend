import dotenv from "dotenv";
dotenv.config();
import prisma from "./config/db.js";
import { ensureRuntimeConfigEntries } from "./api-url/runtime-config.service.js";

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

import app from "./app.js";

app.get("/", (req, res) => {
  res.send("API working");
});

const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    const seeded = await ensureRuntimeConfigEntries(prisma);
    console.log(`Runtime config seed check complete (created: ${seeded.created}/${seeded.total})`);
  } catch (error) {
    console.error("FATAL: could not ensure runtime config entries in api_urls:", error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
