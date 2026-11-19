# LendLoop

A neighborhood tool-lending board where neighbors list tools they're willing to lend, request to borrow from each other, and receive automated notifications and reminders via n8n.

## Stack

- **Next.js 16** (App Router): frontend, deployed to Cloudflare Workers with OpenNext
- **Clerk**: authentication
- **Convex**: database, backend logic, real-time subscriptions, and the automation outbox
- **n8n**: workflow automation (self-hosted, or the bundled Docker Compose file)
- **TypeScript**: end to end

## Architecture

```
┌──────────────────────┐   queries / mutations   ┌───────────────────────────────┐
│ Browser              │ ──────────────────────▶ │ Convex                        │
│ Next.js + Clerk      │ ◀────────────────────── │  RBAC in every function       │
└──────────────────────┘    live query results   │  automationEvents (outbox)    │
                                                 │  HTTP endpoints (HMAC-checked)│
                                                 └──────┬────────────────▲───────┘
                     signed POST, CONVEX_TO_N8N_SECRET  │                │  signed GET / POST,
                     one event per status change        │                │  N8N_TO_CONVEX_SECRET
                                                        ▼                │
                                                 ┌───────────────────────┴───────┐
                                                 │ n8n                           │
                                                 │  1. Request notification      │
                                                 │  2. Overdue reminders (daily) │
                                                 │  3. Error handler             │
                                                 └───────────────────────────────┘
```

The browser never talks to n8n, and n8n never talks to the Next.js app. Every automation message goes between Convex and n8n, and is signed.

**Data flow:**

