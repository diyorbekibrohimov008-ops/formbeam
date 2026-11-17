import type { Config, Context } from "@netlify/functions";
import { getSingletonDb } from "../lib/netlify-db";
import { createNetlifyBlobStorage } from "../lib/storage";
import { createApp } from "../lib/app";

let cachedProdApp: ReturnType<typeof createApp> | null = null;
let cachedPreviewApp: ReturnType<typeof createApp> | null = null;

function getAppForContext(isProd: boolean) {
  const db = getSingletonDb();
  if (isProd) {
    if (!cachedProdApp) {
      cachedProdApp = createApp({
        db,
        blobs: createNetlifyBlobStorage("formbeam-prod", false),
        getEnv: (k) => Netlify.env.get(k),
      });
    }
    return cachedProdApp;
  }
  if (!cachedPreviewApp) {
    cachedPreviewApp = createApp({
      db,
      blobs: createNetlifyBlobStorage("formbeam-preview", true),
      getEnv: (k) => Netlify.env.get(k),
    });
  }
  return cachedPreviewApp;
}

export default async (req: Request, context: Context) => {
  const isProd = context.deploy?.context === "production";
  const app = getAppForContext(isProd);
  return app.fetch(req);
};

export const config: Config = {
  path: ["/api/*", "/f/*", "/d/*"],
};
