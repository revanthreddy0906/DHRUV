import { openDb } from "./db/index.js";
import { buildApp } from "./app.js";

const db = openDb(process.env.DHRUV_DB_FILE ?? "dhruv.db");
const app = buildApp(db);

const port = Number(process.env.PORT ?? 4000);

app
  .listen({ port, host: "0.0.0.0" })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
