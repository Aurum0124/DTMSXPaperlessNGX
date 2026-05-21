# Installation Guide

This guide covers a local development setup for **Document Tracking X PaperlessNGX**. You need four parts running: **Paperless-ngx**, the Local LLM **Mistral** running in **Ollama**, the **Laravel API**, and the **React frontend**.

| Service | Default URL | Folder |
|---------|-------------|--------|
| Paperless-ngx | http://localhost:8080 | `paperless/` |
| React (Vite) | http://localhost:5173 | `frontend/` |

---

## Prerequisites

- **Docker Desktop** (or Docker Engine) — for Paperless-ngx
- **PHP 8.2+** with extensions: `openssl`, `pdo`, `mbstring`, `tokenizer`, `xml`, `ctype`, `json`, `fileinfo`
- **Composer**
- **Node.js 18+** and **npm**
- **Ollama** and **Mistral**

---

## 1. Clone the repository

```bash
git clone https://github.com/Aurum0124/DTMSXPaperlessNGX.git
cd DTMSXPaperlessNGX
```

## 2. Ollama — AI content suggestions

After a document is uploaded and Paperless has OCR text, the API can suggest metadata from the document body using **Ollama** (`/api/document-summary/{id}`). This is used in the post-upload tracking modal.

| Suggestion | Applied to |
|------------|------------|
| **Titles** (up to 3) | Paperless document title |
| **Document type** | Paperless native document type (matched against types you define in **Admin → Settings → Document types**) |
| **Submitted by / correspondent** (sender or organization) | **Submitted By** custom field (inferred from letter content; OCR also checks `From:` lines). Document list **Correspondent** search uses this same field. |

### Install Ollama

1. Install from [https://ollama.com](https://ollama.com).
2. Pull the model configured in `.env` (default `mistral`):

```bash
ollama pull mistral

---

### 2. Paperless-ngx (Docker)

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
4. Under **Offices**, create department accounts.
5. Sign in as an office user to use **http://localhost:5173/{username}** (e.g. `/pgin-receiving`).
6. Public tracking is at **http://localhost:5173/tracker**.

---

