import type { Config } from "@netlify/functions";
import { getSingletonDb } from "../lib/netlify-db";
import { runTwoWaySyncForForm } from "../lib/services/sync";

export default async (req: Request) => {
  await req.json().catch(() => ({}));
  const db = getSingletonDb();
  const liveConnections = await db.listAllLiveSyncConnections();
  const formIds = Array.from(new Set(liveConnections.map((c) => c.formId)));
  let syncedForms = 0;
  for (const formId of formIds) {
    await runTwoWaySyncForForm({ db, formId });
    syncedForms++;
  }
  console.info(`Scheduled two-way sync completed for ${syncedForms} form(s).`);
};

export const config: Config = {
  // Runs every 15 minutes UTC on published production deploys
  schedule: "*/15 * * * *",
};
