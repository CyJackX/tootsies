import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe, StripeCardElement } from "@stripe/stripe-js";

interface Result { error?: string; errors?: Record<string, string>; clientSecret?: string; complete?: boolean }
const applicationForm = document.querySelector<HTMLFormElement>("#application");
// Closed shows render no form and do not initialize Stripe.
if (applicationForm) {
const form = applicationForm;
const button = document.querySelector<HTMLButtonElement>("#submit-button")!;
const fields = document.querySelector<HTMLFieldSetElement>("#application-fields")!;
const status = document.querySelector<HTMLElement>("#form-status")!;
const cardError = document.querySelector<HTMLElement>("#card-error")!;
const attemptId = crypto.randomUUID();
let stripe: Stripe | null = null;
let card: StripeCardElement | undefined;
let pending: { answers: Record<string, unknown>; clientSecret: string } | undefined;
let busy = false;
let received = false;

async function post(path: string, body: unknown) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as Result;
  if (result.errors) {
    for (const [name, message] of Object.entries(result.errors)) {
      const error = document.querySelector<HTMLElement>(`[data-error="${name}"]`);
      if (error) error.textContent = message;
      const control = form.elements.namedItem(name);
      if (control instanceof HTMLElement) control.setAttribute("aria-invalid", "true");
    }
    throw new Error("Please correct the highlighted fields.");
  }
  if (!response.ok) throw new Error(result.error || "Please try again.");
  return result;
}

async function initializeCard() {
  if (form.dataset.open !== "true" || !form.dataset.stripeKey) return;
  try {
    stripe = await loadStripe(form.dataset.stripeKey);
    if (!stripe) throw new Error("Card entry is unavailable. Please reload or contact us.");
    card = stripe.elements().create("card", { style: { base: { color: "#004356", fontSize: "16px" } } });
    card.on("change", event => { cardError.textContent = event.error?.message || ""; });
    card.on("ready", () => { button.disabled = false; });
    card.mount("#card-element");
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Could not load secure card entry. Please reload.";
  }
}

window.addEventListener("beforeunload", event => {
  if (pending && !received) { event.preventDefault(); event.returnValue = ""; }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || received || !stripe || !card) return;
  busy = true; button.disabled = true; status.textContent = "Preparing secure card setup...";
  document.querySelectorAll<HTMLElement>("[data-error]").forEach(element => { element.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach(element => element.removeAttribute("aria-invalid"));
  try {
    if (!pending) {
      const data = Object.fromEntries(new FormData(form));
      const answers = { ...data, consent: data.consent === "on", consentText: form.querySelector("#consent-text")?.textContent?.trim() };
      const result = await post("/api/applications", {
        ...answers, attemptId, showId: form.dataset.show,
      });
      if (!result.clientSecret) throw new Error("Could not start card setup. Please retry.");
      // Memory only: no cookies, local/session storage, or server draft records.
      pending = { answers, clientSecret: result.clientSecret };
      fields.disabled = true;
    }
    status.textContent = "Saving your card securely with Stripe...";
    const setup = await stripe.retrieveSetupIntent(pending.clientSecret);
    if (setup.error) throw new Error(setup.error.message || "Could not check card setup. Please retry.");
    if (setup.setupIntent?.status !== "succeeded") {
      const result = await stripe.confirmCardSetup(pending.clientSecret, {
        payment_method: { card, billing_details: { name: String(pending.answers.name).trim(), email: String(pending.answers.email).trim() } },
      });
      if (result.error) throw new Error(result.error.message || "Could not save your card. Please retry.");
      if (result.setupIntent?.status !== "succeeded") throw new Error("Card setup is not finished yet. Please try again.");
    }
    button.textContent = "Retry saving application";
    status.textContent = "Card saved. Saving your application... Keep this page open.";
    const result = await post("/api/applications/complete", { ...pending.answers, clientSecret: pending.clientSecret });
    if (!result.complete) throw new Error("Could not confirm your application. Keep this page open and retry saving.");
    received = true; pending = undefined;
    form.reset(); card.clear(); card.destroy(); form.hidden = true;
    status.textContent = "Application received! Your card and application are saved. You have not been charged. We will contact you with our decision.";
    status.focus();
    status.scrollIntoView({ block: "center" });
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Please retry. Keep this page open so your answers are not lost.";
    button.disabled = false;
  } finally { busy = false; }
});

void initializeCard();

}
