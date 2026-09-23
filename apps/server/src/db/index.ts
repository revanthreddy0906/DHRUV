import Database from "better-sqlite3";
import { applySchema } from "./schema.js";

export function openDb(filename = "dhruv.db"): Database.Database {
  const db = new Database(filename);
  applySchema(db);
  return db;
}
