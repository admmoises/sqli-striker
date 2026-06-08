# Contributing

Thanks for your interest in contributing to SQLI Striker.

## Setup

```bash
git clone https://github.com/admmoises/sqli-striker
cd sqli-striker
npm install
```

Prerequisites:
- Node.js 20+
- sqlmap installed and in PATH (`brew install sqlmap` on macOS, `apt install sqlmap` on Kali/Ubuntu)
- Override `SQLMAP_BIN` and `SQLMAP_TAMPER_DIR` via `.env.local` if needed

```bash
# .env.local (optional, macOS Apple Silicon defaults)
SQLMAP_BIN=/opt/homebrew/bin/sqlmap
SQLMAP_TAMPER_DIR=/opt/homebrew/Cellar/sqlmap/*/libexec/tamper
```

```bash
npm run dev     # dev server on :3000
npm run build   # production build
npm run start   # serve production build
```

## Project Structure

```
app/            → Next.js App Router (pages + API routes)
components/     → 19 React client components
lib/            → 7 shared modules (config, args, scan manager, i18n, parser)
```

## Conventions

- TypeScript strict mode
- Client components (`"use client"`) only where browser APIs are needed
- CSS via Tailwind v4 with custom design tokens (`globals.css`)
- i18n: new strings go in `lib/i18n.ts` in both blocks (EN and PT)
- API routes use `runtime = "nodejs"` (child process spawning)

## Before Opening a PR

- Run `npm run build` — it must pass without errors
- Test manually with a real scan against a test target (e.g. `http://testphp.vulnweb.com/artists.php?artist=1`)
- Ensure i18n strings are present in both languages
- Follow existing code style — no loose `any`, use explicit types
