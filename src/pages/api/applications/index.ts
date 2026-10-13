import type { APIRoute } from "astro";
import { beginApplication } from "../../../server/applications";
import { passesHoneypot, json, readInput, runtimeEnv, sameOrigin } from "../../../server/http";
export const prerender = false;
export const POST: APIRoute = async context => {
  if (!sameOrigin(context.request)) return json({ error: "Invalid origin." }, 403);
  try {
    const input = await readInput(context.request);
    const env = runtimeEnv(context);
    if (!passesHoneypot(input)) return json({ error: "Invalid application request." }, 400);
    const result = await beginApplication(env, input);
    return json(result, result.status);
  } catch {
    return json({ error: "We could not start card setup. Your answers remain on this page. Please retry; contact us if the problem continues." }, 503);
  }
};
