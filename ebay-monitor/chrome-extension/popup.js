const storeName = document.querySelector('#storeName');
const unreadCount = document.querySelector('#unreadCount');
const statusText = document.querySelector('#statusText');
const statusDot = document.querySelector('#statusDot');
const wsUrl = document.querySelector('#wsUrl');

function render(state) {
  storeName.textContent = state.storeName || 'Open eBay messages';
  unreadCount.textContent = String(state.unreadCount || 0);
  statusText.textContent = state.status || 'disconnected';
  wsUrl.value = state.wsUrl || 'ws://localhost:3001';
  statusDot.classList.toggle('connected', state.status === 'connected');
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_POPUP_STATE' });
  render(state || {});
}

document.querySelector('#openDashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
});

document.querySelector('#saveWs').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SET_WS_URL', wsUrl: wsUrl.value.trim() });
  refresh();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_CHANGED') refresh();
});

refresh();

