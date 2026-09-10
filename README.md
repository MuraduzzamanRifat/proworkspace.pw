# ai-agent-ebook-funnel

Single-product sales funnel for **এআই এজেন্ট দিয়ে ইনকাম** (Corieosity), a
275-page Bengali guide to n8n, MCP and AI automation. Sold as a digital
download at ৳১,৯৯০.

Built 2026-09-10. Not yet deployed. See **Production checklist** before it
takes a real payment.

---

## What this is, and what it replaces

The product already had a CartFlows funnel prepared for WordPress
(`../ai-agent-ebook-bn/sales/cartflows/`). This is a coded replacement:
server-rendered, its own database, its own admin, no WordPress.

It is a **different product** from the digital-marketing-guide currently
selling on proworkspace.online. That funnel is untouched.

`https://proworkspace.shop` was used as a visual reference only. None of its
code was copied; no local source for it exists.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15.5 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 |
| Database | Neon PostgreSQL via Drizzle ORM 0.38 |
| Payments | UddoktaPay / Paymently |
| Email | Resend |
| Hosting | Vercel |
| Runtime | Node 20.9+ |

### Decisions worth knowing

**Neon WebSocket driver, not HTTP.** The HTTP driver cannot open a
transaction. Order creation writes an order, an item snapshot and a checkout
session together; a partial write there is a customer who paid for a row that
does not exist.

**scrypt from `node:crypto`, not bcrypt or argon2.** Those are native modules
needing a compiler or a prebuilt binary per target. This installs cleanly on
Windows and on Vercel's builders with no toolchain.

**Money is integer poisha, never a float.** ৳1,990 is stored as `199000`.
Every money column is named `*_poisha` so a unit mix-up is visible in review.

**Idempotency is enforced by unique indexes, not application checks.**
`payments.gateway_invoice_id` and `orders.idempotency_key` are UNIQUE. A
duplicate loses a race against the constraint instead of creating a second
order. Settlement uses a conditional `UPDATE ... WHERE status IN (unpaid)`, so
exactly one caller wins.

**One offer ships.** The offer system, coupons, order bump and upsell are fully
built in the schema and pricing engine, and seeded with the single real offer.
Inventing a fake struck-through price or a "2-pack" for one PDF would be a dark
pattern, and the book's own evidence policy argues against it.

---

## Setup

Node is not on PATH on the build machine. Prefix commands:

