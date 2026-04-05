# HIPAAA Custom Backend

Healthcare workflow integration backend that sits between **JotForm** and **VanillaSoft**, with **SharePoint** document storage.

## What it does

- Receives JotForm webhook submissions for **Referral**, **Intake**, and **Enrollment** forms
- Normalizes and deduplicates using **CIN (Medicaid ID)** as the primary key
- Maintains a single member lifecycle: Referral → Intake → Enrollment
- Forwards payloads to existing **VanillaSoft Incoming Web Lead** endpoints (preserving 400+ field mappings)
- Uploads documents to **SharePoint** via Microsoft Graph API
- Provides audit logging and a review queue for conflicts/edge cases

## Architecture

```
JotForm → Netlify Functions → Processing Pipeline → PostgreSQL
                                   ↓                    ↓
                             VanillaSoft          SharePoint
```

## Tech Stack

| Component       | Technology                     |
|-----------------|--------------------------------|
| Runtime         | Node.js 20+, TypeScript        |
| Serverless      | Netlify Functions              |
| Database        | PostgreSQL (Neon / Supabase)   |
| ORM             | Prisma                         |
| Validation      | Zod                            |
| Logging         | Pino                           |
| File Storage    | SharePoint (Microsoft Graph)   |
| Package Manager | pnpm                           |
| Testing         | Vitest                         |

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

This runs `prisma generate` via `postinstall` so TypeScript and tests see a generated client after a fresh clone.

### 2. Start local database

```bash
docker compose up -d
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your database URL and API keys
```

For local development with Docker:
```
DATABASE_URL=postgresql://hipaaa:hipaaa_local@localhost:5432/hipaaa?schema=public
```

### 4. Run migrations

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Start dev server

```bash
pnpm dev
```

