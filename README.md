# ApplyRecall

> **Apply once. Remember everything. Stay in control.**

ApplyRecall is an intelligent job application management and memory platform designed for students and job seekers applying across dozens of careers portals and ATS platforms.

---

## 01. Architecture Overview

ApplyRecall connects three user surfaces backed by a single source of truth:

```
+-------------------------------------------------------------------------------+
|                             CHROME EXTENSION                                  |
|   * Content script (detects job postings, JSON-LD, form fields)               |
|   * Tab-isolated application context (prevents multi-tab state corruption)    |
|   * Safe autofill (preserves existing field inputs; skips sensitive fields)   |
|   * Answer memory (matches approved answers, saves unmapped prompts)          |
|   * Submission detection (prompts to confirm submission & schedules reminders)|
+---------------------------------------+---------------------------------------+
                                        | (HTTPS / X-Device-Token)
                                        v
+-------------------------------------------------------------------------------+
|                           FASTAPI PYTHON BACKEND                              |
|   * Supabase JWT verification (signature, issuer, expiration, sub claim)      |
|   * Device token engine (SHA-256 hashed tokens, atomic single-use pairing)    |
|   * Strict scoping rules (universal vs company-specific vs application)       |
|   * Reminders engine (exponential backoff retry, terminal status guard)       |
|   * Telegram assistant router (webhook secret check, update_id deduplication) |
|   * Strict CORS enforcement (no wildcards in production)                      |
+-------------------+---------------------------------------+-------------------+
                    |                                       |
                    v                                       v
+---------------------------------------+   +-----------------------------------+
|         SUPABASE POSTGRESQL           |   |       TELEGRAM BOT ASSISTANT      |
|   * Row Level Security (RLS) on all   |   |   * Quick status queries          |
|     12 production tables              |   |   * Conversational updates        |
|   * Profiles, Experiences, Projects   |   |   * Follow-up draft generation    |
|   * Answer library with scope flags   |   |   * Follow-up reminder alerts     |
|   * Applications & Timeline audit log |   |   * Authenticated via /link CODE  |
|   * Hashed pairing codes & devices    |   +-----------------------------------+
+-------------------+-------------------+
                    ^
                    | (HTTPS / JWT / Proxy)
+-------------------+-----------------------------------------------------------+
|                           NEXT.JS 14 DASHBOARD                                |
|   * Arcade-inspired, high-density minimal UI (38px touch targets, Inter)      |
|   * Pipeline overview (Saved, Applied, Assessment, Interview, Offer, Rejected)|
|   * Answer Library manager (general vs company-specific vs role-specific)     |
|   * Follow-up draft modal with Gmail & Mailto pre-filled composer links       |
|   * Device pairing & connection settings (with real-time simulator)           |
+-------------------------------------------------------------------------------+
```

---

## 02. Security & Remediation Enhancements

A rigorous technical audit identified and resolved all production blockers:

1. **Authentication & Identity**:
   - Removed all default user ID fallbacks in production.
   - Integrated Supabase JWT verification (`HS256` validation against `SUPABASE_JWT_SECRET`, checking `sub`, `exp`, `iat`, and `iss`).
   - Device pairing issues high-entropy cryptographically random device tokens (`secrets.token_urlsafe(32)`) with SHA-256 hashes stored in `device_connections`.
   - Pairing codes expire in 5 minutes and are single-use enforced atomically.
   - Connected devices can be viewed and revoked via `/api/auth/devices`.

2. **Chrome Extension Improvements**:
   - Tab-isolated context: State is scoped per tab (`tab_${tabId}_application` and `tab_${tabId}_submission_pending`), preventing tab crosstalk when applying to multiple jobs simultaneously.
   - Safe autofill: Does NOT overwrite existing form field inputs unless explicitly forced.
   - Sensitive field skipping: Passwords, CVV, OTP, tokens, SSN, bank routing, and salary expectation fields are automatically bypassed.
   - Verification feedback: Form inputs are validated after injection to verify DOM value update.
   - Unanswered question detection: Long-form questions on the active page are surfaced for instant review and saving to the answer library.

3. **Telegram Assistant**:
   - Webhook security: Validates incoming requests using `X-Telegram-Bot-Api-Secret-Token` and `hmac.compare_digest`.
   - Update deduplication: Tracks `update_id` in `telegram_processed_updates` to prevent duplicate processing.
   - Ambiguous company disambiguation: Handles multiple applications at the same company cleanly.
   - Dev-gate simulation: `/api/telegram/simulate` is strictly disabled in production.

