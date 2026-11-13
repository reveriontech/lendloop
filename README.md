# LendLoop

A neighborhood tool-lending board where neighbors list tools they're willing to lend, request to borrow from each other, and receive automated notifications and reminders via n8n.

## Stack

- **Next.js 16** (App Router) — frontend + API routes
- **Clerk** — authentication
- **Convex** — database, backend logic, real-time subscriptions
- **n8n** — workflow automation (self-hosted via Docker)
- **TypeScript** — end to end

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (Next.js)                     │
│  Landing Page │ Dashboard │ My Tools │ Requests │ Admin  │
└──────────┬──────────────────────────────┬───────────────┘
           │ Convex React client          │ REST (webhook)
           ▼                              ▼
┌──────────────────┐         ┌──────────────────────────┐
│  Convex Backend   │         │   Next.js API Routes     │
│  - Schema/RBAC    │         │  /api/n8n/webhook (out)  │
│  - Mutations      │         │  /api/n8n/callback (in)  │
│  - HTTP endpoints │◄────────│  HMAC sign/verify        │
└──────────────────┘         └────────────┬─────────────┘
                                          │ HMAC-signed
                                          ▼
                             ┌──────────────────────────┐
                             │      n8n (Docker)         │
                             │  - Request notification   │
                             │  - Overdue reminders      │
                             │  - Error workflow          │
                             └──────────────────────────┘
```

**Data flow:**
1. User actions in the browser call Convex mutations (RBAC-enforced).
2. After a borrow request event, the client fires a best-effort webhook to `/api/n8n/webhook`.
3. That route HMAC-signs the payload and forwards it to n8n.
4. n8n verifies the signature, processes the event, and sends notifications.
5. For write-backs (e.g., overdue reminder logs), n8n signs its own request and POSTs to `/api/n8n/callback`, which verifies the signature and writes to Convex via the HTTP endpoint.
6. All write-backs use idempotency keys to prevent duplicate records on retry.

## Local Setup

### Prerequisites

- Node.js 20+
- Docker (for n8n)
- A [Clerk](https://clerk.com) account (free tier works)
- A [Convex](https://convex.dev) account (free tier works)

### 1. Clone and install

```bash
git clone <repo-url> && cd lendloop
npm install
```

### 2. Set up Clerk

1. Create a Clerk application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy the **Publishable Key** and **Secret Key** from API Keys.
3. Note your **Frontend API URL** (e.g., `https://your-app.clerk.accounts.dev`).

### 3. Set up Convex

```bash
npx convex dev
```

This will prompt you to log in and create a project. It gives you a deployment URL.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the values:

| Variable | Source |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard → API Keys |
| `CLERK_SECRET_KEY` | Clerk dashboard → API Keys |
| `NEXT_PUBLIC_CONVEX_URL` | Output of `npx convex dev` |
| `CLERK_JWT_ISSUER_DOMAIN` | Clerk Frontend API URL |
| `N8N_WEBHOOK_URL` | n8n webhook URL (see step 5) |
| `N8N_HMAC_SECRET` | `openssl rand -hex 32` |

### 5. Start n8n

```bash
docker compose up -d
```

Open [localhost:5678](http://localhost:5678) (user: `admin`, password: `changeme`).

Import workflows from `n8n-workflows/`:
1. **borrow-request-notification.json** — handles borrow request events
2. **overdue-reminder.json** — daily overdue loan reminders
3. **error-workflow.json** — catches and logs failed workflow runs

In n8n settings, set these environment variables:
- `N8N_HMAC_SECRET` — same value as in `.env.local`
- `CONVEX_SITE_URL` — your Convex site URL (deployment URL with `.cloud` → `.site`)
- `LENDLOOP_CALLBACK_URL` — `http://host.docker.internal:4391`

### 6. Run the app

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Next.js frontend
npm run dev
```

Open [localhost:4391](http://localhost:4391).

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

RBAC is enforced in Convex functions (server-side), not just in the UI. Every mutation validates the caller's identity and role before acting.

## Security Decisions

### Webhook HMAC Signing

- All webhook payloads between the app and n8n are signed using HMAC-SHA256 with a shared secret.
- The signature covers `{timestamp}.{body}` to bind the timestamp to the payload.
- Verification uses `crypto.timingSafeEqual` to prevent timing attacks.
- **Replay protection:** requests older than 5 minutes are rejected based on the timestamp in the header.

### Idempotency

- Write-backs from n8n use idempotency keys (format: `{type}-{requestId}-{date}`).
- Convex checks for an existing record with the same key before inserting.
- This means n8n retries (configured with 3 retries and exponential backoff) will not create duplicates.

### Secret Management

- All secrets are stored in environment variables (`.env.local`) and n8n credentials.
- `.env.local` is gitignored; only `.env.example` is committed.
- No secrets appear in code or exported workflow JSON.

### Data Minimization

- The public tool listing only exposes tool name and category — no owner details.
- Webhook payloads contain only the event type and record IDs, not full user data.
- n8n workflows receive only the fields they need.

## n8n Workflows

### 1. Borrow Request Notification (`borrow-request-notification.json`)

Triggered by: webhook from the app on any borrow request event (created, approved, declined, borrowed, returned).

Flow: Webhook → HMAC Verify → Route by Event → Format Message → Send Notification (mock logger).

### 2. Overdue Reminders (`overdue-reminder.json`)

Triggered by: daily schedule at 9 AM.

Flow: Schedule → Fetch Overdue Loans (from Convex HTTP endpoint) → Parse → Send Reminder → HMAC-Sign → Write Back (idempotent log to Convex).

### 3. Error Workflow (`error-workflow.json`)

Triggered by: any workflow failure.

Flow: Error Trigger → Log Error Details (workflow name, node, error message, execution ID).

## Testing

```bash
npm test           # run all tests
npm run test:watch # watch mode
npm run typecheck  # TypeScript check
npm run build      # production build
```

Test coverage:
- **RBAC rules** (26 tests): tool management, borrow request actions, admin-only actions, self-borrow prevention
- **HMAC signing/verification** (8 tests): valid signatures, tampered payloads, wrong secrets, replay protection, timestamp validation
- **Idempotency** (8 tests): key generation, duplicate prevention, retry handling

## Production Readiness

What I would add before running this in production:

### Observability
- Structured logging (e.g., Pino) with correlation IDs across webhook requests.
- Error tracking with Sentry or Datadog for both the Next.js app and n8n.
- Request/response metrics on webhook endpoints (latency, error rates).

### Rate Limiting
- Rate limiting on API routes (webhook endpoints) to prevent abuse.
- Per-user rate limiting on tool listing and borrow request creation.

### Audit Logging
- An audit log table in Convex recording who did what and when (tool creates, status changes, admin actions).
- Immutable audit trail for compliance.

### Security Hardening
- CSRF protection on mutation endpoints.
- Input validation and sanitization (max lengths, allowed characters).
- Content Security Policy headers.
- Webhook replay protection with a nonce store (to prevent replayed requests within the 5-minute window).

### Data & Privacy
- Data retention policies — auto-archive old borrow records.
- User data export/deletion capabilities (GDPR compliance).
- Encrypt PII at rest in the database.
- Regular backup schedule with tested restores.

### Infrastructure
- n8n in a managed environment with health checks, not just Docker Compose.
- Webhook delivery queue with dead-letter queue for persistent failures.
- Database migrations strategy for schema evolution.
- CI/CD pipeline with automated testing on every PR.

### UX Improvements
- Email verification for notification delivery.
- Push notifications for mobile users.
- Tool images and location-based search.
- Borrowing history and reputation/rating system.
