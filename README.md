# ApplyRecall

> **Apply once. Remember everything. Stay in control.**  
> *AI-assisted job application management and automation platform.*

ApplyRecall connects three primary interaction surfaces into a unified, privacy-first personal job application assistant:
1. **Chrome Extension (Manifest V3)** — The primary interaction point right where you apply: auto-detects job listings, parses form fields, autofills approved profile data and saved answers, saves unfamiliar questions on the go, and prompts you to confirm submission.
2. **Web Dashboard (Next.js & Tailwind CSS)** — The central visibility and management layer: track application pipelines, manage your reusable Answer Library across scopes, update your approved student profile, manage reminders, and generate follow-up email drafts.
3. **Telegram Assistant** — The conversational mobile interface: check application summaries, look up pending statuses, update interviews on the go, set reminders, and request follow-up drafts directly from your phone.
4. **Python Reminder Worker** — Continuously monitors scheduled follow-ups, checks application state (never bugs you about Rejected, Withdrawn, or Offer opportunities), prevents duplicates, and delivers notifications.

All four surfaces share a single database source of truth.

---

## Architecture Overview

```
                      +-----------------------------+
                      |      CHROME EXTENSION       |
                      | (Manifest V3, 380px Popup)  |
                      | - Detects Job & JSON-LD     |
                      | - Scans Form Fields         |
                      | - Autofills Approved Info   |
                      | - Saves Answers on the Go   |
                      | - Confirms Submission       |
                      +--------------+--------------+
                                     |
                                     | REST API (Bearer Token / Pairing)
                                     v
+---------------------+       +-----------------------+       +----------------------+
|  NEXT.JS DASHBOARD  | <---> | PYTHON FASTAPI SERVER | <---> | TELEGRAM ASSISTANT   |
| (Arcade SaaS UI)    |       | (Business Rules & ML) |       | (Conversational Bot) |
| - Pipeline Overview |       +-----------+-----------+       | - /summary, /status  |
| - Answer Library    |                   |                   | - Quick Updates      |
| - Profile Memory    |                   v                   | - Reminders          |
| - Follow-up Composer|       +-----------------------+       +----------------------+
+---------------------+       |  POSTGRESQL / SQLITE  |
                              | (Single Source Truth) |
                              +-----------+-----------+
                                          ^
                                          |
                              +-----------+-----------+
                              | PYTHON REMINDER WORKER|
                              | (Deduplicated Cron)   |
                              +-----------------------+
```

---

## Design System: Arcade-Inspired Minimal SaaS

- **Color Tokens**:
  - Primary Accent Blue: `#2142E7`
  - Deep Blue: `#182FA5`
  - Canvas White: `#FFFFFF`
  - Soft Background: `#F9FAFB`
  - Subtle Surface: `#F3F4F6`
  - Text Primary: `#111827`
  - Text Secondary: `#4B5563`
  - Borders: `#E5E7EB`
- **Typography**: Inter (Weights: 400, 500, 600, 700), tabular numerals for dates and counts.
- **Radius System**: 8px (tags), 12px (buttons/inputs), 16px (cards), 20px (containers).
- **Popup Dimensions**: 380px width, 540–600px height, scrollable content.

---

## Directory Structure

