# Show applications

The form uses embedded Stripe Card Element, Astro endpoints, and the direct Google Sheets API. Applying is free. A Sheet row is created only after successful card setup. Decisions, charges, refunds, and emails remain manual.

## Where data goes

1. Applicants fill in their answers and enter their card in a Stripe-hosted iframe on the same page.
2. The server validates answers and consent, then creates a card-only, off-session SetupIntent. It stores no draft application. Stripe metadata contains show/fee details and a SHA-256 digest binding the answers to the setup, not the answers themselves.
3. Stripe confirms and saves the card, including any authentication challenge. Card details never pass through the site's server.
4. The browser sends its original answers and Stripe client secret to the completion endpoint. The server independently retrieves the SetupIntent, verifies success and the answer digest, creates a customer, attaches the card, and appends a completed application to Sheets.
5. The browser clears the form and its in-memory pending state only after Sheets confirms the save. No cookies, local storage, session storage, or database hold application drafts.

Pending answers exist only in the open form tab. If someone closes or refreshes it before “Application received,” those answers are lost even if Stripe has saved the card. A Sheet outage can be retried from the still-open page without repeating card setup. There is no background webhook capable of reconstructing answers that the browser no longer has. The form warns against leaving while a save is pending.

Abandoned setup does not create an incomplete Sheet row or customer. Stripe still retains its SetupIntent, and any card/billing information the applicant successfully supplies to Stripe. Successful card setup followed by abandonment during the final save may leave Stripe records without a Sheet application. Do not charge those records; eligibility requires a completed Sheet row and manual acceptance.

## Google setup

