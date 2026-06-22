const storeName = document.querySelector('#storeName');
const unreadCount = document.querySelector('#unreadCount');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');
const wsUrl = document.querySelector('#wsUrl');
const wsHint = document.querySelector('#wsHint');
const diag = document.querySelector('#diag');
const storeNameInput = document.querySelector('#storeNameInput');
const storeHint = document.querySelector('#storeHint');
const DEFAULT_WS_URL = 'wss://ebay-message-monitor-backend.onrender.com';

function isValidWsUrl(value) {
  return value.startsWith('ws://') || value.startsWith('wss://');
}

function setHint(message, isError = false) {
  wsHint.textContent = message;
  wsHint.classList.toggle('error', isError);
}

function setStoreHint(message, isError = false) {
  storeHint.textContent = message;
  storeHint.classList.toggle('error', isError);
}

function render(state) {
  const name = state.storeName || 'Unknown eBay Store';
  storeName.textContent = name;
  storeNameInput.value = name === 'Open eBay messages' ? '' : name;
  unreadCount.textContent = String(state.lastScanSentCount ?? state.unreadCount ?? 0);
  statusText.textContent = state.status || 'disconnected';
  wsUrl.value = state.wsUrl || DEFAULT_WS_URL;
  statusDot.classList.toggle('connected', state.status === 'connected');
  setHint('Use the WebSocket backend URL, not your eBay inbox link.');
  setStoreHint('This name appears in the dashboard.');
  const scanText = state.lastScanAt
    ? `Scanner: active · rows ${state.lastScanCandidateCount || 0} · sent ${state.lastScanSentCount || 0}`
    : 'Scanner: waiting for eBay page';
  diag.textContent = scanText;
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_POPUP_STATE' });
  render(state || {});
}

chrome.runtime.sendMessage({ type: 'RECONNECT_NOW' }).catch(() => {});

document.querySelector('#openDashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
});

document.querySelector('#saveStoreName').addEventListener('click', async () => {
  const nextName = storeNameInput.value.trim();
  if (!nextName) {
    setStoreHint('Enter a store name first.', true);
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'SET_STORE_NAME', storeName: nextName });
  if (!response?.ok) {
    setStoreHint('Could not save store name.', true);
    return;
  }

  storeName.textContent = response.storeName || nextName;
  storeNameInput.value = response.storeName || nextName;
  setStoreHint('Saved. Refresh dashboard if the old name is still visible.');
});

document.querySelector('#saveWs').addEventListener('click', async () => {
  const nextUrl = wsUrl.value.trim();
  if (!isValidWsUrl(nextUrl)) {
    setHint(`That is a web page URL. Set this to ${DEFAULT_WS_URL}.`, true);
    wsUrl.value = DEFAULT_WS_URL;
    await chrome.runtime.sendMessage({ type: 'RESET_WS_URL' });
    refresh();
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'SET_WS_URL', wsUrl: nextUrl });
  wsUrl.value = response.wsUrl || nextUrl;
  setHint('Saved. The extension will connect to this backend.');
  refresh();
});

document.querySelector('#resetWs').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'RESET_WS_URL' });
  wsUrl.value = response.wsUrl || DEFAULT_WS_URL;
  setHint('Reset to the deployed backend.');
  refresh();
});

document.querySelector('#scanPage').addEventListener('click', async () => {
  diag.textContent = 'Scanner: scanning active tab...';
  const response = await chrome.runtime.sendMessage({ type: 'FORCE_SCAN_ACTIVE_TAB' });
  if (!response?.ok) {
    diag.textContent = `Scanner: ${response?.reason || 'scan failed'}`;
    return;
  }
  diag.textContent = `Scanner: active · rows ${response.candidateCount || 0} · sent ${response.sentCount || 0}`;
  refresh();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_CHANGED') refresh();
});

refresh();
