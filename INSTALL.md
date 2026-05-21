# Installation Guide

This guide covers a local development setup for **Document Tracking X PaperlessNGX**. You need three parts running: **Paperless-ngx**, the **Laravel API**, and the **React frontend**.

| Service | Default URL | Folder |
|---------|-------------|--------|
| Paperless-ngx | http://localhost:8080 | `paperless/` |
| Laravel API | http://localhost:8000 | `backend/` |
| React (Vite) | http://localhost:5173 | `frontend/` |

---

## Prerequisites

- **Docker Desktop** (or Docker Engine) — for Paperless-ngx
- **PHP 8.2+** with extensions: `openssl`, `pdo`, `mbstring`, `tokenizer`, `xml`, `ctype`, `json`, `fileinfo`
- **Composer**
- **Node.js 18+** and **npm**

---

## 1. Clone the repository

```bash
git clone https://github.com/Aurum0124/DTMSXPaperlessNGX.git
cd DTMSXPaperlessNGX
```

---

## 2. Paperless-ngx (Docker)

```bash
cd paperless
docker compose up -d
```

Wait until Paperless is ready, then open **http://localhost:8080** and complete the first-run wizard (admin user for Paperless).

### Create an API token

1. In Paperless, go to **Settings → Users & Groups**.
2. Open your user → **API tokens** → create a token.
3. Copy the token — you will use it in both `backend/.env` and `frontend/.env.local`.

> `paperless/data/` and `paperless/media/` are local runtime data and are not committed to git.

---

## 3. Backend (Laravel)

```bash
cd backend
cp .env.example .env
composer install
php artisan key:generate
php artisan migrate
php artisan db:seed
php artisan serve
```

The API should be available at **http://localhost:8000**.

### Configure `backend/.env`

| Variable | Description |
|----------|-------------|
| `PAPERLESS_URL` | Paperless base URL (default `http://localhost:8080`) |
| `PAPERLESS_TOKEN` | API token from Paperless |

Optional (title suggestions):

| Variable | Description |
|----------|-------------|
| `TITLE_SUGGESTION_MODE` | `llm_with_ocr_fallback` (default), `ocr`, or `llm` |
| `OLLAMA_URL` | Ollama endpoint (default `http://localhost:11434`) |
| `OLLAMA_MODEL` | Model name (default `mistral`) |

### Database

The default `.env.example` uses **SQLite** (`DB_CONNECTION=sqlite`). Migrations create the database file automatically.

For **MySQL** or **PostgreSQL**, update `DB_*` in `.env` before running `php artisan migrate`.

### Default admin account (DTS)

After seeding:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin` |

Change this password after first login.

---

## 4. Frontend (React + Vite)

Open a **new terminal**:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The app should be available at **http://localhost:5173**.

### Configure `frontend/.env.local`

| Variable | Description |
|----------|-------------|
| `VITE_PAPERLESS_API_TOKEN` | Paperless API token (same as or compatible with backend token) |

### API proxy

In development, Vite proxies requests:

- Laravel routes (`/api/auth`, `/api/transfers`, `/api/admin`, etc.) → `http://localhost:8000`
- Other `/api` calls → Paperless at `http://localhost:8080`

See `frontend/vite.config.js` for the full proxy list.

---

## 5. First-time application setup

1. Sign in at **http://localhost:5173/login** with `admin` / `admin`.
2. You are redirected to **Admin** (`/admin`).
3. Open **Settings** and configure Paperless custom fields (tracking code, status, archiving, etc.).
4. Under **Offices**, create department accounts and link them to Paperless tags.
5. Sign in as an office user to use **http://localhost:5173/{username}** (e.g. `/pgin-receiving`).
6. Public tracking is at **http://localhost:5173/tracker**.

---

## 6. Production build (optional)

### Frontend

```bash
cd frontend
npm run build
```

Serve the `frontend/dist/` folder with your web server. Ensure API proxy rules or equivalent reverse-proxy config point to Laravel and Paperless.

### Backend

- Set `APP_ENV=production` and `APP_DEBUG=false` in `.env`.
- Run `php artisan config:cache` and `php artisan route:cache`.
- Use a proper web server (nginx, Apache, or Laravel Octane) instead of `php artisan serve`.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Cannot connect to Paperless | `docker compose ps` in `paperless/`; port `8080` free |
| 401 / empty documents | `PAPERLESS_TOKEN` and `VITE_PAPERLESS_API_TOKEN` set and valid |
| Laravel errors on login | `php artisan migrate`; SQLite file writable in `backend/database/` |
| Frontend cannot reach API | Laravel running on port `8000`; Vite dev server on `5173` |
| Thumbnails / previews fail | `PAPERLESS_URL` and `PAPERLESS_TOKEN` in `backend/.env` |

---

## Quick start checklist

- [ ] `docker compose up -d` in `paperless/`
- [ ] Paperless API token created
- [ ] `backend/.env` configured; `migrate` + `db:seed` done
- [ ] `php artisan serve` running
- [ ] `frontend/.env.local` configured
- [ ] `npm run dev` running
- [ ] Admin signed in; offices and custom fields configured

For feature overview and screenshots, see [README.md](README.md).
