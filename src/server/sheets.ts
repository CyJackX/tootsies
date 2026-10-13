import type { Show } from "../data/nextShow";
import type { SubmissionEnv } from "./env";

export const headers = ["application_id", "show_id", "created_at", "name", "email", "socials", "location", "attendance", "attended_before", "new_video", "portfolio", "notes", "fee_cents", "currency", "consent_text", "consented_at", "stripe_customer_id", "stripe_setup_intent_id", "stripe_payment_method_id", "stripe_customer_url", "decision", "payment_status", "organizer_notes"];
export type ApplicationRow = string[];
const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const decode64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
let cachedToken: { email: string; token: string; expires: number } | undefined;
async function accessToken(env: SubmissionEnv) {
  if (cachedToken?.email === env.GOOGLE_SERVICE_ACCOUNT_EMAIL && cachedToken.expires > Date.now()) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const head = base64url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64url(encoder.encode(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })));
  const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  if (!pem) throw new Error("Missing Google credentials");
  const key = await crypto.subtle.importKey("pkcs8", decode64(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${head}.${payload}`));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${payload}.${base64url(new Uint8Array(signature))}` }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Google authentication failed");
  const data = await response.json() as { access_token: string };
  cachedToken = { email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token: data.access_token, expires: Date.now() + 3300000 };
  return data.access_token;
}
export class Sheets {
  constructor(private env: SubmissionEnv, private show: Show) {}
  private initialized = false;
  private async spreadsheetRequest(suffix: string, body?: unknown) {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.show.spreadsheetId)}${suffix}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${await accessToken(this.env)}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Sheets setup failed");
    return response.json() as Promise<{ sheets?: { properties: { title: string } }[] }>;
  }
  private async ensureTab() {
    if (this.initialized) return;
    const title = this.show.sheetTab || this.show.id;
    const exists = async () => (await this.spreadsheetRequest("?fields=sheets.properties.title")).sheets?.some(sheet => sheet.properties.title === title);
    if (!await exists()) {
      // Create the tab and headers atomically, so an interrupted setup leaves no half-ready tab.
      const sheetId = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
      try {
        await this.spreadsheetRequest(":batchUpdate", { requests: [
          { addSheet: { properties: { sheetId, title, gridProperties: { frozenRowCount: 1 } } } },
          { updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: headers.map(stringValue => ({ userEnteredValue: { stringValue } })) }], fields: "userEnteredValue" } },
        ] });
      } catch {
        // Another first submission may have created it, or the response may have timed out.
        if (!await exists()) throw new Error("Could not create the show tab; retry saving");
      }
    }
    this.initialized = true;
  }
  private range(cells: string) { return `'${(this.show.sheetTab || this.show.id).replace(/'/g, "''")}'!${cells}`; }
  private async request(range: string, method = "GET", body?: unknown, suffix = "") {
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.show.spreadsheetId)}/values/${encodeURIComponent(this.range(range))}${suffix}`, {
      method, headers: { Authorization: `Bearer ${await accessToken(this.env)}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("Sheets request failed");
    return response.json() as Promise<{ values?: string[][] }>;
  }
  async rows(initialize = true) {
    if (initialize) await this.ensureTab();
    let { values = [] } = await this.request("A:W");
    // Upgrade only an empty tab from the previous form; populated old tabs need review.
    const previousHeaders = headers.filter(header => header !== "attended_before");
    previousHeaders.splice(previousHeaders.indexOf("portfolio") + 1, 0, "portfolio_password");
    const emptyPreviousTab = values.length === 1 && previousHeaders.every((header, index) => values[0]?.[index] === header) && values[0].length === previousHeaders.length;
    if (initialize && (values.length === 0 || emptyPreviousTab)) {
      // Also support an existing, completely blank tab; never replace mismatched headers.
      await this.request("A1:W1", "PUT", { values: [headers] }, "?valueInputOption=RAW");
      ({ values = [] } = await this.request("A:W"));
    }
    if (headers.some((header, index) => values[0]?.[index] !== header)) throw new Error("Sheets headers do not match");
    return values.slice(1);
  }
  async find(id: string) {
    const rows = await this.rows();
    const matches = rows.map((values, index) => ({ values, row: index + 2 })).filter(record => record.values[0] === id);
    if (matches.length > 1) throw new Error("Duplicate application IDs require reconciliation");
    if (matches[0] && matches[0].values[1] !== this.show.id) throw new Error("Show mismatch");
    return matches[0];
  }
  async insert(values: ApplicationRow) {
    const existing = await this.find(values[0]);
    if (existing) return existing;
    try {
      await this.request("A:W", "POST", { values: [values] }, ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
    } catch {
      // An append timeout may still have written. Never blindly append again here.
      const recovered = await this.find(values[0]);
      if (recovered) return recovered;
      throw new Error("Application save uncertain; retry to reconcile");
    }
    const saved = await this.find(values[0]);
    if (!saved) throw new Error("Application was not found after save");
    return saved;
  }
}
