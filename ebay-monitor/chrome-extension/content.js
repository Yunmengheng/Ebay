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
    ]
  };

  let store = null;
  const sentFingerprints = new Set();

  const rawText = (node) => (node?.innerText || node?.textContent || '').trim();
  const text = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();

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

  function fingerprintFor(storeId, buyer, subject = '') {
    const cleanSubject = (subject || '').trim().toLowerCase();
    return btoa(unescape(encodeURIComponent(`${storeId}:${buyer}:${cleanSubject}`)));
  }

  /**
   * Parse eBay relative time strings like "3h", "1d", "50m", "just now"
   * into a unix timestamp (ms). Returns null if parsing fails.
   */
  function parseEbayRelativeTime(rawText) {
    const t = (rawText || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!t || t.length > 30) return null;

    const now = Date.now();

    if (/^(just now|now|<\s*1\s*(m|min)|0\s*(m|min))$/.test(t)) return now;
    if (t === 'today') return now;
    if (t === 'yesterday') return now - 86400000;

    // Time of day: "10:30 AM", "2:15 PM", "10:30", "14:20" etc.
    const timeM = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/);
    if (timeM) {
      const [, hrsStr, minsStr, ampm] = timeM;
      let hrs = parseInt(hrsStr, 10);
      const mins = parseInt(minsStr, 10);
      if (ampm === 'pm' && hrs < 12) hrs += 12;
      if (ampm === 'am' && hrs === 12) hrs = 0;
      
      const d = new Date();
      d.setHours(hrs, mins, 0, 0);
      if (d.getTime() > now) {
        d.setDate(d.getDate() - 1);
      }
      return d.getTime();
    }

    // Relative: "3h", "10h", "1d", "50m", "2w", "1 hr", "3 days" etc.
    const rel = t.match(/^(\d+)\s*(s|sec|m|min|h|hr|d|day|w|wk|week)s?$/);
    if (rel) {
      const num = parseInt(rel[1], 10);
      const unit = rel[2][0]; // s, m, h, d, w
      const msMap = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 };
      return now - num * (msMap[unit] || 0);
    }

    // Absolute: "Jun 14", "14 Jun", "Jun 14, 2025", "14 Jun 25" etc.
    const monthNames = {
      jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
    };
    const absM = t.match(/^([a-z]{3,9})\s+(\d{1,2})(?:,?\s+(\d{2,4}))?$/) || t.match(/^(\d{1,2})\s+([a-z]{3,9})(?:,?\s+(\d{2,4}))?$/);
    if (absM) {
      const [, a, b, yearStr] = absM;
      const monthKey = (isNaN(Number(a)) ? a : b).slice(0, 3);
      const day = isNaN(Number(a)) ? Number(b) : Number(a);
      const monthIdx = monthNames[monthKey];
      if (monthIdx !== undefined) {
        let year = new Date().getFullYear();
        if (yearStr) {
          const parsedYear = parseInt(yearStr, 10);
          if (yearStr.length === 2) {
            year = 2000 + parsedYear;
          } else {
            year = parsedYear;
          }
        }
        const d = new Date(year, monthIdx, day, 12, 0, 0);
        return d.getTime();
      }
    }

    return null;
  }

  /**
   * Extract the eBay send-time from a row. Returns a ms timestamp.
   * Falls back to (now - rowIndex * 1s) so DOM order is preserved.
   */
  function extractEbayTimestamp(row, rowIndex) {
    // 1. Try <time datetime="…"> — most reliable
    const timeEl = row.querySelector('time[datetime]');
    if (timeEl) {
      const dt = timeEl.getAttribute('datetime');
      const d = new Date(dt || '');
      if (!isNaN(d.getTime())) return d.getTime();
    }

    // 2. Try data-timestamp / data-date attributes anywhere in row
    const attrEl = row.querySelector('[data-timestamp], [data-date], [data-time]');
    if (attrEl) {
      const val = attrEl.dataset.timestamp || attrEl.dataset.date || attrEl.dataset.time || '';
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.getTime();
    }

    // 3. Scan all leaf nodes (no children) in REVERSE order — eBay timestamp is last
    const allEls = [...row.querySelectorAll('*')].reverse();
    for (const el of allEls) {
      if (el.children.length > 0) continue; // leaf only
      const txt = (el.textContent || '').trim();
      if (txt.length < 1 || txt.length > 15) continue;
      const parsed = parseEbayRelativeTime(txt);
      if (parsed !== null) return parsed;
    }

    // 4. Fallback: preserve DOM order using 1-second spacing (so row 0 > row 1 > row 2...)
    //    Use a large base offset to distinguish from "real" timestamps
    return Date.now() - rowIndex * 1000;
  }

  function isRowUnread(row) {
    // 1. aria / class "unread" markers — most explicit signal.
    if (
      row.matches?.('[class*="unread" i], [aria-label*="unread" i]') ||
      row.querySelector('[class*="unread" i], [aria-label*="unread" i]')
    ) return true;

    // 2. Font-weight on the buyer/sender node specifically.
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
        return fw >= 600;
      }
    }

    // 3. Fallback: check first non-empty child element's font weight
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
    // 1. Try to find a badge or count element specifically.
    // Usually these are small elements with just a number.
    const countNodes = row.querySelectorAll('[class*="count" i], [class*="badge" i], [class*="unread" i]');
    for (const node of countNodes) {
      if (node === row) continue;
      const tagName = node.tagName.toLowerCase();
      if (tagName === 'button' || tagName === 'tr' || tagName === 'li') {
        continue;
      }
      const txt = text(node).trim();
      if (txt.length > 0 && txt.length <= 8) {
        const num = Number((txt.match(/\d+/) || [])[0]);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    
    // 2. If no specific numeric badge is found, just use the boolean unread status (1 or 0)
    const rowUnread = isRowUnread(row);
    return rowUnread ? 1 : 0;
  }

  function looksLikeDateLine(line) {
    return /^(just now|today|yesterday|\d+\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)|[a-z]{3,9}\s+\d{1,2}|\d{1,2}\s+[a-z]{3,9})$/i.test(line.trim());
  }

  function getRowTextFragments(row) {
    const fragments = [];
    const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        let parent = node.parentElement;
        while (parent && parent !== row) {
          if (parent.classList) {
            if (
              parent.classList.contains('sr-only') ||
              parent.classList.contains('clipped')
            ) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          parent = parent.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    }, false);
    let node;
    while (node = walk.nextNode()) {
      const txt = node.textContent.trim().replace(/\s+/g, ' ');
      if (txt && !fragments.includes(txt)) {
        fragments.push(txt);
      }
    }
    return fragments;
  }

  /**
   * System/navigation labels that should never be treated as buyer names
   */
  const SYSTEM_LABELS = /^(Inbox|From members|Unread from members|From eBay|Unread from eBay|Sent|Deleted|Archive|Archived|Folders|Get-back client|Create folder|Select all|Mark as read|Mark as unread|Move to|Select|Unread|Read|eBay)$/i;

  function extractMessageFromRow(row) {
    const rawFragments = getRowTextFragments(row);
    
    // Clean up fragments
    const cleanFragments = rawFragments.filter(f => {
      const lf = f.toLowerCase();
      return (
        f.length >= 2 &&
        lf !== 'select' &&
        lf !== 'unread' &&
        lf !== 'read' &&
        !/^edit\d+\/\d+$/.test(lf) &&
        !SYSTEM_LABELS.test(f.trim())
      );
    });

    if (cleanFragments.length < 2) return null;

    // Find and remove time/date fragment (search from end)
    let timeIdx = -1;
    let ebayTimeStr = '';
    for (let i = cleanFragments.length - 1; i >= 0; i--) {
      if (parseEbayRelativeTime(cleanFragments[i]) !== null || looksLikeDateLine(cleanFragments[i])) {
        timeIdx = i;
        ebayTimeStr = cleanFragments[i];
        break;
      }
    }

    if (timeIdx !== -1) {
      cleanFragments.splice(timeIdx, 1);
    }

    if (cleanFragments.length < 1) return null;

    // Buyer is the first remaining fragment
    const buyer = cleanFragments[0];
    cleanFragments.shift();

    if (!buyer || buyer.length < 2) return null;
    if (SYSTEM_LABELS.test(buyer.trim())) return null;

    let subject = '';
    let preview = '';

    if (cleanFragments.length === 0) {
      // Only buyer found, no preview — use empty string
      preview = '';
    } else if (cleanFragments.length === 1) {
      // Could be subject OR preview — treat as preview (message text)
      preview = cleanFragments[0];
    } else {
      // First = subject, rest = preview body
      subject = cleanFragments[0];
      preview = cleanFragments.slice(1).join(' ');
    }

    // Clean up reply indicators
    preview = preview.replace(/^[↶↷]\s*/, '').trim();
    subject = subject.replace(/^[↶↷]\s*/, '').trim();

    const unreadCount = parseUnread(row);

    return {
      buyer: buyer.slice(0, 120),
      subject: subject.slice(0, 200),
      preview: preview.slice(0, 500),
      unreadCount,
      ebayTimeStr
    };
  }

  /**
   * Find all message rows in the inbox.
   * Strategy: look for rows that contain a timestamp AND at least 2 other text fragments.
   * We use multiple approaches to find rows and deduplicate by DOM node.
   */
  function candidateRows() {
    const rowSet = new Set();

    // Strategy 1: checkbox-anchored rows (reliable when eBay has checkboxes)
    const checkboxElements = document.querySelectorAll('input[type="checkbox"], [role="checkbox"]');
    for (const cb of checkboxElements) {
      const row = findRowAncestor(cb);
      if (!row) continue;
      const textVal = (row.textContent || '').trim();
      if (textVal.includes('Select all') || textVal.includes('Mark as read')) continue;
      rowSet.add(row);
    }

    // Strategy 2: Scan for common eBay message-row containers
    // eBay typically uses li elements or specific container divs in the message list
    const containerSelectors = [
      '[data-testid*="message" i]',
      '[data-testid*="conversation" i]',
      '[data-test-id*="message" i]',
      '[class*="message-item" i]',
      '[class*="msg-item" i]',
      '[class*="conversation-item" i]',
      'li[class*="message" i]',
      'li[class*="conversation" i]'
    ];
    for (const sel of containerSelectors) {
      document.querySelectorAll(sel).forEach(el => rowSet.add(el));
    }

    // Filter: only keep rows that have a parseable timestamp AND a plausible buyer name
    const candidates = [];
    for (const row of rowSet) {
      const fragments = getRowTextFragments(row);
      const hasTime = fragments.some(f => parseEbayRelativeTime(f) !== null || looksLikeDateLine(f));
      if (!hasTime) continue;

      // Must have at least 2 non-time fragments (buyer + preview/subject)
      const nonTimeFrags = fragments.filter(f => {
        const lf = f.toLowerCase();
        return (
          f.length >= 2 &&
          parseEbayRelativeTime(f) === null &&
          !looksLikeDateLine(f) &&
          lf !== 'select' &&
          lf !== 'unread' &&
          lf !== 'read'
        );
      });
      if (nonTimeFrags.length < 1) continue;

      candidates.push(row);
    }

    // If checkbox strategy found nothing, fall back to a broader DOM search:
    // Look for list items that contain time fragments inside the main message container
    if (candidates.length === 0) {
      // Broad scan: any li, article, or role=listitem/row that has a timestamp
      const broadCandidates = document.querySelectorAll('li, article, [role="listitem"], [role="row"]');
      for (const el of broadCandidates) {
        // Skip elements that are too tall (likely outer containers) or too small
        const rect = el.getBoundingClientRect();
        if (rect.height < 30 || rect.height > 200) continue;
        if (rect.width < 200) continue;

        const fragments = getRowTextFragments(el);
        const hasTime = fragments.some(f => parseEbayRelativeTime(f) !== null || looksLikeDateLine(f));
        if (!hasTime) continue;

        const textVal = (el.textContent || '').trim();
        if (textVal.includes('Select all') || textVal.includes('Mark as read')) continue;
        if (SYSTEM_LABELS.test(textVal.trim())) continue;

        candidates.push(el);
      }
    }

    // Deduplicate: remove any element that is an ancestor of another in the set
    // This prevents double-counting nested rows
    const deduplicated = candidates.filter(el =>
      !candidates.some(other => other !== el && el.contains(other))
    );

    // Return in DOM order (matches eBay's visual top-to-bottom order)
    return deduplicated.sort((a, b) => {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function findRowAncestor(el) {
    let parent = el.parentElement;
    while (parent) {
      const tag = parent.tagName.toLowerCase();
      const role = parent.getAttribute('role');
      const cls = parent.className || '';
      
      if (
        tag === 'li' || 
        tag === 'tr' || 
        tag === 'article' || 
        role === 'listitem' || 
        role === 'row' || 
        /message|conversation/i.test(cls)
      ) {
        return parent;
      }
      
      if (tag === 'div') {
        const rect = parent.getBoundingClientRect();
        if (rect.width > 180 && rect.height > 28) {
          const outer = parent.closest('li, tr, [role="listitem"], [role="row"]');
          return outer || parent;
        }
      }
      
      parent = parent.parentElement;
    }
    return null;
  }

  function isInboxSelected() {
    const path = location.pathname.toLowerCase();
    const search = location.search.toLowerCase();

    // 1. Check path/search for non-inbox folders
    const nonInboxPaths = ['/sent', '/archive', '/deleted', '/trash', '/draft'];
    if (nonInboxPaths.some(p => path.includes(p))) {
      return false;
    }

    if (search.includes('folder=') && !search.includes('folder=inbox')) {
      return false;
    }

    // 2. Scan sidebar list items or links to see if a non-inbox folder is marked active/selected
    const activeElements = document.querySelectorAll(
      '[aria-current="page"], [aria-selected="true"], .active, .selected, [class*="active" i], [class*="selected" i]'
    );

    const nonInboxKeywords = [
      'sent', 'archive', 'deleted', 'trash', 'draft',
      'notification'
    ];

    for (const el of activeElements) {
      const textVal = (el.textContent || '').trim().toLowerCase();
      // Ignore large container elements that just happen to have an active class
      if (textVal.length > 40) continue;

      // If the selected element text indicates a non-inbox folder, return false
      if (nonInboxKeywords.some(k => textVal.includes(k))) {
        return false;
      }

      if (textVal.includes('ebay') && !textVal.includes('inbox')) {
        return false;
      }
    }

    return true;
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

    if (!isInboxSelected()) {
      console.log('[EbayMonitor] Skipping scan because a non-Inbox folder is selected.');
      const result = {
        ok: true,
        candidateCount: 0,
        sentCount: 0,
        skipped: true,
        reason: 'Non-Inbox folder selected'
      };
      chrome.runtime.sendMessage({ type: 'SCAN_RESULT', ...result }).catch(() => {});
      return result;
    }

    let sentCount = 0;
    const rows = candidateRows();
    let conversationsScanned = 0;
    const currentFingerprints = [];

    console.log(`[EbayMonitor] Found ${rows.length} candidate rows`);

    for (let i = 0; i < rows.length; i++) {
      const message = extractMessageFromRow(rows[i]);
      if (message) {
        conversationsScanned++;
        const fingerprint = fingerprintFor(currentStore.storeId, message.buyer, message.subject);
        currentFingerprints.push(fingerprint);

        const cacheKey = `${fingerprint}:${message.unreadCount}:${message.preview}`;
        if (!sentFingerprints.has(cacheKey)) {
          // Clear any older cache keys for the same fingerprint (different unreadCount or preview)
          [...sentFingerprints].forEach((key) => {
            if (key.startsWith(`${fingerprint}:`)) {
              sentFingerprints.delete(key);
            }
          });

          sentFingerprints.add(cacheKey);
          sentCount += 1;

          // Use the eBay timestamp for the message, using row position (i) as tiebreaker
          // Row 0 (top of inbox = most recent) gets the highest timestamp
          // When two messages have the same relative time, row order decides
          const ebayTs = extractEbayTimestamp(rows[i], i);

          // Encode row position into timestamp for stable ordering:
          // Subtract an extra offset per row-position so rows that parse to the same
          // relative time still sort correctly (row 0 > row 1 > row 2 ...).
          // The offset is tiny (1 second per row) — well within rounding margin.
          const stableTs = ebayTs - i * 1000;

          chrome.runtime.sendMessage({
            type: 'NEW_MESSAGE',
            ...currentStore,
            ...message,
            fingerprint: fingerprint,
            ebayTimestamp: stableTs,
            // rowIndex is sent so the server can use it as ordering hint
            rowIndex: i,
            timestamp: new Date(stableTs).toISOString()
          });
          console.log(`[EbayMonitor] Row ${i}: ${message.buyer} | time: ${new Date(stableTs).toLocaleString()} | subject: "${message.subject}" | preview: "${message.preview.slice(0, 40)}"`);
        }

      }
    }

    if (conversationsScanned > 0 || (rows.length === 0 && document.readyState === 'complete')) {
      chrome.runtime.sendMessage({
        type: 'SYNC_INBOX',
        storeName: currentStore.storeName,
        fingerprints: currentFingerprints
      });
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
