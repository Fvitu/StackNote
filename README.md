# StackNote

A local-first feeling study workspace with a block editor, AI help, flashcards, and focus tools.

## Screenshots

![Login](public/readme/login.png)
![Dashboard](public/readme/dashboard.png)
![Editor](public/readme/editor.png)
![Planner](public/readme/planner.png)

## What is this

StackNote is a notes app built around a block editor. You can write normal notes, drop in files, embed videos, add equations, and keep everything organized in workspaces and folders. Notes autosave while you type.

It also has an AI side built for study workflows. You can chat with note context, run quick text actions on selected content, generate quizzes, and generate flashcard decks from notes or selections.

The flashcard flow is not just static cards. Decks track due dates, review history, and scheduling fields, then run through an FSRS-style scheduler when you study. There is also an exam planner that turns linked notes into daily question plans.

For focus, there is a Pomodoro timer with cycle settings plus a quick-note widget for capture while you work. The app ships as a PWA with offline-aware caching so navigation and common reads still work better on weak or unstable connections.

## Features

- Block editor built with BlockNote and custom schema extensions.
- Default editor blocks enabled: paragraph, heading, bullet list, numbered list, checklist, quote, table.
- Custom block types:
  - `imageMedia` for uploaded images
  - `pdfMedia` for uploaded PDF files
  - `audioMedia` for uploaded audio files
  - `videoEmbed` for YouTube/Loom/Vimeo embeds
  - `linkPreview` for fetched URL metadata previews
  - `equation` for block-level KaTeX math
  - `codeBlock` for syntax-highlighted code
  - `aiBlock` for inline AI generation
- Custom inline type: `inlineEquation` for inline math.
- Slash menu custom actions for media upload, equations, code, emoji insertion, and AI block insertion.
- Drag-and-drop and paste upload flow for media with progress placeholders.
- Secure link preview fetch with DNS/IP checks to block local/private hosts.
- Shiki-powered code highlighting API with in-memory cache.
- AI chat sessions scoped to workspace/note context with persisted history.
- AI text actions API: summarize, expand, fix, translate, simplify, and quiz prompts on selected text.
- AI flashcard generation API with strict JSON parsing and fallback model path.
- AI quiz generation API with JSON repair/normalization for model output edge cases.
- AI speech-to-text transcription via Groq Whisper models, with segment timestamps.
- AI usage and quota windows per category/model (text, flashcards, quiz, voice) with rolling 24-hour limits.
- Flashcard decks stored per user/note, with card scheduling fields (`stability`, `difficulty`, `reps`, `lapses`, `state`, `dueDate`).
- Study session APIs to start sessions, submit card ratings (1-4), update schedule, and finish sessions.
- FSRS-style scheduler implementation in app code (`scheduleCard`, `predictRetention`, interval estimation).
- Exam planner with linked notes, generated day plans, question counts, and study session queue endpoints.
- Full-text note search with PostgreSQL `to_tsquery`/`ts_rank_cd` ranking and `ts_headline` snippets.
- Search text extraction pipeline from block content into `searchableText` plus `search_vector` indexing support.
- Notes and folders tree with ordering/reordering endpoints.
- Soft delete trash system for notes and folders with restore, hard delete, empty trash, and paginated trash listing.
- Scheduled cron purge for expired trash, with Redis lock protection.
- Note version checkpoints with manual/auto snapshots and retention limit handling.
- Cover image system:
  - Unsplash search endpoint
  - Uploaded cover images to storage
  - Stored cover metadata and position data
- File upload and attachment system backed by Supabase Storage bucket `stacknote-files`.
- File metadata table with signed URL proxy/download/rename/delete endpoints.
- Authentication with NextAuth + Prisma adapter:
  - Email magic links via Resend
  - Google OAuth
  - Guest session creation endpoint
- User settings endpoint including preferred AI text/STT model keys.
- Quick note API (per-user persisted note blob).
- PWA support (manifest + service worker + runtime caching rules) with offline route fallback.
- React Query configured in `offlineFirst` mode with persistence-oriented cache timings.

## Tech stack

