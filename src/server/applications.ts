import { nextShow, isAccepting } from "../data/nextShow";
import type { SubmissionEnv } from "./env";
import { Sheets } from "./sheets";
import { stripe, type SetupIntent, type PaymentMethod } from "./stripe";
import { validateAnswers, type Answers } from "./validation";

const integration = "tvv-applications-v2";
async function answersHash(answers: Answers) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(answers)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

// No Google writes or customer records here. Stripe gets a digest, not answers.
export async function beginApplication(env: SubmissionEnv, input: Record<string, unknown>) {
  const show = nextShow;
  if (!isAccepting(show) || input.showId !== show.id) return { error: "Applications are closed or this form is out of date. Please reload.", status: 409 };
  const { answers, errors } = validateAnswers(input);
  if (Object.keys(errors).length) return { errors, status: 400 };
  if (typeof input.attemptId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.attemptId)) return { error: "Please reload the form and try again.", status: 400 };
  if (show.id.length > 500) throw new Error("Show metadata exceeds Stripe limits");
  const hash = await answersHash(answers);
  const intent = await stripe<SetupIntent>(env, "setup_intents", {
    usage: "off_session", "payment_method_types[0]": "card",
    "metadata[integration]": integration, "metadata[show_id]": show.id,
    "metadata[answers_hash]": hash, "metadata[fee_cents]": String(show.feeCents),
    "metadata[currency]": show.currency,
  }, `application:${input.attemptId}:${hash}:setup`);
  if (!intent.client_secret) throw new Error("Missing setup client secret");
  return { clientSecret: intent.client_secret, status: 200 };
}

// The browser sends its answers only after setup. Verify Stripe and the original
// answer digest before touching Sheets. The SetupIntent ID identifies the row.
export async function finishApplication(env: SubmissionEnv, input: Record<string, unknown>) {
  const { answers: a, errors } = validateAnswers(input);
  if (Object.keys(errors).length) return { errors, status: 400 };
  const secret = typeof input.clientSecret === "string" ? input.clientSecret : "";
  const match = /^(seti_[a-zA-Z0-9]+)_secret_[a-zA-Z0-9]+$/.exec(secret);
  if (!match) return { error: "Invalid card setup reference.", status: 400 };
  const intent = await stripe<SetupIntent>(env, `setup_intents/${encodeURIComponent(match[1])}`);
  if (intent.client_secret !== secret || intent.metadata.integration !== integration || intent.usage !== "off_session") return { error: "Invalid card setup reference.", status: 400 };
  if (intent.status !== "succeeded" || !intent.payment_method) return { error: "Card setup has not succeeded yet. Please try again.", status: 409 };
  if (intent.metadata.answers_hash !== await answersHash(a)) return { error: "These answers do not match the authorized application. Please contact us.", status: 409 };
  const show = nextShow;
  if (intent.metadata.show_id !== show.id) throw new Error("This application belongs to a different show");
  const fee = Number(intent.metadata.fee_cents);
  if (!Number.isSafeInteger(fee) || fee <= 0 || !/^[a-z]{3}$/.test(intent.metadata.currency)) throw new Error("Invalid fee snapshot");
  const sheets = new Sheets(env, show);
  const existing = await sheets.find(intent.id);
  if (existing) {
    if (!existing.values[16] || existing.values[17] !== intent.id || existing.values[18] !== intent.payment_method) throw new Error("Conflicting application record");
    return { complete: true, status: 200 };
  }
  const method = await stripe<PaymentMethod>(env, `payment_methods/${encodeURIComponent(intent.payment_method)}`);
  if (method.type !== "card") throw new Error("Unsupported payment method");
  // Checking an attached card makes retry recovery work beyond Stripe's
  // idempotency retention. Never reuse another application's customer.
  let customerId: string;
  if (method.customer) {
    const customer = await stripe<{ id: string; metadata: Record<string, string> }>(env, `customers/${encodeURIComponent(method.customer)}`);
    if (customer.metadata.application_id !== intent.id || customer.metadata.show_id !== show.id) throw new Error("Card is attached to another application");
    customerId = customer.id;
  } else {
    const customer = await stripe<{ id: string }>(env, "customers", {
      name: a.name, email: a.email, description: show.subtitle,
      "metadata[application_id]": intent.id, "metadata[show_id]": show.id,
    }, `application:${intent.id}:customer`);
    customerId = customer.id;
    await stripe(env, `payment_methods/${encodeURIComponent(method.id)}/attach`, { customer: customerId }, `application:${intent.id}:attach`);
  }
  const created = new Date(intent.created * 1000).toISOString();
  const customerURL = `https://dashboard.stripe.com/${intent.livemode ? "" : "test/"}customers/${customerId}`;
  await sheets.insert([intent.id, show.id, created, a.name, a.email, a.socials, a.location, a.attendance, a.attendedBefore, a.newVideo, a.portfolio, a.notes, String(fee), intent.metadata.currency, typeof input.consentText === "string" ? input.consentText : "", created, customerId, intent.id, method.id, customerURL, "", "", ""]);
  return { complete: true, status: 200 };
}