```
applyrecall/
├── backend/
│   ├── app/
│   │   ├── config.py              # App settings & env loading
│   │   ├── database.py            # Unified schema & local SQLite / Supabase PostgreSQL engine
│   │   ├── main.py                # FastAPI entrypoint, middleware, routers
│   │   ├── worker.py              # Standalone background reminder worker
│   │   ├── models/schemas.py      # Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py            # Pairing code generation & linking
│   │   │   ├── profile.py         # Profile, experiences, projects, export
│   │   │   ├── answers.py         # Intelligent answer library & matching engine
│   │   │   ├── applications.py    # Applications tracking, timeline events, confirm-applied
│   │   │   ├── reminders.py       # Reminders CRUD, snooze, manual trigger
│   │   │   ├── dashboard.py       # Metric summary, pipeline distribution, activity feed
│   │   │   └── telegram_router.py # Webhook & interactive test simulator
│   │   └── services/
│   │       ├── matching.py        # Question normalization, keywords, fuzzy & intent matching
│   │       ├── followup.py        # Follow-up email draft generator (Gmail & mailto)
│   │       ├── reminder_service.py# Worker logic, terminal status checks, deduplication
│   │       └── telegram_service.py# Conversational NLP & Telegram Bot API client
│   ├── tests/
│   │   ├── test_backend.py        # Unit tests for matching, scoping, reminders, telegram
│   │   └── test_e2e_scenarios.py  # End-to-end integration tests for all 10 specification scenarios
│   ├── supabase_schema.sql        # Full Supabase PostgreSQL DDL with RLS & indexes
│   ├── run.py                     # API launcher
│   └── requirements.txt
├── extension/
│   ├── manifest.json              # Manifest V3 configuration
│   ├── popup.html                 # 380px Arcade-styled popup UI
│   ├── popup.css                  # Custom design token styling
│   ├── popup.js                   # Extension state machine & API bridge
│   ├── content.js                 # Content script for JSON-LD, form inspection, safe autofill
│   ├── background.js              # Service worker & session persistence
│   ├── test_form.html             # Interactive Acme job application test page
│   └── icons/                     # Generated extension icons (16, 32, 48, 128)
├── dashboard/
│   ├── app/
│   │   ├── page.tsx               # Overview dashboard & metrics
│   │   ├── applications/page.tsx  # Applications tracking & detail slide-over
│   │   ├── answers/page.tsx       # Answer Library (Universal, Company, Role scopes)
│   │   ├── profile/page.tsx       # Approved student profile & experience
│   │   ├── reminders/page.tsx     # Due, upcoming, snoozed & completed reminders
│   │   ├── settings/page.tsx      # Device pairing codes & Telegram simulator
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/                # Reusable Sidebar, TopBar, Modals
│   ├── lib/api.ts                 # Typed API client
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
└── README.md
```

---

## Quickstart Guide

### 1. Backend (FastAPI)

1. Open a terminal in `backend/`:
   ```bash
   cd backend
   .\venv\Scripts\activate
   python run.py
   ```
2. The API will start at `http://127.0.0.1:8000`.
   - Interactive Swagger Docs: `http://127.0.0.1:8000/docs`
   - Default Student Profile Seeded: `Alex Morgan (Stanford University)`

### 2. Web Dashboard (Next.js)

1. Open a terminal in `dashboard/`:
   ```bash
   cd dashboard
   npm run dev
   ```
2. Open `http://localhost:3000` in your browser.

### 3. Chrome Extension

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `extension/` folder in this repository.
4. Click the ApplyRecall extension icon:
   - Click **Use Default Student Profile** (or enter a 6-character pairing code from the dashboard Settings page).
   - Open `extension/test_form.html` in Chrome to test live job detection, autofill, and submission confirmation!

### 4. Background Reminder Worker

In a separate terminal:
```bash
cd backend
.\venv\Scripts\python.exe -m app.worker
```
The worker periodically checks the database for reminders where `reminder_at <= now`, skips terminal opportunities (Rejected, Withdrawn, Offer), dispatches Telegram notifications, and marks reminders completed.

---

## Non-Negotiable Product Principles Implemented

1. **Remember only approved information**: Details are saved only when entered by the student or saved via the "Save to Answer Library" action.
2. **Never invent details**: Follow-up email drafts use verified application parameters. Missing HR emails are left blank for student entry.
3. **Never silently submit**: The student reviews all autofilled fields. The extension never automatically clicks submit buttons or uploads files.
4. **Never send emails automatically**: Generates prefilled `mailto:` and Gmail web compose links for student review.
5. **Strict Answer Scoping**:
   - `general`: Universal answers (Tell us about yourself, Strengths).
   - `company`: Company-specific answers (e.g. Acme) are **never** offered for a different company (e.g. Stripe).
   - `application`: Tied strictly to the position and role.
6. **Single Source of Truth**: All interfaces read and write to the same backend tables and user account.

---

## Running the Verification Test Suite

Run the full pytest suite covering unit and end-to-end integration scenarios:

```bash
cd backend
$env:PYTHONPATH="."
.\venv\Scripts\pytest.exe -v
```

All 7 test suites pass, verifying:
- Profile autofill data retrieval
- Answer matching with exact, keyword, fuzzy, and intent recognition
- Strict company-scoping isolation (Acme answer is never matched for Stripe)
- Unknown question saving on the go and subsequent future reuse
- Job context recognition via JSON-LD and document headers
- Application submission confirmation and automatic reminder creation
- Telegram assistant conversational summaries, company lookups, and status updates
- Reminder worker processing and cancellation of reminders for terminal statuses (Rejected/Withdrawn/Offer)
- Follow-up email draft generation with Gmail & mailto links
- Multi-user privacy isolation
