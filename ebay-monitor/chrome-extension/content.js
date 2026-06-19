const SELECTORS = {
  user: [
    '#gh-ug',
    '[data-testid="user-name"]',
    '[aria-label*="Hi "]',
    'button[aria-label*="account"]',
    'a[href*="my.ebay.com"]'
  ],
  rows: [
    '[data-testid*="message"]',
    '[class*="message"] li',
    '[class*="conversation"]',
    '[role="listitem"]',
    'li'
  ],
  buyer: [
    '[data-testid*="sender"]',
    '[class*="sender"]',
    '[class*="buyer"]',
    'h3',
    'h4',
    'strong'
  ],
  preview: [
    '[data-testid*="preview"]',
    '[class*="preview"]',
    '[class*="subject"]',
    '[class*="snippet"]',
    'p'
  ],
  unread: [
    '[aria-label*="unread"]',
    '[class*="unread"]',
    '[class*="badge"]',
    '[class*="count"]'
  ]
};

let store = null;
let isActive = !document.hidden;
const sentFingerprints = new Set();

const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const firstMatch = (root, selectors) => {
  for (const selector of selectors) {
    const match = root.querySelector(selector);
    if (match && text(match)) return match;
  }
  return null;
};

function detectStoreName() {
  for (const selector of SELECTORS.user) {
    const node = document.querySelector(selector);
    const value = text(node)
      .replace(/^Hi[,\s]*/i, '')
      .replace(/!$/, '')
      .trim();
    if (value && value.length <= 80) return value;
  }

  const saved = window.localStorage.getItem('ebay-monitor-store-name');
  if (saved) return saved;

  const fallback = prompt('Enter this eBay store/profile name for Message Monitor Pro:');
  const name = fallback?.trim() || 'Unknown eBay Store';
  window.localStorage.setItem('ebay-monitor-store-name', name);
  return name;
}

function fingerprintFor(storeId, buyer, preview) {
  return btoa(unescape(encodeURIComponent(`${storeId}:${buyer}:${preview}`)));
}

function parseUnread(row) {
  const unreadNode = firstMatch(row, SELECTORS.unread);
  const unreadText = text(unreadNode);
  const number = Number((unreadText.match(/\d+/) || [])[0] || 0);
  const rowLooksUnread =
    row.matches?.('[class*="unread"], [aria-label*="unread"]') ||
    row.querySelector('[class*="unread"], [aria-label*="unread"]');
  return Math.max(number, rowLooksUnread ? 1 : 0);
}

function extractMessageFromRow(row) {
  const rowText = text(row);
  if (!rowText || rowText.length < 4) return null;

  const buyer = text(firstMatch(row, SELECTORS.buyer)) || rowText.split(' ').slice(0, 3).join(' ');
  const preview =
    text(firstMatch(row, SELECTORS.preview)) ||
    rowText.replace(buyer, '').trim().slice(0, 240);
  const unreadCount = parseUnread(row);

  if (!buyer || !preview || unreadCount < 1) return null;
  return { buyer: buyer.slice(0, 120), preview: preview.slice(0, 500), unreadCount };
}

function candidateRows() {
  const rows = new Set();
  SELECTORS.rows.forEach((selector) => {
    document.querySelectorAll(selector).forEach((row) => {
      const value = text(row);
      if (value.length > 8 && value.length < 2000) rows.add(row);
    });
  });
  return [...rows];
}

async function initStore() {
  const storeName = detectStoreName();
  const response = await chrome.runtime.sendMessage({ type: 'STORE_DETECTED', storeName });
  store = {
    storeId: response.storeId,
    storeName: response.storeName || storeName
  };
}

async function extractMessages() {
  if (!store) await initStore();

  for (const row of candidateRows()) {
    const message = extractMessageFromRow(row);
    if (!message) continue;

    const fingerprint = fingerprintFor(store.storeId, message.buyer, message.preview);
    if (sentFingerprints.has(fingerprint)) continue;

    sentFingerprints.add(fingerprint);
    chrome.runtime.sendMessage({
      type: 'NEW_MESSAGE',
      ...store,
      ...message,
      fingerprint
    });
  }

  if (sentFingerprints.size > 500) {
    const keep = [...sentFingerprints].slice(-250);
    sentFingerprints.clear();
    keep.forEach((value) => sentFingerprints.add(value));
  }
}

document.addEventListener('visibilitychange', () => {
  isActive = !document.hidden;
});
window.addEventListener('focus', () => {
  isActive = true;
});
window.addEventListener('blur', () => {
  isActive = false;
});

const observer = new MutationObserver(() => {
  extractMessages();
});

initStore().then(() => {
  observer.observe(document.body, { childList: true, subtree: true });
  extractMessages();
  setInterval(extractMessages, 5000);
  setInterval(() => {
    if (!isActive) location.reload();
  }, 10000);
});

