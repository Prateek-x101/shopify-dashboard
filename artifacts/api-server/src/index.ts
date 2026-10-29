import { openDb, migrateDb, dbKind } from "@workspace/db";
import { DATA_DIR, MIGRATIONS_DIR } from "./config";
import { logger } from "./lib/logger";

process.on("unhandledRejection", (reason) => {
  logger.error({ reason: String(reason) }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
  // A failing integration (socket drop, provider bug) must not take the whole dashboard down
  logger.error({ err: err.message }, "uncaughtException");
});

const port = Number(process.env["PORT"] ?? 5000);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env["PORT"]}"`);
}

async function main() {
  openDb(DATA_DIR);
  await migrateDb(MIGRATIONS_DIR);
  logger.info({ database: dbKind() }, "database ready");

  // Imported after the DB is open: these modules query on load
  const { default: app } = await import("./app");
  const { startScheduler } = await import("./services/scheduler");
  const { resumeWebSessions } = await import("./integrations/whatsapp-web");
  const { autoLinkAccounts } = await import("./services/linking");
  const { backfillIntents } = await import("./services/intent");
  await autoLinkAccounts().catch((e) => logger.warn({ err: e.message }, "auto-link failed"));
  backfillIntents().catch(() => {});

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
    startScheduler();
    resumeWebSessions().catch((e) => logger.warn({ err: e.message }, "resume WhatsApp sessions failed"));
  });
}

main().catch((err) => {
  logger.error({ err: err.message, stack: err.stack }, "startup failed");
  process.exit(1);
});