1. Create a Google Cloud project, enable the Google Sheets API, and create a service account. No project-wide editor role is needed.
2. Generate a service-account JSON key. Store its `client_email` as `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `private_key` as `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`. Real PEM newlines and escaped `\n` are supported. Never commit the key.
3. Create a private spreadsheet and share only it with the service-account email as an Editor. Restrict human access to organizers.
4. Configure the spreadsheet ID in `src/data/nextShow.ts`. On the first completed application, the app creates a tab named after the show ID and adds the headers automatically. An optional `sheetTab` overrides the name. An existing blank tab gets headers automatically; a populated tab with mismatched headers is left untouched and saving stops. No CSV import is required.

The new template omits the old setup-status and Checkout-session columns: every application row represents successful setup. If you previously created a Sheet from the earlier template, create a fresh tab using this template; do not change a populated old tab without reviewing its records.

Columns A:T are application-owned; U:W (`decision`, `payment_status`, `organizer_notes`) are yours. Retry completion never overwrites an existing row. Use filter views for review; preserve IDs and headers. Answers use `RAW` values, so strings beginning with `=` are not executed as formulas.

## Credentials

Copy `.dev.vars.example` to ignored `.dev.vars` for local development. Fill in:

| Setting | Source |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google service-account JSON `client_email` |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Google service-account JSON `private_key` |
| `STRIPE_SECRET_KEY` | Stripe account secret API key, initially `sk_test_...` |
| `PUBLIC_STRIPE_PUBLISHABLE_KEY` | Matching Stripe publishable key, initially `pk_test_...` |

The Stripe publishable key is intentionally public. All other settings are private. Production values belong in Cloudflare Worker secrets, set via its settings or `npx wrangler secret put NAME`. Use a secret even for the publishable key to avoid dashboard variables being removed by a deployment.

There is no CAPTCHA service to configure. The form retains a hidden honeypot field, same-origin checks, input validation, request-size limits, and duplicate-submit protection. These catch simple mistakes/bots but are not robust rate limiting. Manual review and charging limit payment consequences; they do not prevent automated requests to the public setup endpoint. If actual abuse appears, revisit protection based on that evidence.

No application signing secret or Stripe webhook signing secret is needed. If you configured the previous webhook for this application, disable that specific endpoint in Stripe; do not disable unrelated account integrations. Old unused signing secrets can be removed from this Worker's settings.

Each completed application gets its own customer, including distinct groups sharing one contact email. Customer metadata identifies the show and SetupIntent/application ID; customer name/email are supplied for organizing charges. Original work samples, access passwords, and notes are kept in Sheets, not Stripe metadata. The Stripe client secret is used transiently in the browser and a request body, never a URL or log.

## Future shows

Edit the single current-show configuration in `src/data/nextShow.ts`, using a new unique ID for each show. The app creates the tab automatically using that ID (or set `sheetTab` to use a different name). Past configurations do not need to be retained; previously saved applications remain in Sheets. An unfinished application from a different show cannot be completed after switching shows. Configure title, venue, screening time, production instructions, notification date, fee/currency. Default fee: `2500` cents in `usd`.

`open` controls whether applications are invited. The form also stays hidden, and new card setup is blocked, unless all four credentials, a show ID, spreadsheet ID, positive fee, and currency are configured. This checks local configuration presence, not whether external credentials or spreadsheet permissions are valid. Deadline and notification date are display-only strings, such as `February 1 at midnight` and `Mid-February`; they are not parsed or enforced. Close applications manually by setting `open: false`. Credentials and the spreadsheet still need to be configured for submissions to save successfully.

Edit the visible wording in the `consent-text` span in `src/pages/submit.astro`. The submission script reads that text directly. The browser sends that displayed wording for recording; the server requires the checked checkbox but does not validate wording or require text. Text, when supplied, is saved only in Sheets. Keep the amount in this wording consistent with `feeCents`/`currency` in the show configuration. The SetupIntent snapshots fee, currency, and its server-created timestamp. Completion uses that snapshot even after fees change or the show closes. No application can start when `open` is false.

The homepage and application form share `src/data/nextShow.ts`. Set `phase` to `submissions` when inviting applications, or `tickets` when promoting attendance; configure `ticketsUrl` for the current show before switching to tickets. `open` independently controls whether applications are accepted. Screening time, venue, deadline, and notification date feed both pages automatically. `youtubeEmbedUrl` controls the homepage video.

## Manual acceptance and charges

1. Review completed Sheet applications; mark acceptance in U and email participants manually.
2. Open the row's Stripe customer link. Verify application/show IDs, the saved card, and the original authorized fee/currency in the row.
3. Check existing successful payments before charging. Create a payment in Stripe's dashboard using the saved method, for the authorized fee, identifying the show/application in its description. Charge once per accepted application; never charge a rejected or missing application.
4. Record payment outcome/reference in W:X. Enable Stripe receipts if desired; the site sends no email.

For declines or required authentication, contact the participant and manually send a Stripe-hosted invoice/payment link for the same fee. Check for prior successful payment before retrying. Refund in Stripe and record it manually. Verify your account's actual dashboard workflow in test mode before opening submissions.

## Recovery and reconciliation

The SetupIntent ID is the application ID. Repeated completion requests find and reuse the same row, preserving your columns. Before appending, the API checks for that ID; after an ambiguous append error it checks again instead of blindly appending. A customer/card already attached for that application is reused on retry.

Sheets has no transactions or unique constraints. Concurrent completion requests can still produce duplicate IDs, and moving rows can race with saves. Duplicate-ID lookup stops rather than selecting a row. Disabling repeated submit clicks limits normal browser duplicates; this is not an exactly-once guarantee.

Run `npm run applications:reconcile -- SHOW_ID` with Google credentials in the process environment (Node 22+, installed dependencies). It reads Sheets and reports duplicate IDs and missing Stripe references without writing, deleting, charging, or printing answers/contact details. `.dev.vars` is not automatically loaded by the command.

For duplicates, pause applications and manually review/merge records and organizer notes before removing a duplicate. For a card saved without an application, there are no server-side answers to recover: ask the applicant to retry from their original open tab or contact you to arrange a new application. If customer creation succeeded but card attachment failed and retry happens after Stripe's idempotency retention window, inspect customer metadata for an orphaned customer. Do not charge orphaned records or delete cards automatically.

## Verification and launch

- Run `npm test` and `npm run check` (build, TypeScript, deployment dry run).
- With test Stripe keys and a test Sheet, check desktop/mobile layout, keyboard access, validation, unchecked consent, `N/A`, attendance `No`, and separate applications sharing an email.
- Confirm failed/abandoned setup creates no Sheet row. Complete setup with Stripe test cards; confirm no charge, successful SetupIntent, attached saved card, and exactly one row on normal repeated saves.
- Verify a mocked/forged success cannot insert, changed answers cannot reuse a setup, manual columns survive retries, and changing show fees does not alter an existing commitment.
- Test a Sheets outage after card setup: keep the page open, restore access, and retry without confirming the card again. Test authentication challenges and manually charging the saved card, including decline/recovery paths.
- Switch to matching live Stripe keys, verify the private Sheet, configure actual show details, open the show, and deploy.

Provider tests are mocked. Live credentials, embedded card entry, authentication, and manual charges still need account-level test-mode verification. No deployment or live payment is part of this change.

## Checking configured credentials

Run `npm run applications:test-integrations` after filling in `.dev.vars` and the spreadsheet ID. It authenticates to Google, creates the configured show tab and headers if missing, and reads them back. It also authenticates the Stripe secret key with a read-only request and checks that the publishable key uses the same test/live mode. It does not verify that the publishable key belongs to the same account, or exercise card authentication. No application rows, Stripe customers, card setups, or charges are created, and no credential values or answers are printed.

## Form fields and header changes

The two required Yes/No questions are stored separately as `attendance` (can attend this screening) and `attended_before` (has attended a prior show). The commitment accepts `YESTOOTSIE`, case-insensitively. Portfolio links and their passwords share the required `portfolio` answer, matching the form; there is no separate password field. Name, email, location, portfolio, both Yes/No answers, commitment, and fee consent are required. Socials and notes are optional.

An empty tab with the previous headers automatically upgrades to this layout. A populated tab with old headers is never rewritten automatically; choose a new `sheetTab` or review and migrate the old columns before using it. Adding questions requires corresponding updates to server validation and the saved row/header mapping.
