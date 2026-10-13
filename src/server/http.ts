import type { APIContext } from "astro";
import type { SubmissionEnv } from "./env";
export const runtimeEnv = (context: APIContext) => context.locals.runtime.env as unknown as SubmissionEnv;
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export function sameOrigin(request: Request) { return request.headers.get("Origin") === new URL(request.url).origin; }
export async function readInput(request: Request) {
  const text = await request.text();
  if (text.length > 20000) throw new Error("Request too large");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid input");
  return value as Record<string, unknown>;
}
// A hidden field catches simple form-filling bots without an external service.
export function passesHoneypot(input: Record<string, unknown>) {
  return input.website === undefined || input.website === "";
}
