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
| `GET` | `/.netlify/functions/admin-review` | List review queue items |
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
3. Existing member, data matches → update stage → forward to VanillaSoft
4. Data mismatch → **review queue** (conflict)

### Enrollment
1. No CIN → **review queue**
2. No existing member → **review queue**
3. Existing member, data matches → update stage → forward to VanillaSoft → upload files to SharePoint
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
| `JOTFORM_WEBHOOK_SECRET` | No | JotForm webhook verification secret |
| `SHAREPOINT_CLIENT_ID` | No | Azure AD app client ID |
| `SHAREPOINT_CLIENT_SECRET` | No | Azure AD app client secret |
| `SHAREPOINT_TENANT_ID` | No | Azure AD tenant ID |
| `SHAREPOINT_SITE_ID` | No | SharePoint site ID |
| `SHAREPOINT_DRIVE_ID` | No | SharePoint drive ID |
| `ADMIN_API_KEY` | Yes | API key for admin endpoints |

## Deployment

This project is designed for **Netlify**. Connect your repository and it will auto-deploy.

Build settings are configured in `netlify.toml`. Set all environment variables in the Netlify dashboard.

## Database Management

```bash
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database (no migration)
pnpm db:migrate       # Create and apply migration
pnpm db:migrate:deploy # Apply migrations in production
pnpm db:studio        # Open Prisma Studio GUI
```