1. The browser calls Convex mutations. Each one checks the caller's identity and role before acting.
2. A mutation that changes a borrow request also inserts an `automationEvents` row and schedules `automation.deliver`, in the same transaction. The change and its event commit together or not at all.
3. `deliver` builds a minimal payload, signs it and POSTs it to the n8n webhook. If n8n doesn't answer with a 2xx, Convex retries after 30 s, 2 min, 8 min and 30 min. After the fifth failure the event is marked `failed` and listed under **Admin → Automation**, with a Retry button.
4. The **Request notification** workflow verifies the signature, answers `202`, drops events it has already handled, emails the one person concerned through [Resend](https://resend.com) and logs the result back to Convex.
5. Every day at 9:00, the **Overdue reminders** workflow fetches overdue loans from Convex, emails each borrower and reports each reminder as `sent` or `failed`.
6. If either workflow fails after its retries, the **Error handler** workflow reports it to Convex, where it shows under Admin → Automation.
7. Each loan card shows its latest automation activity, for example "Borrower notified of the approval · 2 minutes ago".

## Local Setup

### Prerequisites

- Node.js 22.12 or newer (required by Vitest 5)
- A [Clerk](https://clerk.com) account (free tier works)
- A [Convex](https://convex.dev) account (free tier works)
- Optional: n8n, either your own self-hosted instance or Docker to run the bundled one, plus a [Resend](https://resend.com) account (free tier works) for the emails. The app runs without them. Events are then marked "skipped" on the Admin page.

### 1. Install dependencies

```bash
git clone <repo-url> && cd lendloop
npm install
```

### 2. Create a Clerk application

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. From **API Keys**, copy the **Publishable Key**, the **Secret Key** and the **Frontend API URL**. The URL looks like `https://your-app.clerk.accounts.dev`.
3. Activate Clerk's **Convex integration**. On older dashboards, use **JWT Templates → New → Convex** instead, and keep the template name `convex`. `convex/auth.config.ts` only accepts tokens issued for `applicationID: "convex"`. Without this step, users can sign in to Clerk but Convex rejects them.

### 3. Create the env file

Do this before step 4, because `npx convex dev` writes its values into this file.

```bash
cp .env.example .env.local
```

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Clerk → API Keys |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL |
| `NEXT_PUBLIC_CONVEX_URL` | Filled in by `npx convex dev` in step 4 |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Filled in by `npx convex dev` in step 4 |

The Next.js app holds no automation secrets. Those live on the Convex deployment and the n8n server (step 6).

All `.env*` files are gitignored except `.env.example`. Never commit `.env.local`.

### 4. Set up Convex

```bash
npx convex dev
```

On first run, this logs you in, creates a project and writes `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL` into `.env.local`.

It then stops with `Environment variable CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set`. Convex functions run on Convex's servers and don't read `.env.local`, so you must also set the value on the deployment:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
```

If `npx convex dev` doesn't pick up the change on its own, stop it with Ctrl+C and start it again. Leave it running.

### 5. Run the app

Keep `npx convex dev` running. In a second terminal, run:

```bash
npm run dev
```

Open [localhost:4391](http://localhost:4391).

`npm start` runs the production server, which only works after `npm run build`.

### 6. Connect n8n (optional)

The two directions need different network access:

| Direction | Used for | Requirement |
|---|---|---|
| Convex → n8n webhook | Request notifications | Convex runs in the cloud, so the n8n webhook must be reachable from the internet |
| n8n → Convex (`.convex.site`) | Overdue reminders, activity logs, failure reports | n8n can reach the internet |

#### 6a. Create the two secrets

Each direction has its own secret, so a leaked secret can forge requests in one direction only. Generate two values. This command works on every OS, unlike `openssl`, which usually isn't installed on Windows:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set both on the Convex deployment:

```bash
npx convex env set CONVEX_TO_N8N_SECRET <first value>
npx convex env set N8N_TO_CONVEX_SECRET <second value>
```

#### 6b. Set environment variables on the n8n server

The workflows read these with `$env`, which only sees the n8n process's environment. The **Variables** page in the n8n UI won't work, because its values are read with `$vars`, not `$env`.

| Variable | Value |
|---|---|
| `CONVEX_SITE_URL` | `NEXT_PUBLIC_CONVEX_SITE_URL` from `.env.local` (ends in `.convex.site`) |
| `CONVEX_TO_N8N_SECRET` | The same first value as on Convex |
| `N8N_TO_CONVEX_SECRET` | The same second value as on Convex |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false`, because recent n8n versions block `$env` by default |
| `NODE_FUNCTION_ALLOW_BUILTIN` | `crypto`, because the Code nodes call `require('crypto')` |
| `EXECUTIONS_DATA_PRUNE` | `true` (recommended): deletes old execution data, which contains recipient emails |
| `EXECUTIONS_DATA_MAX_AGE` | `168` (recommended): keeps execution data for 7 days |
| `LENDLOOP_EMAIL_FROM` | Optional sender on a domain you've verified in Resend, for example `notifications@yourdomain.com`. The default is `LendLoop <onboarding@resend.dev>` (see 6c). To add a display name, quote the value: `"LendLoop <notifications@yourdomain.com>"`. Unquoted, the `<` and `>` break env files loaded with `source`. |

Restart n8n after changing them.

**To use the bundled Docker n8n instead:** add `CONVEX_TO_N8N_SECRET` and `N8N_TO_CONVEX_SECRET` to `.env.local`, then start it with:

```bash
docker compose --env-file .env.local up -d
```

[docker-compose.yml](docker-compose.yml) passes the values above to n8n. Don't leave out `--env-file .env.local`: Docker Compose only reads `.env` by default. Open [localhost:5678](http://localhost:5678) and create the owner account.

#### 6c. Set up Resend

1. In Resend, open **API Keys** and create a key with **Sending access**.
2. In n8n, open **Credentials → Add credential → Header Auth**. Set **Name** to `Authorization` and **Value** to `Bearer re_…` (your key), and save it as *Resend API*. The key stays in n8n's encrypted credential store, never in the workflow files.
3. Choose a sender:
   - **To try it out:** keep the default sender, `onboarding@resend.dev`. Resend then only delivers to your own Resend account's email address, and refuses others with a 403. Sign up in LendLoop with that address on the account that should receive the emails.
   - **To email anyone:** in Resend, open **Domains** and verify a domain you own. Then set `LENDLOOP_EMAIL_FROM` on the n8n server (6b) to an address on that domain.

#### 6d. Import the workflows

In n8n, import each file from `n8n-workflows/`, error handler first:

1. **error-workflow.json** (*LendLoop - Error handler*): reports failed runs of the other two to Convex
2. **borrow-request-notification.json** (*LendLoop - Request notification*): emails the person concerned about each borrow request event
3. **overdue-reminder.json** (*LendLoop - Overdue reminders*): emails daily overdue loan reminders

Then, for the request notification and overdue reminder workflows:

- Open the Resend node (*Send email (Resend)* or *Send reminder email (Resend)*) and select the *Resend API* credential. Exported files never carry credentials.
- Open **Settings → Error workflow** and choose *LendLoop - Error handler*. Exported files can't carry this link, because n8n gives each imported workflow a new ID.
- Activate (publish) the workflow. The webhook's production URL only responds while its workflow is active.

**Replacing workflows you imported earlier:** deactivate and delete the old *LendLoop - Request notification* first. n8n won't activate two workflows that listen on the same webhook path.

#### 6e. Point Convex at the webhook

Open the *Convex event webhook* node and copy its **Production URL**. Set it on Convex:

```bash
npx convex env set N8N_WEBHOOK_URL https://<your-n8n-host>/webhook/lendloop-borrow-webhook
```

Use the production URL (`/webhook/`), not the test URL (`/webhook-test/`). If n8n runs on your own machine, expose it with a tunnel such as `cloudflared tunnel --url http://localhost:5678` or `ngrok http 5678`, and use the tunnel's address.

#### 6f. Check it works

- **Request notification:** request to borrow a tool from a second account. Within seconds, the lender gets an email titled "New request to borrow your …", and the request on **Incoming requests** shows "Lender notified of the new request".
- **Overdue reminders:** open the workflow and run it manually. It emails every borrower whose loan is past due and still marked borrowed. Run it again: Convex returns nothing, because those borrowers have already been reminded today.
- **Failures:** **Admin → Automation** lists events Convex couldn't deliver and n8n runs that failed.

## Deploy to Cloudflare

The Next.js app runs on Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`, configured in [wrangler.jsonc](wrangler.jsonc) and [open-next.config.ts](open-next.config.ts)). Convex and n8n stay where they are. The deployed app talks to Convex, and n8n only talks to Convex, so neither needs any change.

Next.js bakes these three values into the build, so they must be set wherever the build runs:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | The `.convex.cloud` URL of the deployment the live app should use |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | The matching `.convex.site` URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys |

The Worker needs no runtime secrets, because Clerk only runs in the browser in this app.

### From your machine

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` builds the app with the values from `.env.local` and uploads it. It prints the address, `https://lendloop.<your-subdomain>.workers.dev`. To try the Worker locally first, run `npm run preview`.

On Windows, run these in WSL. OpenNext warns that Windows isn't fully supported, although the build works there.

### From GitHub, with Cloudflare building each push

1. In the Cloudflare dashboard, open **Workers & Pages → Create → Import a repository** and choose this repository.
2. Keep the project name `lendloop`, matching `name` in `wrangler.jsonc`.
3. Set **Build command** to `npx opennextjs-cloudflare build` and **Deploy command** to `npx opennextjs-cloudflare deploy`.
4. Under **Settings → Build → Variables and secrets**, add the three `NEXT_PUBLIC_*` variables above.

### After the first deploy

- **Custom domain:** in the Worker's **Settings → Domains & Routes**, add a domain on a Cloudflare zone you own.
- **Clerk:** development keys work on any address but show a "Development mode" badge. For a public launch, create a Clerk production instance on your domain, and use its publishable key. Then set `CLERK_JWT_ISSUER_DOMAIN` on Convex to its Frontend API URL.
- **Convex:** the live app uses whichever deployment `NEXT_PUBLIC_CONVEX_URL` points to. For a separate production backend, run `npx convex deploy`, set the same env vars with `npx convex env set --prod …`, build with the production URLs, and change `CONVEX_SITE_URL` on the n8n server to the production `.convex.site` URL.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm test` fails in every file with `Cannot read properties of undefined (reading 'config')` | This happens on Windows only. Your terminal's working directory starts with a lowercase drive letter (`c:\...`), which VS Code terminals often use, and Vitest ends up loading itself twice. Run `cd C:\path\to\lendloop` with an uppercase drive letter, then run the tests again. |
| `npm start` fails with `Could not find a production build in the '.next' directory` | Use `npm run dev` for development, or run `npm run build` first. |
| `npx convex dev` stops with `CLERK_JWT_ISSUER_DOMAIN is used in auth config file but its value was not set` | Run `npx convex env set CLERK_JWT_ISSUER_DOMAIN <Clerk Frontend API URL>` (step 4). |
| You're signed in with Clerk, but Convex treats you as unauthenticated | Activate Clerk's Convex integration or `convex` JWT template (step 2). Then check that the issuer set on Convex matches your Frontend API URL. |
| Admin → Automation shows events as skipped because `N8N_WEBHOOK_URL or CONVEX_TO_N8N_SECRET is not set` | Set both on Convex (steps 6a and 6e), then click Retry. |
| A Resend node fails with `403` and "You can only send testing emails to your own email address" | You're using the default `onboarding@resend.dev` sender. Email only your Resend account's address, or verify a domain and set `LENDLOOP_EMAIL_FROM` (6c). |
| A Resend node fails with `401` | The *Resend API* credential is wrong. **Name** must be `Authorization` and **Value** must be `Bearer ` followed by the key. |
| A Resend node says it has no credential | Open the node and select *Resend API* (6d). |
| Admin → Automation shows `n8n responded with HTTP 404` | The request notification workflow isn't active, or `N8N_WEBHOOK_URL` is the test URL (`/webhook-test/`). |
| The request notification workflow takes the *Reject (401)* branch | `CONVEX_TO_N8N_SECRET` differs between Convex and n8n, or the n8n server's clock is more than 5 minutes off. |
| An n8n HTTP Request node gets `401 Unauthorized` from Convex | `N8N_TO_CONVEX_SECRET` differs between n8n and Convex. The Convex logs say why each request was rejected. |
| An n8n Code node says access to env vars is denied | Set `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` on the n8n server and restart it. |
| An n8n Code node can't load the `crypto` module | Set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` on the n8n server and restart it. |

## Roles & Access Control

| Action | `member` | `admin` |
|---|:---:|:---:|
| List own tools | ✓ | ✓ |
| Edit/delete own tools | ✓ | ✓ |
| Browse tools | ✓ | ✓ |
| Request to borrow | ✓ | ✓ |
| Approve/decline requests on own tools | ✓ | ✓ |
| Mark borrowed/returned on own tools | ✓ | ✓ |
| Remove any listing | | ✓ |
| View all loans | | ✓ |
| Mark any user as "Trusted Lender" | | ✓ |
| View automation failures and retry events | | ✓ |

RBAC is enforced in Convex functions (server-side), not just in the UI. Every mutation validates the caller's identity and role before acting.

## Security Decisions

### Signed in both directions

- Every message between Convex and n8n carries `X-LendLoop-Timestamp` and `X-LendLoop-Signature`, an HMAC-SHA256 of `{timestamp}.{body}`. Binding the timestamp to the body stops it being moved onto another request.
- Each direction has its own secret: `CONVEX_TO_N8N_SECRET` for events sent to n8n, and `N8N_TO_CONVEX_SECRET` for everything n8n sends to Convex. A leaked secret can forge requests in one direction only.
- Both sides reject requests more than 5 minutes old or ahead, which limits replays.
- Both sides compare signatures in constant time: `crypto.timingSafeEqual` in n8n, and `crypto.subtle.verify` in Convex ([convex/signing.ts](convex/signing.ts)).
- Both sides fail closed. A missing secret means a 401 from Convex, or a failed n8n run that the error handler reports.
- Convex checks the signature before reading or writing any data. It then validates every field's type, allowed values and length. Failure reports only keep `http(s)` links.
- Events start in Convex mutations, never in the browser, so a user can't forge, trigger or suppress a notification.

### Reliability and error handling

- **No lost events:** the outbox row and the status change are written in one transaction, and delivery is scheduled in that same transaction.
- **Retries at every hop:** Convex retries delivery 5 times over about 40 minutes. Every n8n HTTP Request node retries 3 times, including the Resend calls.
- **Fast acknowledgement:** n8n answers `202` right after checking the signature. A slow email provider then can't make Convex retry.
- **No duplicate emails:** if Convex does retry after a lost response, n8n's *Skip already-handled events* node drops the repeat by `eventId`. Every Resend call also sends an `Idempotency-Key`, so Resend itself drops a repeat of the same email, for example when a failed n8n run is retried.
- **One bad address doesn't block the rest:** the overdue workflow continues after a failed email, records that reminder as `failed`, and sends the others. Emails go out one at a time, to stay under Resend's rate limit.
- **Nothing fails silently:** undelivered events and failed n8n runs both appear under Admin → Automation. An admin can retry undelivered events from there.

### Idempotency

| Write-back | Key | Effect of a retry or re-run |
|---|---|---|
| Notification sent | `notify:<eventId>` | Updates the same log entry |
| Overdue reminder | `overdue:<loanId>:<YYYY-MM-DD>` (UTC) | Updates the same entry. A later `sent` replaces `failed`, never the other way round. |
| Workflow failure | `n8n-error:<workflowId>:<executionId>` | Stored once per failed execution |
| Email sent through Resend | `Idempotency-Key: notify-<eventId>` or `overdue:<loanId>:<YYYY-MM-DD>` | Resend sends it once and drops repeats of the same key |

The overdue endpoint also leaves out loans with a `sent` reminder for today. Re-running the workflow therefore never reminds the same borrower twice in a day.

### Secret Management

- The signing secrets live in Convex deployment environment variables (`npx convex env set`) and the n8n server's environment. The Resend API key lives in an n8n credential. The Next.js app holds none of them.
- No secrets appear in code or in the exported workflow JSON. A test checks the exports for keys and embedded credentials, and checks that they only read the documented environment variables.
- All `.env*` files are gitignored except `.env.example`, which holds placeholders only.

### Data Minimization

- The public tool listing only exposes tool name and category, with no owner details.
- A notification payload carries the event type, record IDs, the tool name, the loan dates, and the **recipient's** first name and email. A declined request also carries the decline reason. The other person's details never leave Convex.
- The overdue endpoint returns each borrower's first name and email, the tool name and the due date. It returns nothing about the lender.
- Outbox rows store only IDs and delivery state. The payload is built at send time, so personal data isn't copied into another table.
- Activity log messages contain no personal data, for example "Borrower notified of the approval".
- Resend receives only the recipient's address, the subject and the text.
- The recommended n8n settings delete execution data, which includes recipient emails, after 7 days.

## n8n Workflows

All three are in [n8n-workflows/](n8n-workflows/) and import directly. Each one has a note on the canvas listing what it needs.

### 1. Request notification (`borrow-request-notification.json`)

**Trigger:** a signed POST from Convex whenever a borrow request is created, cancelled, approved, declined, marked borrowed or marked returned.

**Flow:** Webhook → Verify signature → Signature valid? (no: respond 401) → Accept (202) → Skip already-handled events → Compose message → Send email (Resend) → Sign activity log → Log activity in LendLoop.

### 2. Overdue reminders (`overdue-reminder.json`)

**Trigger:** daily at 9:00, in the n8n server's time zone.

**Flow:** Schedule → Sign request → Fetch overdue loans (signed GET to `/api/overdue-loans`) → One item per loan → Compose reminder → Send reminder email (Resend; on error, continue) → Sign status update → Record reminder in LendLoop (`/api/automation-log`).

### 3. Error handler (`error-workflow.json`)

**Trigger:** any failed run of a workflow that names it as its error workflow.

**Flow:** Error Trigger → Build failure report (workflow, node, error, execution link; logs it too) → Report failure to LendLoop (`/api/automation-failure`).

Both email nodes are HTTP Request nodes that call [Resend's email API](https://resend.com/docs/api-reference/emails/send-email) with the *Resend API* credential.

## Testing

```bash
npm test           # run all tests
npm run test:watch # watch mode
npm run typecheck  # TypeScript check
npm run build      # production build
```

Test coverage (84 tests):

- **n8n workflows** (25): each export's structure, and its Code nodes run against the real Convex signing code and HTTP routes, in both directions. This covers events exactly as `deliver` sends them, tampered and stale events, every message template, the Resend request body and idempotency keys, write-backs Convex accepts, and failure reports.
- **RBAC rules** (20): tool management, borrow request actions, admin-only actions, self-borrow prevention.
- **Outbox and delivery** (11): who each event notifies, payload minimization, the retry schedule, and skipped and failed deliveries.
- **Request signing** (9): valid signatures, Node and Web Crypto agreement, tampered bodies, wrong secrets, the 5-minute window, missing secrets.
- **Idempotency** (8): the real write-back and overdue query handlers against an in-memory database: retries, re-runs, the failed-to-sent upgrade, one reminder per day.
- **Convex HTTP endpoints** (6): signature checks before any data access, input validation, failure reports.
- **Listing photos** (5).

## Production Readiness

What I would add before running this in production:

### Observability
- Structured logging (e.g., Pino) with correlation IDs. The Convex event ID already links an event to its n8n run.
- Error tracking with Sentry or Datadog for both the Next.js app and n8n.
- Request/response metrics on the Convex HTTP endpoints (latency, error rates).
- Alerts by email or Slack when an event fails or a workflow run fails, instead of relying on someone opening the Admin page.

### Rate Limiting
- Rate limiting on the Convex HTTP endpoints to prevent abuse.
- Per-user rate limiting on tool listing and borrow request creation.

### Audit Logging
- An audit log table in Convex recording who did what and when (tool creates, status changes, admin actions).
- Immutable audit trail for compliance.

### Security Hardening
- Secret rotation without downtime: accept the previous secret for a grace period.
- Replay protection with a nonce store, to stop replays within the 5-minute window.
- Input validation and sanitization on every mutation (max lengths, allowed characters).
- Content Security Policy headers.

### Reliability
- Bounce and complaint handling: subscribe to Resend's webhooks and stop emailing addresses that bounce.
- Per-recipient notification preferences, and an unsubscribe link in every email.
- A verified sending domain with SPF, DKIM and DMARC, and a data processing agreement with Resend.
- Pin the n8n Docker image to a tested version instead of `latest`.

### Data & Privacy
- Data retention policies: auto-archive old borrow records and prune old automation logs.
- User data export/deletion capabilities (GDPR compliance).
- Encrypt PII at rest in the database.
- Regular backup schedule with tested restores.

### Infrastructure
- n8n in a managed environment with health checks, not just Docker Compose.
- Database migrations strategy for schema evolution.
- CI/CD pipeline with automated testing on every PR.

### UX Improvements
- Email verification for notification delivery.
- Push notifications for mobile users.
- Location-based search.
- Borrowing history and reputation/rating system.
