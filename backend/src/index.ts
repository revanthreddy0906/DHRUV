import { openDb } from "./db/index.js";
import { buildApp } from "./app.js";
import { env } from "./env.js";

const db = openDb(env.dbFile);
const app = buildApp(db);

app.listen({ port: env.port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
