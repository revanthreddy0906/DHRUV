import { DEFAULT_SCENARIO, scenarioById } from "@dhruv/seed";
import { openDb } from "./db/index.js";
import { resetToStart, setActiveScenario } from "./db/seedData.js";
import { env } from "./env.js";

/**
 * `pnpm seed [scenario]`: reset server state to Start (section 13): a scenario's reference data and
 * an empty event log. season48 by default; `pnpm seed aurora2016` for the 2016 grounding run-through.
 */
const id = process.argv[2] ?? DEFAULT_SCENARIO;
const scenario = scenarioById(id);
if (!scenario) {
  console.error(`No scenario "${id}". Try season48 or aurora2016.`);
  process.exit(1);
}
const db = openDb(env.dbFile);
resetToStart(db, scenario.seed);
setActiveScenario(db, scenario.id);
db.close();
console.log(`Reset ${env.dbFile} to Start (${scenario.id}).`);