```text
Frontend
  - Next.js 16 (App Router) + React 19 + TypeScript
  - BlockNote editor (@blocknote/core, @blocknote/react, @blocknote/mantine)
  - Tailwind CSS 4 + shadcn/ui patterns + Sonner toasts
  - TanStack React Query (offlineFirst setup)
  - KaTeX for equations
  - Shiki for code highlighting
  - DnD Kit for drag interactions

Backend / API
  - Next.js Route Handlers
  - NextAuth v5 beta for auth/session handling
  - Prisma 7 with PostgreSQL adapter
  - Redis (ioredis) for cron locking and optional infra hooks

Database & Storage
  - PostgreSQL (Prisma schema + migrations)
  - Supabase Storage bucket (`stacknote-files`) for uploaded files and covers

AI
  - Groq API (chat completions for chat/actions/quiz/flashcards)
  - Groq Whisper models for audio transcription
  - Model-specific quota windows and usage tracking in DB

Infrastructure
  - Vercel deployment target (with cron in `vercel.json`)
  - next-pwa plugin for service worker/runtime caching
  - Optional bundle analysis via `@next/bundle-analyzer`
```

## Getting started

### Prerequisites

- Node.js 20+.
- npm (project ships with `package-lock.json`).
- PostgreSQL database (required).
- Supabase project with Storage enabled (required for file/cover uploads).
- Groq API key (required for AI features).
- Redis instance (optional, used by cron lock and related flows).
- Resend account (optional, needed for magic-link email auth).
- Google OAuth credentials (optional, needed for Google sign-in).
- Unsplash API key (optional, needed for cover image search).

### Installation

1. Clone and enter the project.
2. Install dependencies.
3. Create `.env.local` from `.env.example`.
4. Fill in environment values.
5. Run Prisma migrations and generate Prisma client.

```bash
git clone <your-repo-url>
cd StackNote
npm install
copy .env.example .env.local
npx prisma migrate dev
npx prisma generate
```

`.env.local` reference:

| Variable | Purpose | Required | Example |
|---|---|---|---|
| DATABASE_URL | Primary PostgreSQL connection string for app reads/writes | Yes* | postgresql://postgres:password@localhost:5432/stacknote |
| DIRECT_URL | Direct PostgreSQL connection string for Prisma/migrations | Yes* | postgresql://postgres:password@localhost:5432/stacknote |
| REDIS_URL | Redis connection for cron lock and optional cache infra | No | redis://localhost:6379 |
| NEXTAUTH_SECRET | Session/auth signing secret | Yes (prod) | your-random-base64-secret |
| NEXTAUTH_URL | Public app URL for auth callback handling | Yes (prod) | http://localhost:3000 |
| RESEND_API_KEY | Resend key for email magic-link login | No | re_xxxxxxxxx |
| RESEND_FROM | Sender email for magic-link mail | No | StackNote <noreply@example.com> |
| GOOGLE_CLIENT_ID | Google OAuth client ID | No | 1234567890-abc.apps.googleusercontent.com |
| GOOGLE_CLIENT_SECRET | Google OAuth client secret | No | gocspx-xxxxx |
| NEXT_PUBLIC_SUPABASE_URL | Supabase project URL (client/server storage calls) | Yes (uploads) | https://your-project.supabase.co |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Supabase anon key for browser client | Yes (uploads) | eyJhbGciOi... |
| SUPABASE_SERVICE_ROLE_KEY | Supabase service role for server-side storage actions | Yes (uploads) | eyJhbGciOi... |
| UNSPLASH_ACCESS_KEY | Unsplash API key for cover image search/tracking | No | your_unsplash_key |
| GROQ_API_KEY | Groq API key for AI chat/actions/quiz/flashcards/transcribe | Yes (AI features) | gsk_xxxxxxxxx |
| CRON_SECRET | Bearer secret for manual cron endpoint calls | No | your-cron-secret |
| ANALYZE | Enables Next bundle analyzer when set to `true` | No | true |
| AUTH_URL | Optional alias used to resolve auth base URL | No | http://localhost:3000 |
| AUTH_SECRET | Optional alias for auth secret (preferred by some auth setups) | No | your-random-base64-secret |
| DATABASE_URL_POOLED | Optional pooled DB URL fallback for Prisma runtime | No | postgresql://user:pass@pooler-host:5432/db |
| DATABASE_POOLER_URL | Optional pooled DB URL alias | No | postgresql://user:pass@pooler-host:5432/db |
| POSTGRES_PRISMA_URL | Optional pooled DB URL alias for Prisma | No | postgresql://user:pass@pooler-host:5432/db |
| POSTGRES_URL | Optional generic Postgres URL fallback | No | postgresql://user:pass@host:5432/db |
| INTERNAL_CRON_SECRET | Present in `.env.example`, currently not read by runtime code | No | legacy-secret |

