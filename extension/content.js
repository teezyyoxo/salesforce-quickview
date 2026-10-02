(() => {
  'use strict';
  if (globalThis.__quickViewLoaded) return;
  globalThis.__quickViewLoaded = true;
  const Q = globalThis.QuickView;
  let settings = Q.normalize(), active = null, timer, loadTimer, generation = 0, point = { x: 0, y: 0 };
  let host, panel, image, status, name, media, motion, closing = false;
  const titles = new Map();
  const systemDark = matchMedia('(prefers-color-scheme: dark)');

  const attachmentSelector = '.emailMessage__attachment, .slds-file, .emailuiAttachment, .emailuiAttachmentItem, .emailAttachment, .email-attachment, .forceContentFileCard, [data-attachment-id], [data-file-id], [data-content-document-id], [data-content-version-id]';
  function metadataId(element) {
    if (!element) return null;
    for (const attribute of ['href', 'data-recordid', 'data-record-id', 'data-content-document-id', 'data-contentdocumentid', 'data-content-version-id', 'data-version-id', 'data-file-id', 'data-attachment-id', 'data-related-record-id', 'data-relatedrecordid', 'data-id']) {
      const id = Q.fileId(element.getAttribute(attribute));
      if (id) return id;
    }
    return null;
  }
  function locate(event) {
    const path = event.composedPath();
    const anchor = path.find(node => node instanceof Element && node.matches('a, button, [role="link"], [role="button"], [data-file-link], .slds-file__title'));
    if (!anchor || host?.contains(anchor)) return null;
    // Inline email-body images are not attachment titles, including linked images.
    if (anchor.querySelector('img') && !anchor.textContent.trim()) return null;
    const candidate = anchor.closest(attachmentSelector);
    const attachment = candidate?.matches('tr, [role="row"]') ? null : candidate;
    const tableRow = anchor.closest('tr, [role="row"]');
    const row = attachment || tableRow || anchor.closest('.slds-media');
    // Each attachment has its own boundary. Never borrow a sibling attachment's ID.
    let id = metadataId(anchor) || metadataId(attachment);
    const cell = anchor.closest('td, th, [role="gridcell"], [role="rowheader"]');
    const titleCell = cell && (cell.matches('th[scope="row"], [role="rowheader"], [data-label="Title"]') || cell === tableRow?.querySelector('td, th, [role="gridcell"], [role="rowheader"]'));
    if (!id && tableRow && titleCell) id = metadataId(tableRow) || Q.fileId(tableRow.dataset.rowKeyValue);
    if (!id && row && anchor.matches('[data-file-link], .slds-file__title')) id = metadataId(row);
    const aura = !id && anchor.matches('a[data-index]') && !!anchor.closest('.emailMessage__attachment') && !!anchor.closest('.forceChatterFeedAuxBodyEmailMessage');
    if (!id && !aura) return null;
    const title = anchor.dataset.fileName || attachment?.dataset.fileName || anchor.querySelector('.slds-file__text, .slds-truncate')?.textContent.trim() || anchor.textContent.trim() || anchor.getAttribute('title') || anchor.getAttribute('aria-label') || 'File preview';
    const signals = [title, anchor.dataset.fileType, row?.dataset.fileType];
    row?.querySelectorAll('svg use, img, [data-key], [data-doctype]').forEach(node => signals.push(node.getAttribute('href'), node.getAttribute('xlink:href'), node.getAttribute('alt'), node.getAttribute('data-key'), node.getAttribute('data-doctype')));
    const raster = /\.(png|jpe?g|gif|webp|bmp|avif)(?:$|\s)/i.test(title) || /(?:^|[\s/#_-])(?:image|png|jpe?g|gif|webp|bmp|avif)(?:$|[\s_-])/i.test(signals.filter(Boolean).join(' '));
    // Known document types and SVG never use the original-image fallback.
    const nonRaster = /\.(svg|pdf|zip|csv|docx?|xlsx?|pptx?|txt|html?)(?:$|\s)/i.test(title);
    const versionId = Q.fileId(anchor.dataset.versionId || anchor.dataset.contentVersionId || row?.dataset.versionId || row?.dataset.contentVersionId);
    const existingURL = anchor.getAttribute('href')?.includes('/renditionDownload') ? anchor.getAttribute('href') : row?.querySelector('img[src*="/sfc/servlet.shepherd/"], a[href*="/renditionDownload"]')?.getAttribute('src') || row?.querySelector('a[href*="/renditionDownload"]')?.getAttribute('href');
    return { anchor, row, id, title, aura, image: raster && !nonRaster, versionId, existingURL };
  }
  function suppress(file) {
    if (!settings.suppressTooltip) return;
    for (const root of [file.anchor, file.row]) {
      if (!root) continue;
      const elements = [root, ...root.querySelectorAll('[title]')];
      for (const node of elements) if (node.hasAttribute('title')) {
        if (!titles.has(node)) titles.set(node, node.getAttribute('title'));
        node.removeAttribute('title');
      }
    }
  }
  function restoreTitles() {
    for (const [node, title] of titles) if (!node.hasAttribute('title')) node.setAttribute('title', title);
    titles.clear();
  }
  function build() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'quickview-salesforce';
    host.style.cssText = 'all:initial;position:fixed;inset:0 auto auto 0;z-index:2147483647;pointer-events:none;display:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host{color-scheme:light dark} *{box-sizing:border-box}
      .panel{font:13px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--fg);overflow:hidden;border:var(--border) solid var(--edge);border-radius:var(--radius);box-shadow:var(--shadow)}
      .media{display:flex;align-items:center;justify-content:center;padding:12px;overflow:hidden;min-height:0}
      img{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain} img[hidden],p[hidden]{display:none}
      p{margin:12px;text-align:center;color:var(--muted);max-width:300px}
      .name{padding:10px 14px;border-top:1px solid var(--edge);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
    </style><div class="panel" role="tooltip"><div class="media"><img hidden alt=""><p role="status"></p></div><div class="name"></div></div>`;
    panel = shadow.querySelector('.panel'); image = shadow.querySelector('img'); status = shadow.querySelector('p'); name = shadow.querySelector('.name'); media = shadow.querySelector('.media');
    document.documentElement.append(host);
  }
  function appearance() {
    if (!host) return;
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark.matches);
    for (const [key, value] of Object.entries({ bg: dark ? '#171e2c' : '#ffffff', fg: dark ? '#edf1f8' : '#192237', muted: dark ? '#a6b2c6' : '#627089', edge: settings.borderColor, border: `${settings.borderWidth}px`, radius: `${settings.radius}px`, shadow: settings.shadow ? '0 12px 40px #07132338,0 3px 10px #07132314' : 'none' })) panel.style.setProperty(`--${key}`, value);
    name.hidden = !settings.showName;
    const { width, height } = Q.previewSize(settings, innerWidth, innerHeight, name.offsetHeight);
    panel.style.width = `${width}px`; media.style.height = `${height}px`;
    name.hidden = !settings.showName;
    position();
  }
  function position() {
    if (!host || closing || host.style.display === 'none') return;
    // Placement uses untransformed dimensions, so scaling cannot shift the card.
    const rect = { width: panel.offsetWidth, height: panel.offsetHeight };
    const keyboard = active?.keyboard;
    const anchorRect = active?.anchor.getBoundingClientRect();
    const x = keyboard ? anchorRect.left : point.x;
    const y = keyboard ? anchorRect.bottom : point.y;
    const left = Math.max(12, Math.min(x + 18, innerWidth - rect.width - 12));
    const top = y + 20 + rect.height <= innerHeight - 12 ? y + 20 : Math.max(12, y - rect.height - 14);
    host.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
  }
  function cancelMotion() {
    if (motion) { motion.onfinish = null; motion.cancel(); motion = null; }
    closing = false;
  }
  function hide(immediate = false) {
    clearTimeout(timer); clearTimeout(loadTimer); generation++;
    active = null; restoreTitles();
    if (image) { image.onload = null; image.onerror = null; }
    if (closing && immediate !== true) return;
    cancelMotion();
    function finish() {
      cancelMotion();
      if (host) host.style.display = 'none';
      if (image) image.removeAttribute('src');
    }
    if (immediate !== true && host?.style.display === 'block') motion = Q.animate(panel, settings.animation, true);
    if (motion) { closing = true; motion.onfinish = finish; }
    else finish();
  }
  function show(file) {
    if (active !== file || !file.anchor.isConnected) return hide();
    if (file.aura) {
      const receive = event => {
        try {
          const result = JSON.parse(event.detail);
          file.id = Q.fileId(result?.id);
          file.versionId = Q.fileId(result?.versionId);
        } catch { /* Unavailable or invalid page metadata. */ }
      };
      file.anchor.addEventListener('quickview-aura-result', receive);
      file.anchor.dispatchEvent(new CustomEvent('quickview-aura-request', { bubbles: true }));
      file.anchor.removeEventListener('quickview-aura-result', receive);
    }
    build(); cancelMotion(); const token = ++generation;
    image.hidden = true; status.hidden = false; status.textContent = 'Loading preview…';
    name.textContent = file.title; image.alt = `Preview of ${file.title}`;
    host.style.display = 'block'; appearance();
    motion = Q.animate(panel, settings.animation);
    if (motion) motion.onfinish = cancelMotion;
    const urls = Q.sources({ ...file, scale: settings.scale });
    let index = 0;
    function diagnose(stage) {
      if (file.aura) file.anchor.dispatchEvent(new CustomEvent('quickview-preview-diagnostic', { bubbles: true, detail: JSON.stringify({ stage, sources: urls.length, attempts: index }) }));
    }
    diagnose(urls.length ? 'loading' : 'no-file-reference');
    function unavailable() {
      clearTimeout(loadTimer); image.hidden = true; image.removeAttribute('src');
      diagnose(urls.length ? 'image-load-failed' : 'no-file-reference');
      status.hidden = false; status.textContent = urls.length ? 'Image could not be loaded. Click the file to open Salesforce’s viewer.' : 'Attachment reference unavailable. Click the file to open Salesforce’s viewer.';
    }
    function attempt() {
      if (generation !== token) return;
      clearTimeout(loadTimer);
      if (index >= urls.length) return unavailable();
      image.onload = () => {
        if (generation !== token) return;
        diagnose('loaded'); clearTimeout(loadTimer); image.hidden = false; status.hidden = true; position();
      };
      image.onerror = attempt;
      loadTimer = setTimeout(() => { if (generation === token) { image.onload = null; image.onerror = null; unavailable(); } }, 10000);
      image.src = urls[index++];
    }
    attempt();
  }
  function enter(event, keyboard = false) {
    if (!settings.enabled || (!keyboard && event.pointerType === 'touch')) return;
    const file = locate(event);
    if (!file) return;
    if (active?.anchor === file.anchor) return;
    hide(true); active = { ...file, keyboard }; suppress(active);
    timer = setTimeout(() => show(active), settings.delay);
  }
  document.addEventListener('pointerover', event => enter(event), true);
  document.addEventListener('pointermove', event => { point = { x: event.clientX, y: event.clientY }; position(); }, { passive: true });
  document.addEventListener('pointerout', event => { if (active && !active.keyboard && event.composedPath().includes(active.anchor) && !active.anchor.contains(event.relatedTarget)) hide(); }, true);
  document.addEventListener('focusin', event => enter(event, true), true);
  document.addEventListener('focusout', event => { if (active?.keyboard && event.composedPath().includes(active.anchor)) hide(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, true);
  document.addEventListener('click', hide, true);
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide); window.addEventListener('resize', hide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  const observer = new MutationObserver(() => {
    if (active && !active.anchor.isConnected) hide();
    else if (active) suppress(active);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  systemDark.addEventListener('change', appearance);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => hide(true));
  if (globalThis.chrome?.storage?.local) {
    chrome.storage.local.get('settings').then(data => { settings = Q.normalize(data.settings); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      settings = Q.normalize(changes.settings.newValue); hide(true);
    });
  }
})();
