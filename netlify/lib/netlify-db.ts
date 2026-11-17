import { getDatabase } from "@netlify/database";
import { createFormBeamDb, type FormBeamDb } from "./db";

let cachedDb: FormBeamDb | null = null;

/** Returns a container-scoped singleton FormBeamDb, initialized on first request so Netlify runtime env is populated. */
export function getSingletonDb(): FormBeamDb {
  if (!cachedDb) {
    const netlifyDb = getDatabase();
    cachedDb = createFormBeamDb(netlifyDb.pool);
  }
  return cachedDb;
}