4. **Background Reminder Worker**:
   - Retry lifecycle: `pending` -> `processing` -> `sent` / `failed` with exponential backoff (5m, 20m, 80m).
   - Terminal status guard: Never notifies students about jobs marked `Rejected`, `Withdrawn`, or `Offer`.
   - Timezone-aware timestamping throughout.

5. **Secrets & Hygiene**:
   - `.env` and `*.db` files removed from git tracking and added to `.gitignore`.
   - Clean `.env.example` templates created for both backend and dashboard.

---

## 03. Getting Started (Local Development)

### Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- Chrome or Chromium-based browser

### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
# Start the API server
python run.py
```
API runs at `http://127.0.0.1:8000`. Documentation available at `http://127.0.0.1:8000/docs`.

### 2. Background Reminder Worker
```bash
cd backend
# With venv activated:
python -m app.worker
```

### 3. Web Dashboard
```bash
cd dashboard
npm install
npm run dev
```
Dashboard opens at `http://localhost:3000`.

### 4. Chrome Extension
1. Open Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked** and select the `extension/` directory.
4. Pin the ApplyRecall extension icon to your browser toolbar.

---

## 04. Production Deployment

### Database (Supabase)
1. Create a project on [Supabase](https://supabase.com).
2. Open the SQL Editor and execute `backend/supabase_schema.sql`.
3. In Project Settings > API, copy the **Project URL**, **Anon Key**, **Service Role Key**, and **JWT Secret**.

### Backend (Render / Railway / Fly.io)
1. Connect your repository to Render.
2. Use the included `render.yaml` blueprint or configure a Web Service:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Configure environment variables from `backend/.env.example`.
4. Deploy the Background Worker service using start command: `python -m app.worker`.

### Web Dashboard (Vercel)
1. Import repository to [Vercel](https://vercel.com).
2. Set Root Directory to `dashboard`.
3. Framework preset: **Next.js**.
4. Configure environment variables:
   - `BACKEND_PROXY_URL`: URL of your deployed FastAPI service.

### Telegram Assistant (BotFather) & Webhook CLI
1. Message `@BotFather` on Telegram and create a new bot via `/newbot`.
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` in backend environment variables.
3. Use the built-in management CLI to configure, verify, or remove webhooks:
   ```bash
   # Register webhook and verify live registration
   python -m app.cli register-webhook --url https://your-api.onrender.com/api/telegram/webhook

   # Inspect webhook health and pending updates
   python -m app.cli get-webhook-info

   # Remove webhook if returning to polling mode
   python -m app.cli remove-webhook
   ```

### Database Management & Migrations CLI
Apply migrations and test database connectivity:
```bash
# Verify database connection, table row counts, and applied migrations
python -m app.cli db-check

# Run all pending migrations against current database
python -m app.cli migrate
```

---

## 05. Verification & Testing

Run all unit, integration, security, and end-to-end tests:

```bash
cd backend
# Set pythonpath and run pytest
$env:PYTHONPATH="."
.\venv\Scripts\pytest.exe -v
```

Current test suite: **33 tests passing (100%)**, covering:
- Database initialization, schema migration, and starter seeding
- PostgreSQL parameter adaptation (UUIDs, ISO timestamps with timezones, JSON dict/list)
- Robust SQL placeholder conversion scanner (`?` to `$1`, `$2` preserving quotes and comments)
- Unauthorized request rejection (missing token, malformed token, unknown user)
- Supabase JWT cryptographic validation (`HS256`, audience `authenticated`, project issuer verification)
- Atomic pairing code generation, SHA-256 hashing, single-use, and expiration
- Opaque device token authentication and device revocation
- Semantic, keyword, and strict scoping answer matching
- Follow-up email draft generation with Gmail and Mailto deep links
- Conversational Telegram Assistant queries and status updates
- Telegram webhook secret verification and `update_id` deduplication
- Reminder atomic claiming (`FOR UPDATE SKIP LOCKED` / SQLite concurrency check)
- 4-attempt exponential backoff retry schedule (`[5m, 20m, 80m]`) and terminal failure handling
- Stale processing claim recovery for crashed workers (>10 minutes)
- Truthful Telegram delivery error classification (retryable 429/5xx vs permanent 400/401/403)
- Strict user data privacy and tenant isolation
- Full cross-surface end-to-end workflow simulation

---

## 06. License

Proprietary — ApplyRecall Team. All rights reserved.