```powershell
$env:Path = "E:\VS Code File\toolchain\node-v20.18.1-win-x64;" + $env:Path
```

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:migrate
npm run db:seed
npm run dev
```

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Environment variables

Required in production. Without them, every API route and admin page answers
**503 `Service not configured`** with the names of the missing variables in the
body and in a structured log line — never their values. The landing page keeps
working from the seeded catalogue, and the checkout page shows a "payments not
yet enabled" notice instead of a form. Nothing crashes, and nothing pretends
to work.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public origin, no trailing slash. Builds redirect, webhook and download URLs. |
| `DATABASE_URL` | Neon pooled connection string. |
| `SESSION_SECRET` | Signs admin session cookies. 32+ chars. |
| `DOWNLOAD_SECRET` | Signs download and receipt tokens. 32+ chars. |
| `UDDOKTAPAY_BASE_URL` | Panel base URL, no trailing slash. |
| `CRON_SECRET` | Bearer token Vercel Cron must present to `/api/cron/*`. 32+ chars. |
| `EBOOK_FILE_URL` | Private URL of the PDF bundle. Never public. |

> **`NEXT_PUBLIC_SITE_URL` is inlined at BUILD time, not read at runtime.**
> Next.js substitutes every `NEXT_PUBLIC_*` value into the bundle during
> `next build`. Setting it only as a runtime variable leaves `robots.txt`,
> `sitemap.xml`, download links and gateway redirect URLs pointing at
> `localhost:3000`. It must be present in Vercel's environment **before** the
> build runs, and changing it requires a redeploy, not a restart.

Optional. The funnel works fully without every one of these.

| Variable | Effect if unset |
|---|---|
| `UDDOKTAPAY_API_KEY` | **Checkout is disabled**: the checkout page shows a notice instead of a form, the API answers "gateway unavailable", the webhook refuses. Admin, landing and cron all keep working. Sent as `RT-UDDOKTAPAY-API-KEY`; inbound webhooks must present the same value. |
| `RESEND_API_KEY` | Delivery emails are logged, not sent. Orders still complete. |
| `MAIL_FROM` | Falls back to a placeholder sender. |
| `ADMIN_ALERT_EMAIL` | No new-order or mismatch alerts. |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | Seed creates no admin user. |
| `NEXT_PUBLIC_META_PIXEL_ID` | No browser pixel. |
| `META_CAPI_ACCESS_TOKEN` | No server-side Purchase events. |
| `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | No GA4. |

---

## The money path

```
/checkout
  POST /api/checkout          price computed server-side from DB rows
    -> order created `pending` + item snapshot, in one transaction
    -> UddoktaPay /api/checkout-v2
    -> order `payment_pending`, payment row holds the invoice id
  customer pays on the gateway's hosted page
    |
    +-- webhook  -> POST /api/webhooks/uddoktapay
    +-- redirect -> /payment/verify
```

Both paths call the gateway's `verify-payment` and then `settlePayment()`.
They race on purpose. Whichever arrives first settles the order; the other
becomes a no-op. Webhooks get lost, and a customer staring at a spinner is a
refund request.

**The browser is never believed.** The webhook body is treated as a
notification, not evidence: only the invoice id is taken from it, and the
gateway is then asked directly what happened. If the shared API key ever leaks,
a forged webhook still cannot manufacture a paid order.

**Amount reconciliation.** If the gateway collected less than the order total,
the order is *not* fulfilled. It is flagged, an alert email is sent, and a
human decides.

---

## Testing

```bash
npm run verify        # typecheck + tests
npm test
npm run typecheck
npm run build
```

107 tests cover money arithmetic, the order state machine, the pricing engine,
the checkout wire contract, tokens and password hashing. They need no database
and no network.

---

## Deployment (Vercel)

1. Import the repository in Vercel. Framework preset: Next.js.
2. Add every required environment variable above, for Production **and**
   Preview. Preview must point at a **separate** Neon branch, never production.
3. Deploy. `npm run build` runs automatically.
4. Run migrations against production **once**, from a machine with the
   production `DATABASE_URL`:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
5. Set the gateway's webhook URL to
   `https://<domain>/api/webhooks/uddoktapay`.
6. Confirm the cron in `vercel.json` registered under Project → Settings →
   Cron Jobs. Vercel sends `CRON_SECRET` as a Bearer token automatically.
7. Log in at `/admin/login` with the bootstrap credentials and change the
   password immediately.

### Rollback

Vercel keeps every previous deployment. Promote the last good one from the
dashboard, or:

```bash
vercel rollback <deployment-url>
```

Code rollback is instant and safe. **Database rollback is not**: if the bad
deploy ran a migration, promoting old code against the new schema may fail.
This is why migrations are written to be backward compatible — add columns,
do not rename or drop them in the same release that stops using them.

### Backup and recovery

Neon provides continuous point-in-time restore on paid plans; confirm the
retention window on your plan, because the free tier's is short.

A backup you have never restored is not a backup. Before launch, and quarterly
after:

1. Create a Neon branch from a timestamp ~1 hour ago.
2. Point a local `.env.local` at that branch.
3. Run the app and confirm orders, download grants and admin login all work.
4. Delete the branch.

The product file itself (`EBOOK_FILE_URL`) is not in this database or this
repository. Back it up separately; the canonical copy is
`../ai-agent-ebook-bn/dist/bundle-master/ebook.pdf`.

---

## Security

- Passwords: scrypt, N=32768. Admin lockout after 8 failures for 15 minutes.
- Sessions: signed cookie, `httpOnly` + `sameSite=lax`; only a SHA-256 of the
  token is stored, so a database dump yields nothing usable.
- Login responds identically to "no such user" and "wrong password", and burns
  comparable time on both, to prevent account enumeration.
- Rate limits are database-backed, because an in-memory limiter multiplies the
  real limit by the number of warm serverless instances. It **fails open**: a
  limiter that takes checkout down during a database hiccup causes more damage
  than the abuse it prevents.
- Download links are signed, expiring, revocable, and carry a `kind` claim so a
  receipt token cannot be replayed as a download token. Bytes are streamed
  through the app, so the private file URL is never exposed.
- CSP is set in `src/middleware.ts`. **It includes `script-src 'unsafe-inline'`**
  — see the comment in that file for the reasoning and the condition under
  which it can be tightened.

---

## Production checklist

Blocking. The admin dashboard shows these as launch blockers automatically.

- [ ] **Write the refund policy.** `sales/landing-copy.md` line 179 is still
      `[আপনার নীতি এখানে লিখুন]`. The refund FAQ entry is deliberately absent
      from the site until this exists. "No refunds" is fine for a digital
      product, but it has to be stated. Fill in `POLICIES` in
      `src/config/site.ts`.
- [ ] Write privacy policy, terms, and contact pages (same file).
- [ ] Upload the PDF bundle to private storage and set `EBOOK_FILE_URL`.
- [ ] Set the live `UDDOKTAPAY_API_KEY` and `UDDOKTAPAY_BASE_URL`.
- [ ] Set `CRON_SECRET`, and confirm `/api/cron/dispatch-tracking` returns 401
      without it and 200 with it.
- [ ] Set `RESEND_API_KEY` and verify the sending domain (SPF/DKIM).
- [ ] Set `ADMIN_ALERT_EMAIL`.
- [ ] Place one real end-to-end order and confirm: money arrives, the email
      lands, the download works, and the order shows `fulfilled` in the admin.
- [ ] Confirm `/admin` is unreachable when signed out.
- [ ] Test a restore from a Neon branch.

Recommended before spending on ads:

- [ ] Set the Meta Pixel and CAPI token, then confirm in Events Manager that a
      test purchase is **deduplicated** (one event, not two).
- [ ] Run PageSpeed Insights against the deployed URL on mobile.
- [ ] Decide the VAT position with your accountant and set `tax_rate` in
      settings if it is not zero.

---

## Scheduled jobs

`vercel.json` registers one cron: `/api/cron/dispatch-tracking`, daily at
03:00 UTC (09:00 Dhaka). It drains the `tracking_events` queue to the Meta
Conversions API.

**Why daily.** Vercel's Hobby plan refuses to deploy any cron that runs more
than once per day, so a `*/10` schedule would fail the deployment outright.
Daily is safe for attribution because each event is sent with the purchase
time, not the send time, and Meta deduplicates against the browser pixel for
48 hours after the first event. On a Pro plan, change the schedule to
`*/10 * * * *` for near-real-time reporting; nothing else needs to change.

`vercel.json` also pins serverless functions to `sin1` (Singapore) to sit next
to the Neon database, which should be created in `ap-southeast-1`. If the
database ends up elsewhere, move this to match; a cross-region round trip on
every checkout query is the single easiest way to add 200 ms to TTFB.

It is a no-op returning `skipped: "not_configured"` until both
`NEXT_PUBLIC_META_PIXEL_ID` and `META_CAPI_ACCESS_TOKEN` are set. Rows keep
accumulating in the meantime and are sent once credentials exist, so no
conversions are lost by launching without them.

Events retry up to 5 times, then become `abandoned` rather than being deleted.
An abandoned row is the evidence that ad reporting is under-counting, and the
dashboard surfaces the count.

---

## Known limitations

- **Repository is public.** It lives at
  `github.com/MuraduzzamanRifat/proworkspace.pw` and anyone can read it. That
  is safe only because no secret is committed: `.gitignore` excludes every
  `.env*` variant except the template, and the initial commit was content-
  scanned for secret-shaped strings before push. Keep it that way, or make the
  repository private in Settings → General → Danger Zone.
- **Refunds are recorded, not initiated.** `recordRefund` applies the
  consequences of a refund — status, refunded total, revocation of download
  access on a full refund — but moves no money. The refund itself is issued in
  the UddoktaPay panel. The integration this project reuses has no verified
  refund API, and a button that claimed to refund without calling one would be
  a button that lies. The admin UI says "record" for that reason.
- **Admin covers dashboard, orders, order detail and auth.** Content
  management, product/offer editing, coupons and settings have full database
  schemas and no UI yet. Prices are changed with SQL or by re-seeding until
  that exists.
- **No end-to-end test.** The 119 unit tests need no database and no network,
  which is why they run in CI without secrets. Nothing exercises a real
  browser through a real payment; that gap closes with the first live test
  order.
- **`ilike` order search is a sequential scan.** Fine at this scale; add a
  trigram index if the table reaches millions of rows.
- **CSP allows `script-src 'unsafe-inline'`.** Reasoning and the condition for
  tightening it are in `src/middleware.ts`.
- **ESLint's `eslint-visitor-keys` wants Node ^20.19**; the local toolchain is
  20.18.1. Lint may warn. Build, typecheck and tests are unaffected, and CI
  pins 20.19.
