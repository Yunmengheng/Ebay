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

  function isRowUnread(row) {
    // 1. aria / class "unread" markers — most explicit signal.
    if (
      row.matches?.('[class*="unread" i], [aria-label*="unread" i]') ||
      row.querySelector('[class*="unread" i], [aria-label*="unread" i]')
    ) return true;

    // 2. Font-weight on the buyer/sender node specifically.
    //    In eBay's new UI the buyer name is bold (700) when unread, normal (400) when read.
    //    We skip generic `strong` and `b` since those are always bold by default.
    const specificBuyerSelectors = [
      '[data-testid*="sender" i]',
      '[data-testid*="buyer" i]',
      '[class*="sender" i]',
      '[class*="buyer" i]',
      'h3',
      'h4'
    ];
    for (const sel of specificBuyerSelectors) {
      const node = row.querySelector(sel);
      if (node) {
        const fw = parseInt(window.getComputedStyle(node).fontWeight, 10);
        // Bold = unread, normal/light = read
        return fw >= 600;
      }
    }

    // 3. Fallback: check font-weight of the very first non-empty inline text node
    //    that is a direct child span/p of the row (not a nested container).
    //    This avoids scanning every element and hitting icon/button elements.
    for (const el of row.children) {
      const t = (el.textContent || '').trim();
      if (t.length > 2) {
        const fw = parseInt(window.getComputedStyle(el).fontWeight, 10);
        return fw >= 600;
      }
    }

    return false;
  }

  function parseUnread(row) {
    const unreadNode = firstMatch(row, SELECTORS.unread);
    const unreadText = text(unreadNode);
    const number = Number((unreadText.match(/\d+/) || [])[0] || 0);
    const rowUnread = isRowUnread(row);
    // DEBUG — open eBay DevTools console (F12) to see what is detected
    console.log('[EbayMonitor] isRowUnread:', rowUnread, '| row text snippet:', text(row).slice(0, 80));
    return Math.max(number, rowUnread ? 1 : 0);
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

  function extractMessagePreview(lines, buyer) {
    const useful = lines.filter((line) => {
      return (
        line &&
        line.toLowerCase() !== buyer.toLowerCase() &&
        !looksLikeDateLine(line)
      );
    });

    if (useful.length === 0) return '';
    const lastLine = useful[useful.length - 1];
    // Clean up reply indicators (like ↶ or ↷) at the beginning of the message
    return lastLine.replace(/^[↶↷]\s*/, '').trim();
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

    // Skip pure navigation/folder rows (exact matches only)
    if (/^(Inbox|From members|Unread from members|From eBay|Sent|Deleted|Archive|Folders|My Folder \d*|Get-back client|Create folder)$/i.test(rowText.trim())) {
      return null;
    }

    const buyerNode = firstMatch(row, SELECTORS.buyer);
    const lines = rowLines(row);
    const buyer = text(buyerNode) || lines[0] || '';
    if (!buyer || buyer.length < 2) return null;

    const preview = extractMessagePreview(lines, buyer) || rowText.replace(buyer, '').trim().slice(0, 240);
    if (!preview || preview.length < 2) return null;

    const unreadCount = parseUnread(row);

    return {
      buyer: buyer.slice(0, 120),
      preview: preview.slice(0, 500),
      unreadCount
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

    for (let i = 0; i < rows.length; i++) {
      const message = extractMessageFromRow(rows[i]);
      if (message) {
        const fingerprint = fingerprintFor(currentStore.storeId, message.buyer, message.preview);
        const cacheKey = `${fingerprint}:${message.unreadCount}`;
        if (!sentFingerprints.has(cacheKey)) {
          const oppositeCount = message.unreadCount > 0 ? 0 : 1;
          sentFingerprints.delete(`${fingerprint}:${oppositeCount}`);

          sentFingerprints.add(cacheKey);
          sentCount += 1;
          chrome.runtime.sendMessage({
            type: 'NEW_MESSAGE',
            ...currentStore,
            ...message,
            fingerprint: fingerprint
          });
        }
      }
    }

    if (sentFingerprints.size > 1000) {
      const keep = [...sentFingerprints].slice(-500);
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

  const observer = new MutationObserver(() => {
    extractMessages();
  });

  initStore().then(() => {
    observer.observe(document.body, { childList: true, subtree: true });
    extractMessages();
    setInterval(extractMessages, 5000);
    // Only reload when the tab is truly hidden (user switched away), not on blur
    setInterval(() => {
      if (document.hidden) location.reload();
    }, 10000);
  });
})();
