(() => {
  const isEbayMessagesPage =
    location.hostname.split('.').includes('ebay') &&
    (location.pathname.startsWith('/cnt/') || location.hostname === 'mesg.ebay.com');

  if (!isEbayMessagesPage) return;

  if (window.__ebayMessageMonitorLoaded) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'FORCE_SCAN') {
        window.__ebayMessageMonitorScan?.().then(sendResponse);
        return true;
      }
      return false;
    });
    return;
  }

  window.__ebayMessageMonitorLoaded = true;

  const SELECTORS = {
    user: [
      '#gh-ug',
      '#gh-ug a',
      '[data-testid="user-name"]',
      '[aria-label*="Hi "]',
      'button[aria-label*="account"]',
      'a[href*="my.ebay.com"]'
    ],
    rows: [
      '[data-testid*="message" i]',
      '[data-testid*="conversation" i]',
      '[data-test-id*="message" i]',
      '[class*="message" i]',
      '[class*="conversation" i]',
      '[role="listitem"]',
      '[role="row"]',
      'li',
      'tr',
      'article'
    ],
    buyer: [
      '[data-testid*="sender" i]',
      '[data-testid*="buyer" i]',
      '[class*="sender" i]',
      '[class*="buyer" i]',
      'h3',
      'h4',
      'strong',
      'b'
    ],
    preview: [
      '[data-testid*="preview" i]',
      '[data-testid*="subject" i]',
      '[class*="preview" i]',
      '[class*="subject" i]',
      '[class*="snippet" i]',
      'p'
    ],
    unread: [
      '[aria-label*="unread" i]',
      '[class*="unread" i]',
      '[class*="badge" i]',
      '[class*="count" i]'
    ]
  };

  let store = null;
  let isActive = !document.hidden;
  const sentFingerprints = new Set();

  const rawText = (node) => (node?.innerText || node?.textContent || '').trim();
  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

  function firstMatch(root, selectors) {
    for (const selector of selectors) {
      const match = root.querySelector(selector);
      if (match && text(match)) return match;
    }
    return null;
  }

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

  function hasUnreadDot(row) {
    const rowRect = row.getBoundingClientRect();
    if (!rowRect.width || !rowRect.height) return false;

    const nodes = row.querySelectorAll('*');
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3 || rect.width > 18 || rect.height > 18) continue;

      const style = window.getComputedStyle(node);
      const color = `${style.backgroundColor} ${style.color} ${style.borderColor}`;
      const looksBlue =
        color.includes('0, 102, 255') ||
        color.includes('0, 100, 210') ||
        color.includes('25, 118, 210') ||
        color.includes('59, 130, 246') ||
        color.includes('rgb(0, 112, 224)');

      if (looksBlue) return true;
    }

    return false;
  }

  function parseUnread(row) {
    const unreadNode = firstMatch(row, SELECTORS.unread);
    const unreadText = text(unreadNode);
    const number = Number((unreadText.match(/\d+/) || [])[0] || 0);
    const rowLooksUnread =
      row.matches?.('[class*="unread" i], [aria-label*="unread" i]') ||
      row.querySelector('[class*="unread" i], [aria-label*="unread" i]') ||
      hasUnreadDot(row);
    return Math.max(number, rowLooksUnread ? 1 : 0);
  }

  function cleanLine(line) {
    return line
      .replace(/^\s*select\s*/i, '')
      .replace(/^\s*unread\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rowLines(row) {
    return rawText(row)
      .split(/\n|(?=[A-Z][a-z]+\d)/)
      .map(cleanLine)
      .filter(Boolean);
  }

  function looksLikeDateLine(line) {
    return /^(just now|today|yesterday|\d+\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)|[a-z]{3,9}\s+\d{1,2}|\d{1,2}\s+[a-z]{3,9})$/i.test(line.trim());
  }

  function looksLikeProductTitle(line) {
    return /\b(free shipping|mini excavator|digger|crawler|engine|epa|attachment|forklift|rated capacity|ton|lbs|hp|gas|diesel|hydraulic|tracked|skid steer)\b/i.test(line);
  }

  function messageFromEmphasis(row, buyer) {
    const emphasized = [...row.querySelectorAll('strong, b, [style*="font-weight"]')]
      .map((node) => cleanLine(rawText(node)))
      .filter((line) => {
        return (
          line.length > 8 &&
          line !== buyer &&
          !looksLikeDateLine(line) &&
          !looksLikeProductTitle(line)
        );
      });

    return emphasized.at(-1) || '';
  }

  function messageFromLines(lines, buyer) {
    const useful = lines.filter((line) => {
      return (
        line &&
        line !== buyer &&
        !looksLikeDateLine(line) &&
        !looksLikeProductTitle(line)
      );
    });

    const conversational = useful.find((line) => {
      return /\b(hi|hello|hey|dear|thanks|thank you|please|could|would|when|what|where|why|how|i('|’)m|i am|we|you|your|sir|madam)\b/i.test(line);
    });

    return conversational || useful.at(-1) || '';
  }

  function isTodayOrYesterday(rowText) {
    const value = rowText.toLowerCase();
    if (/\b(just now|today|yesterday)\b/.test(value)) return true;

    const relativeMatches = [...value.matchAll(/\b(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b/g)];
    if (relativeMatches.some((match) => {
      const amount = Number(match[1]);
      const unit = match[2];
      if (unit.startsWith('m') || unit.startsWith('h')) return true;
      if (unit.startsWith('d')) return amount <= 1;
      return false;
    })) {
      return true;
    }

    const months = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 24 * 60 * 60 * 1000;
    const monthNames = Object.keys(months).join('|');
    const datePatterns = [
      new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})\\b`, 'gi'),
      new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})\\b`, 'gi')
    ];

    for (const pattern of datePatterns) {
      for (const match of value.matchAll(pattern)) {
        const monthName = Number.isNaN(Number(match[1])) ? match[1] : match[2];
        const day = Number.isNaN(Number(match[1])) ? Number(match[2]) : Number(match[1]);
        const date = new Date(now.getFullYear(), months[monthName], day).getTime();
        if (date === today || date === yesterday) return true;
      }
    }

    return false;
  }

  function extractMessageFromRow(row) {
    const rowText = text(row);
    if (!rowText || rowText.length < 8) return null;
    if (/^(Inbox|From members|Unread from members|From eBay|Sent|Deleted|Archive|Folders)$/i.test(rowText)) {
      return null;
    }
    if (!isTodayOrYesterday(rowText)) return null;

    const buyerNode = firstMatch(row, SELECTORS.buyer);
    const previewNode = firstMatch(row, SELECTORS.preview);
    const lines = rowLines(row);
    const buyer = text(buyerNode) || lines[0] || 'Unknown buyer';
    const preview =
      messageFromEmphasis(row, buyer) ||
      messageFromLines(lines, buyer) ||
      text(previewNode) ||
      rowText.replace(buyer, '').trim().slice(0, 240);
    const unreadCount = parseUnread(row);

    if (!buyer || !preview) return null;

    return {
      buyer: buyer.slice(0, 120),
      preview: preview.slice(0, 500),
      unreadCount: Math.max(unreadCount, 1)
    };
  }

  function candidateRows() {
    const rows = new Set();

    SELECTORS.rows.forEach((selector) => {
      document.querySelectorAll(selector).forEach((row) => {
        const value = text(row);
        const rect = row.getBoundingClientRect();
        if (value.length > 12 && value.length < 2500 && rect.width > 180 && rect.height > 28) {
          rows.add(row);
        }
      });
    });

    document.querySelectorAll('strong, b').forEach((bold) => {
      const row = bold.closest('[role="listitem"], [role="row"], li, tr, article, div');
      const value = text(row);
      if (row && value.length > 12 && value.length < 2500) rows.add(row);
    });

    return [...rows].filter((row, index, all) => {
      return !all.some((other, otherIndex) => otherIndex !== index && row.contains(other));
    });
  }

  async function initStore() {
    if (store) return store;
    const storeName = detectStoreName();
    const response = await chrome.runtime.sendMessage({ type: 'STORE_DETECTED', storeName });
    store = {
      storeId: response.storeId,
      storeName: response.storeName || storeName
    };
    return store;
  }

  async function extractMessages() {
    const currentStore = await initStore();
    let sentCount = 0;
    const rows = candidateRows();

    for (const row of rows) {
      const message = extractMessageFromRow(row);
      if (!message) continue;

      const fingerprint = fingerprintFor(currentStore.storeId, message.buyer, message.preview);
      if (sentFingerprints.has(fingerprint)) continue;

      sentFingerprints.add(fingerprint);
      sentCount += 1;
      chrome.runtime.sendMessage({
        type: 'NEW_MESSAGE',
        ...currentStore,
        ...message,
        fingerprint
      });
    }

    if (sentFingerprints.size > 500) {
      const keep = [...sentFingerprints].slice(-250);
      sentFingerprints.clear();
      keep.forEach((value) => sentFingerprints.add(value));
    }

    const result = {
      ok: true,
      candidateCount: rows.length,
      sentCount
    };
    chrome.runtime.sendMessage({ type: 'SCAN_RESULT', ...result }).catch(() => {});
    return result;
  }

  window.__ebayMessageMonitorScan = extractMessages;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'FORCE_SCAN') {
      extractMessages().then(sendResponse);
      return true;
    }
    return false;
  });

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
})();
