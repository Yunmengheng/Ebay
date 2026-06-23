# eBay Message Monitor Pro

Production-ready local monitoring for multiple eBay inboxes without the eBay API.

The system has three parts:

- `chrome-extension`: Manifest V3 extension loaded once per Chrome profile/store.
- `backend`: Node.js WebSocket/HTTP server that persists events to Neon Postgres and broadcasts live updates.
- `dashboard`: Next.js 14 App Router dashboard with backend WebSocket live updates.

## 1. Neon Setup

Create a Neon project and copy the pooled Postgres connection string. The backend creates these tables automatically at startup:

- `stores`
- `messages`

## 2. Environment

Dashboard:

```bash
cd ebay-monitor/dashboard
cp .env.local.example .env.local
```

Backend:

```bash
cd ebay-monitor/backend
cp .env.example .env
```

Set `DATABASE_URL` in `backend/.env` to your Neon pooled connection string, for example:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
```

## 3. Install

```bash
cd ebay-monitor/dashboard
npm install

cd ../backend
npm install
```

## 4. Run Locally

Terminal 1:

```bash
cd ebay-monitor/backend
npm run dev
```

Terminal 2:

```bash
cd ebay-monitor/dashboard
npm run dev
```

Open `http://localhost:3000/dashboard`.

## 5. Load the Chrome Extension

1. Open Chrome with the profile for one eBay store.
2. Go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `ebay-monitor/chrome-extension`.
6. Open `https://mesg.ebay.com/`.

Repeat for each Chrome profile/store. Each profile receives a persisted UUID in `chrome.storage.local`, so multiple stores can report to the same backend.

## Notes

- This project does not use the eBay API.
- Message detection uses `MutationObserver` plus a 5-second polling fallback.
- Store heartbeat is sent every 30 seconds.
- Duplicate messages are filtered by the unique `fingerprint` column.
- Dashboard updates arrive through the backend WebSocket. The dashboard does not subscribe to database realtime feeds.
