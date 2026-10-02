import config from "./config/index.js";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { initStore } from "./store/fileStore.js";
import app from "./app.js";

async function start(): Promise<void> {
  initStore();
  await connectMongo();

  const server = app.listen(config.port, () => {
    console.log(`Portfolio API listening on http://localhost:${config.port}`);
    console.log(
      `  storage:  ${config.mongodbUri ? "MongoDB" : "data/messages.json"}`
    );
    console.log(
      `  email:    ${config.smtpEnabled ? `on -> ${config.smtp.to}` : "off (SMTP not configured)"}`
    );
    console.log(`  cors:     ${config.allowedOrigins.map(String).join(", ")}`);
    if (!config.admin.password) {
      console.warn("  warning:  ADMIN_PASSWORD is empty, the inbox is unprotected");
    }
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received, closing server`);
    server.close(async () => {
      await disconnectMongo();
      process.exit(0);
    });
    // do not hang forever on a stuck connection
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
