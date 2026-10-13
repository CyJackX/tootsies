import type { APIRoute } from "astro";
import { finishApplication } from "../../../server/applications";
import { json, readInput, runtimeEnv, sameOrigin } from "../../../server/http";
export const prerender = false;
export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return json({ error: "Invalid origin." }, 403);
  try {
    const result = await finishApplication(runtimeEnv(context), await readInput(context.request));
    return json(result, result.status);
  } catch {
    return json({ error: "Your card may be saved, but we could not confirm your application was saved. Keep this page open and retry saving. You have not been charged." }, 503);
  }
};
