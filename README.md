# Webot site

`Webot-Daylight.html` is a **single self-contained file** (all fonts, images and
the component runtime are embedded). Just open it in a browser — it now ships in
**3 languages with a language switcher**: English, Arabic (العربية) and Hebrew
(עברית), with full right-to-left (RTL) support and a polished mobile layout.

## Editing the site

Don't hand-edit `Webot-Daylight.html` (it's a generated bundle). Edit the source
and rebuild:

| File | What it holds |
| --- | --- |
| `src/xdc.html` | All copy + translations (the `I18N` object) and the component logic. **Edit translations here.** |
| `build.js` | Transforms the original export and regenerates the bundle + preview. |
| `Webot-Daylight.original.html` | Pristine English export — never edited; the build always reads from this. |
| `server.js` | Local dev server: `preview/` + `/api/lead` (MongoDB). |
| `netlify.toml` + `netlify/functions/` | Production deploy on Netlify (static site + lead function). |
| `lib/lead.js` | Shared lead validation / MongoDB / email logic. |
| `.env` (from `.env.example`) | Your `MONGODB_URI` + optional Gmail credentials. |
| `preview/` | Generated previewable site (assets unpacked as normal files). |

### Rebuild

```bash
node build.js
```

This regenerates both `preview/index.html` (for live preview) and the final
`Webot-Daylight.html` (the deliverable).

### Preview locally

```bash
node server.js      # then open http://localhost:7777
```

## What changed vs. the original

- **Arabic + Hebrew** added with professional translations of every string.
- **Language switcher** in the navbar (EN / AR / HE) and in the mobile menu
  (full native names). Choice is remembered via `localStorage`.
- **Full RTL**: `dir`/`lang` on `<html>`, mirrored layout, flipped arrows, the
  mobile menu opens from the correct side, and Arabic/Hebrew web fonts (Cairo /
  Heebo) with solid system fallbacks for offline use.
- **Mobile polish**: nav breakpoint tuned for the switcher, decorative floating
  phone hidden on the narrowest screens, no horizontal overflow, larger tap
  targets, `viewport-fit=cover`.
- **SEO / shareability**: the *static wrapper* `<head>` (what crawlers and
  WhatsApp/LinkedIn/Slack link-scrapers see without running JS) now has a real
  `<title>`, description, canonical, full Open Graph + Twitter cards, an inline
  SVG favicon, `JSON-LD` (`ProfessionalService`), and `og:locale` alternates for
  ar/he. A branded `og-image.svg` (1200×630) is the share-card source. There's
  also a real `<noscript>` fallback with a contact path.
- **Accessibility**: mobile menu is a proper `role="dialog"` — opens with focus
  moved inside, `Esc` closes it, focus is trapped while open and returned to the
  burger on close; `aria-expanded` reflects state. Muted caption text was
  darkened (`#9a9ea6` → `#6b7077`) to meet WCAG AA contrast.
