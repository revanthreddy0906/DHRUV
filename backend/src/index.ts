import { openDb } from "./db/index.js";
import { buildApp } from "./app.js";
import { env } from "./env.js";

const db = openDb(env.dbFile);
const app = buildApp(db);

// Close the HTTP server, then SQLite, so the WAL is checkpointed and nothing is left half-written.
async function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

app.listen({ port: env.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