Open [http://localhost:8888](http://localhost:8888) — you should see a small API index page (not a 404). Functions live under `/.netlify/functions/…`.

## API Endpoints

### Webhook Endpoints (JotForm → Backend)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/.netlify/functions/jotform-referral` | Process referral submission |
| `POST` | `/.netlify/functions/jotform-intake` | Process intake submission |
| `POST` | `/.netlify/functions/jotform-enrollment` | Process enrollment submission |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.netlify/functions/health` | Health check |
| `GET` | `/.netlify/functions/admin-review` | List review queue items (`?status=PENDING` etc., `limit` max 200, `offset`; invalid `status` returns 400) |
| `POST` | `/.netlify/functions/admin-replay` | Approve/reject/replay a review item |

Admin endpoints require `X-Api-Key` header matching `ADMIN_API_KEY`.

## Processing Flow

### Referral
1. No CIN → **review queue**
2. New CIN → create member → forward to VanillaSoft
3. Existing CIN, data matches → **review queue** (duplicate referral)
4. Existing CIN, data mismatch → **review queue** (conflict)

### Intake
1. No CIN → **review queue**
2. No existing member → **review queue**
3. Existing member, data matches → forward to VanillaSoft → on success, advance stage to INTAKE (on VS failure → **review queue**)
4. Data mismatch → **review queue** (conflict)

### Enrollment
1. No CIN → **review queue**
2. No existing member → **review queue**
3. Existing member, data matches → forward to VanillaSoft → on success, advance stage to ENROLLMENT → upload files to SharePoint (on VS failure → **review queue**)
4. Data mismatch → **review queue** (conflict)

## VanillaSoft Integration

The backend forwards payloads directly to existing VanillaSoft Incoming Web Lead endpoints as `application/x-www-form-urlencoded`. The 400+ field mappings already configured in VanillaSoft are preserved — **no remapping occurs**.

| Form Type  | VanillaSoft Endpoint |
|------------|---------------------|
| Referral   | `https://s2.vanillasoft.net/web/post.aspx?id=1007863` |
| Intake     | `https://s2.vanillasoft.net/web/post.aspx?id=1007862` |
| Enrollment | `https://s2.vanillasoft.net/web/post.aspx?id=1007864` |

## SharePoint Integration

Files attached to JotForm submissions are uploaded to SharePoint via Microsoft Graph API.

Folder structure:
```
CareCollab/{CIN}/{FormType}/{SubmissionID}/filename.pdf
```

SharePoint uploads are non-blocking — if upload fails, the main VanillaSoft forward still succeeds.

## Testing

```bash
pnpm test           # Run all tests
pnpm test:watch     # Watch mode
pnpm test:coverage  # With coverage report
```

## Example Payloads

See the `examples/` directory for sample payloads:
- `referral-payload.json`
- `intake-payload.json`
- `enrollment-payload.json`
- `admin-replay-request.json`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `VS_REFERRAL_POST_URL` | No | VanillaSoft referral endpoint (has default) |
| `VS_INTAKE_POST_URL` | No | VanillaSoft intake endpoint (has default) |
| `VS_ENROLLMENT_POST_URL` | No | VanillaSoft enrollment endpoint (has default) |
| `JOTFORM_API_KEY` | No | JotForm API key |
| `JOTFORM_WEBHOOK_SECRET` | No | If set, callers must send header `x-jotform-webhook-secret` or query `webhook_secret` |
| `SHAREPOINT_CLIENT_ID` | No | Azure AD app client ID |
| `SHAREPOINT_CLIENT_SECRET` | No | Azure AD app client secret |
| `SHAREPOINT_TENANT_ID` | No | Azure AD tenant ID |
| `SHAREPOINT_SITE_ID` | No | SharePoint site ID |
| `SHAREPOINT_DRIVE_ID` | No | SharePoint drive ID |
| `ADMIN_API_KEY` | For admin functions | Required for `admin-review` / `admin-replay` (`X-Api-Key` header). Omit only if those functions are not deployed. |

## Processing order (logic)

- **Referral:** Create the `Member` row first, then forward to VanillaSoft. If VS fails, the member still exists and the submission goes to the review queue (local CIN anchor for deduplication).
- **Intake / enrollment:** Forward to VanillaSoft **first**; only on HTTP success does the code advance `Member.currentStage` and (for enrollment) run SharePoint uploads. That way a VS failure does not leave Postgres showing INTAKE/ENROLLMENT while VanillaSoft never received the payload.

## Implementation notes and limitations

- **Request body encoding**: Webhook handlers decode `event.body` when `isBase64Encoded` is true (common on API Gateway / Netlify for some payloads). See `src/utils/netlify-body.ts`.
- **JotForm payload shape**: The pipeline expects flat fields (or the aliases in `src/modules/webhooks/schema.ts`). If your webhook sends JotForm’s nested `prettyFormat` / `answers` JSON only, add a small normalizer or point JotForm at a translation layer.
- **Idempotency vs retries**: The idempotency key is recorded at the start of processing. If the function times out after that but before VanillaSoft returns, a JotForm automatic retry may be treated as a duplicate and skipped. Monitor `SubmissionEvent` and the review queue for stuck cases.
- **Admin replay**: Replay deletes the stored idempotency key for that submission, runs the pipeline again (creating a new `SubmissionEvent`), then marks the review item `REPLAYED`. If `processSubmission` throws, the key is restored when possible so deduplication stays consistent.
- **SharePoint file download**: Files are downloaded with `fetch` from the URLs JotForm provides. Private or signed URLs may need `JOTFORM_API_KEY` appended per JotForm’s docs (not auto-appended here).
- **Streaming uploads**: Large files are buffered in memory (`arrayBuffer`) for the Graph upload. For very large files, consider chunked upload sessions via Graph.
- **VanillaSoft forwarding**: Top-level string values are URL-encoded. Nested objects in the payload would stringify poorly; keep webhook payloads flat for VS compatibility.
- **JotForm submission IDs**: `submissionID` / `submission_id` are accepted as strings or numbers and normalized to string (avoids Zod failures and bad idempotency keys).
- **Concurrent referrals (same CIN)**: If two referrals race, the second `createMember` hits a unique constraint; the handler catches that, loads the member, and routes to the review queue instead of a 500.
- **Payload hash (fallback idempotency)**: Hashing uses recursive sorted keys (`stableStringify`) so nested JSON key order does not change the hash.
- **SharePoint upload path**: Path segments are `encodeURIComponent`’d for Graph `root:/path:/content` URLs (safe filenames with spaces or Unicode).

## Deployment

This project is designed for **Netlify**. Connect your repository and it will auto-deploy.

Build settings are configured in `netlify.toml` (including `NODE_VERSION = 20`). The Netlify build runs **`pnpm run typecheck`** then **`pnpm run db:generate`** so TypeScript errors fail the deploy. Set all environment variables in the Netlify dashboard. Database schema is **not** applied by that build; run `pnpm db:migrate:deploy` (or your host’s migration step) against production Postgres separately.

## Database Management

```bash
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database (no migration)
pnpm db:migrate       # Create and apply migration
pnpm db:migrate:deploy # Apply migrations in production
pnpm db:studio        # Open Prisma Studio GUI
```
