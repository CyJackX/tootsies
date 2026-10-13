import type { Show } from "../data/nextShow";
import type { SubmissionEnv } from "./env";

// Local readiness check only; credentials and spreadsheet permissions are verified by API calls.
export function applicationsConfigured(show: Show, env: Partial<SubmissionEnv>) {
  const present = (value: unknown) => typeof value === "string" && value.trim().length > 0;
  return present(show.id) && show.id.length <= 500 && present(show.spreadsheetId) &&
    Number.isSafeInteger(show.feeCents) && show.feeCents > 0 && /^[a-z]{3}$/.test(show.currency) &&
    present(env.GOOGLE_SERVICE_ACCOUNT_EMAIL) && present(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) &&
    present(env.STRIPE_SECRET_KEY) && present(env.PUBLIC_STRIPE_PUBLISHABLE_KEY);
}
