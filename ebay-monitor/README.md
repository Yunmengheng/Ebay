# eBay Message Monitor Pro

Local live monitoring for multiple eBay inboxes without the eBay API or a database.

The system has three parts:

- `chrome-extension`: Manifest V3 extension loaded once per Chrome profile/store.
- `backend`: Node.js WebSocket/HTTP server that keeps live stores/messages in memory and broadcasts updates.
- `dashboard`: Next.js 14 App Router dashboard with backend WebSocket live updates.

## 1. Environment

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

The backend does not need `DATABASE_URL`, Supabase keys, or Neon settings. Data is live-only and clears when the backend restarts.

## 2. Install

```bash
cd ebay-monitor/dashboard
npm install

cd ../backend
npm install
```

You can also run `npm install` from the `ebay-monitor` root because the project uses npm workspaces.

## 3. Run Locally

From the `ebay-monitor` root:

```bash
npm run dev
```

Or run the services separately:

```bash
cd ebay-monitor/backend
npm run dev

cd ../dashboard
npm run dev
```

Open `http://localhost:3000/dashboard`.

## 4. Load the Chrome Extension

1. Open Chrome with the profile for one eBay store.
2. Go to `chrome://extensions`.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `ebay-monitor/chrome-extension`.
6. Open `https://mesg.ebay.com/`.

Repeat for each Chrome profile/store. Each profile receives a persisted UUID in `chrome.storage.local`, so multiple stores can report to the same backend.

## Notes

- This project does not use the eBay API.
- This project does not store messages in Supabase, Neon, MongoDB, or any other database.
- Message detection uses `MutationObserver` plus a 5-second polling fallback.
- Store heartbeat is sent every 30 seconds.
- Duplicate messages are filtered in backend memory by message fingerprint.
- Read/unread, urgent, note, and delete actions are shared through the backend while it is running.
- Restarting the backend clears the live message/store history.
