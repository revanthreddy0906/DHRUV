import { season48 } from "@dhruv/seed";
import { openDb } from "./db/index.js";
import { resetToStart } from "./db/seedData.js";
import { env } from "./env.js";

/** `pnpm seed`: reset server state to Start (section 13): the season48 reference data and an empty event log. */
const db = openDb(env.dbFile);
resetToStart(db, season48);
db.close();
console.log(`Reset ${env.dbFile} to Start (season48).`);
