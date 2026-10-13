import type { SubmissionEnv } from "./env";
export interface SetupIntent {
  id: string; client_secret: string; status: string; usage: string;
  created: number; livemode: boolean; payment_method: string | null;
  metadata: Record<string, string>;
}
export interface PaymentMethod { id: string; type: string; customer: string | null }
export async function stripe<T>(env: SubmissionEnv, path: string, data?: Record<string, string>, key?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: data ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": "2025-06-30.basil", ...(key ? { "Idempotency-Key": key } : {}) },
    body: data ? new URLSearchParams(data) : undefined, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Stripe request failed");
  return response.json() as Promise<T>;
}