`*` One of `DATABASE_URL` or `DIRECT_URL` must be valid for local development. In practice most setups provide both.

### Running locally

```bash
npm run dev
```

Notes:

- Make sure PostgreSQL is running and env vars are loaded first.
- If you use uploads, Supabase keys and bucket access must be configured.
- AI endpoints return auth or quota errors until auth and Groq key are set.

### Running in production

```bash
npm run build
npm run start
```

Notes:

- `next.config.ts` disables PWA in development and enables it outside dev unless Vercel runtime says otherwise.
- Vercel cron is configured to call `/api/cron/purge-trash` daily at 03:00 UTC.
- In production you should set `NEXTAUTH_SECRET` (or `AUTH_SECRET`) explicitly.

## Optimization

### Lazy loading: defer heavy editor features

Problem: editor dependencies are large. Loading all of them up front increases initial JS cost.

What I changed: heavy UI paths are split with `dynamic()`.

- `src/components/editor/LazyNoteEditor.tsx` loads `NoteEditor` on demand.
- `src/components/editor/NoteEditor.tsx` loads `emoji-picker-react` on demand (`ssr: false`).
- `src/components/layout/MainContent.tsx` loads `NoteWorkspace` on demand.

Measured result (from `ANALYZE=true npm run build`, reading `.next/react-loadable-manifest.json` + emitted chunk file sizes):

- Deferred `NoteEditor` group: **379.4 KB** (`388,460` bytes).
- Deferred `emoji-picker-react` group: **300.0 KB** (`307,158` bytes).
- Deferred `NoteWorkspace` group: **86.3 KB** (`88,397` bytes).

These chunks are excluded from the initial JS bundle and only load when the user navigates to a note.
Total JS deferred behind dynamic boundaries in these three paths: **765.7 KB** (`784,015` bytes).

### HTTP caching + compression: smaller repeat transfers

Problem: repeat page and asset requests can keep downloading the same bytes.

What I changed: ETag revalidation and response compression are enabled in production.

- Revalidation check against `/_next/static/chunks/webpack-be681895f63673a4.js`:
  - first request: `HTTP/1.1 200 OK`
  - second request with `If-None-Match`: `HTTP/1.1 304 Not Modified`
- Compression check on the same asset:
  - identity transfer: **5,586 bytes**
  - compressed transfer: **2,799 bytes**
  - reduction: **49.89%** fewer transferred bytes

Measured result: cached repeat requests avoid body transfer via `304`, and compressed transfer cut payload by almost half on the tested asset.

### Lighthouse snapshot (production build)

Run command:

```bash
npx -y lighthouse http://localhost:3000/login --quiet --chrome-flags="--headless=new --no-sandbox" --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=.lighthouse-login.json
```

Scores and key timings:

- Performance: **93**
- Accessibility: **94**
- Best Practices: **96**
- SEO: **100**
- First Contentful Paint: **1.2 s**
- Largest Contentful Paint: **3.2 s**
- Total Blocking Time: **60 ms**
- Speed Index: **1.2 s**

## AI statement

I used it as a tool throughout the project, both for brainstorming and implementation. Before writing code, I used it to shape the product direction and break it into buildable phases — that roadmap saved a lot of time upfront.

On the code side, AI helped with boilerplate-heavy work: Prisma schema drafts, API route structure, and React Query patterns. The FSRS scheduler, the full-text search pipeline with tsvector/GIN indexing, the custom BlockNote block schema, and the file upload flow were all written by me. Anything touching auth, quota enforcement, or DB write logic got manual review regardless.

Inside the app, AI is a core feature. StackNote uses Groq chat models for the assistant panel, text actions, quiz and flashcard generation, and Groq Whisper for audio transcription.

## License

Licensed under the [MIT License](LICENSE).
