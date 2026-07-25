# undrive

A personal cloud file manager built on Cloudflare — a clean, dark-themed drive with a native file-explorer feel. Your files live in your own Cloudflare R2 bucket; the app is just the interface.

## Stack

- **Frontend**: SvelteKit 5 (runes), JavaScript + JSDoc
- **Backend**: Cloudflare Workers / Pages Functions with an R2 binding
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Index**: Cloudflare D1 (SQLite) — file/folder metadata, trash, shares
- **Auth** (optional): Cloudflare Access in front of the deployment

## Features

- Folder navigation over flat R2 keys (`/`-delimited prefixes), grid + list views
- Uploads through the Worker's R2 binding — small files in one request, large files via multipart (8 MB parts). No public S3 endpoint, so no connection resets on big files.
- Downloads stream through the Worker, or redirect to a presigned R2 URL for large files
- Rename / move / copy (server-side R2 copy), drag-and-drop
- Soft delete with trash (`__trash/`) + restore, auto-purge via a daily Cron trigger
- Image viewer with swipe navigation; video/audio player with frame capture
- Client-side image + video thumbnails, cached to R2 (`__thumbs/`) and served directly via the bucket CORS policy
- File search, storage stats, share links
- Mobile-friendly responsive design

## Setup

### Prerequisites

- Node.js 18+
- A Cloudflare account with **R2** and **D1** enabled
- An R2 API token (read/write) for the S3-compatible endpoint

### 1. Install

```sh
npm install
cd worker && npm install && cd ..
```

### 2. Create your Cloudflare resources

```sh
npx wrangler r2 bucket create my-drive
npx wrangler d1 create cloudvault-db      # note the database_id it prints
```

### 3. Point the config at your resources

Edit **both** `wrangler.toml` (root, for Pages) and `worker/wrangler.toml` (for the API worker) and set your own:

- `bucket_name` (R2)
- `database_name` and `database_id` (D1)

### 4. Create the database schema

```sh
cd worker
npx wrangler d1 migrations apply cloudvault-db --remote
cd ..
```

(Skip this and the app returns `no such table: files`.)

### 5. Worker secrets (local dev)

```sh
cd worker
cp .dev.vars.example .dev.vars
# fill in: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, BUCKET_NAME
cd ..
```

For production, set the same as secrets: `npx wrangler pages secret put <NAME>`.

### 6. R2 CORS (required for thumbnails + video)

Edit `cors.json` — set `AllowedOrigins` to your app origin(s) (e.g. `http://localhost:5173` for dev, plus your deployed URL) — then:

```sh
npx wrangler r2 bucket cors set my-drive --file cors.json
```

### 7. Frontend env

```sh
cp .env.example .env.development     # sets VITE_API_URL=http://localhost:8787
```

### 8. Run

```sh
npm run dev        # worker (:8787) + frontend (:5173)
```

Or run the worker on its own with auto-restart: `./dev.sh`. Open **http://localhost:5173**.

## Deploy

Production runs as a **Cloudflare Pages** project — `hooks.server.js` serves the `/api/*` routes as a Pages Function against the same R2/D1 bindings. Build and deploy:

```sh
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare --project-name <your-project>
```

(A manual GitHub Actions workflow is included at `.github/workflows/deploy.yml`.)

## Plugins

undrive has a small extension system so optional features can be added without touching core. Core exposes a registry (`src/lib/extensions/registry.svelte.js`) for **file actions**, **media actions**, and **panels**, plus a backend route list. Drop a plugin under `src/lib/extensions/plugins/` (frontend) and `worker/src/plugins/` (backend), then build with `ENABLE_PLUGINS=1`. With no plugins present the app builds as a plain drive.

## Project structure

```
src/
  lib/
    api/client.js          # Frontend API client
    components/            # Svelte 5 components
    stores/                # Reactive state (files, viewer, ui, …)
    extensions/            # Plugin registry (+ optional plugins)
    utils/                 # Thumbnail + RAW-preview helpers
    mock/                  # Mock data for offline UI dev
  routes/                  # SvelteKit routes
  hooks.server.js          # Serves /api/* in production (Pages Function)
worker/
  src/index.js             # Worker router + CORS (local dev API)
  src/routes/              # API route handlers
  src/lib/s3.js            # Presign helpers (aws4fetch / AWS SDK)
  migrations/              # D1 schema
  wrangler.toml            # Worker config
cors.json                  # R2 bucket CORS policy
scripts/wire-plugins.mjs   # Generates plugin wiring from ENABLE_PLUGINS
```

## R2 conventions

- Folders are simulated with `/`-delimited keys; folder markers are zero-byte objects ending in `/`
- Trash: `__trash/<timestamp>/<original-key>`
- Thumbnails: `__thumbs/<key>.jpg`
