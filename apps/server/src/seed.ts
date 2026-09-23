import { openDb } from "./db/index.js";
import { resetToStart } from "./db/seedData.js";
import { env } from "./env.js";

/**
 * `pnpm seed`: reset server state to Start (section 13). The reference data (season48) is A's;
 * until it lands this resets to an empty seed with an empty event log.
 */
const db = openDb(env.dbFile);
resetToStart(db);
console.log(`Reset ${env.dbFile} to Start.`);