- **Instagram** wired to [`@webot2026`](https://instagram.com/webot2026) with the
  real Instagram glyph.
- **Lead-capture form → your MongoDB** (replaces WhatsApp): a `#contact` section
  collects **Full name + Country + Phone + Email**. The country picker (62
  countries, flag + dial code) is combined with the number into `phoneFull`.
  Email is validated for a real address (`name@gmail.com`-style) on both client
  and server. It POSTs JSON to `/api/lead`, with inline sending / success / error
  states (no reload). Every "Start a project" button scrolls to it. Honeypot for
  spam. Fully EN/AR/HE + RTL.

## Running it (the form needs the backend)

A browser can't talk to MongoDB directly, so the form posts to a small Node
backend in [`server.js`](server.js) which serves the site **and** handles
`/api/lead`.

```bash
npm install                      # once: installs the mongodb + nodemailer drivers
node --env-file=.env server.js   # then open http://localhost:7777
```

- **Opening `Webot-Daylight.html` directly (file://) shows the site but the form
  can't submit** — there's no server. Use `node server.js` (or host it) for a
  working form.
- Without a `.env`/`MONGODB_URI`, leads are saved to `leads.local.json` so nothing
  is ever lost while you're setting up.

### Connect your MongoDB + email

Copy [`.env.example`](.env.example) → `.env` and fill in:

- `MONGODB_URI` — local (`mongodb://127.0.0.1:27017`) or Atlas
  (`mongodb+srv://…`). Leads are inserted into `DB_NAME.LEADS_COLLECTION`
  (default `webot.leads`). View them in Mongo / Compass / Atlas, or export.
- `GMAIL_USER` + `GMAIL_APP_PASSWORD` (optional) — get an email the moment a lead
  arrives (reply-to is set to the lead, so you reply straight from your inbox).
  Use a Gmail **App Password**, not your normal password. Leave blank to skip.

## SEO, security & legal

- **Per-language URLs**: `/` (en), `/ar`, `/he` — each boots in its language and
  has its own `<title>`/description/canonical, `hreflang` alternates (+`x-default`),
  `og:locale`, and a translated `<noscript>` for non-JS crawlers. The language
  switcher keeps the URL in sync. `build.js` also emits `sitemap.xml` + `robots.txt`.
- **Security** (`server.js`): per-IP rate limiting on `/api/lead` (6 / 10 min →
  `429`), security headers on every response (CSP, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`), configurable
  CORS via `CORS_ORIGIN`.
- **Legal**: `/privacy` and `/terms` pages (linked in the footer). Review/adapt the
  wording for your jurisdiction — they're a solid, honest starting point.

## Deploy to Netlify

Netlify serves the **`preview/`** folder (the same site you see at
`http://localhost:7777`). The other files in this repo (`Webot-Daylight.html`,
`src/`, `build.js`, …) are the source bundle — they are **not** published;
Netlify runs `node build.js` on deploy to regenerate `preview/` from source.

The contact form posts to `/api/lead`. Netlify cannot run `server.js`, so that
route is handled by a **Netlify Function** (`netlify/functions/lead.js`) which
uses the same MongoDB + Gmail logic as local dev.

### One-time setup

1. Push this repo to GitHub (or GitLab / Bitbucket).
2. In [Netlify](https://app.netlify.com/) → **Add new site** → **Import an
   existing project** → connect the repo.
3. Netlify reads `netlify.toml` automatically:
   - **Build command:** `node build.js`
   - **Publish directory:** `preview`
   - **Functions:** `netlify/functions`
4. **Site settings → Environment variables** — add the same values as your
   local `.env`:
   - `MONGODB_URI` (required for production leads)
   - `DB_NAME`, `LEADS_COLLECTION` (optional, defaults shown in `.env.example`)
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_TO` (optional email alerts)
5. Deploy. Your site will be live at `https://<name>.netlify.app` (or your
   custom domain).

### Custom domain

In Netlify → **Domain management**, add `webot.studio` (or your domain) and
follow the DNS steps. Then set `SITE_URL` in `build.js` to that URL and redeploy
so canonical URLs, `hreflang`, and the sitemap stay correct.

### Local vs production

| | Local (`node server.js`) | Netlify |
| --- | --- | --- |
| Site files | `preview/` | `preview/` |
| Lead API | `server.js` → `/api/lead` | Netlify Function → `/api/lead` |
| MongoDB | `.env` | Netlify env vars |
| Rate limit | 6 / 10 min per IP | Not applied (serverless) |

For local preview only, keep using:

```bash
node --env-file=.env server.js   # http://localhost:7777
```

## Before you deploy

Set these, then `node build.js` (Netlify runs this automatically):

- `SITE_URL` in `build.js` (`https://webot.studio/`) → your real domain. This
  drives canonical, `og:url`, `hreflang`, the sitemap and JSON-LD — **important
  for the multilingual SEO to point at real URLs.**
- `OG_IMG` → export `og-image.svg` to **PNG** (1200×630) and host it at that URL
  (link scrapers don't accept SVG).
- Submit `sitemap.xml` to Google Search Console after the site is live.

Still open (your call): analytics (Plausible/GA), per-country phone format
validation, and self-hosting React/Babel (the runtime currently loads them from
the unpkg CDN), plus real testimonials/numbers when you have them.
