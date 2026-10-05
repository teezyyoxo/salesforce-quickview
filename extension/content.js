(() => {
  'use strict';
  if (globalThis.__quickViewLoaded) return;
  globalThis.__quickViewLoaded = true;
  const Q = globalThis.QuickView;
  let settings = Q.normalize(), active = null, timer, loadTimer, generation = 0, point = { x: 0, y: 0 };
  let host, panel, image, status, name, media, motion, closing = false;
  let textView, textNotice, textController, metadataController;
  let activation = 0, settingsRevision = 0;
  let settingsReady = !globalThis.chrome?.storage?.local;
  const titles = new Map();
  const dialogSelector = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog, .slds-modal, .slds-modal__container, .slds-modal__content, .modal-container, .modal-body, .modal, .uiModal, .forceContentFilePicker, .forceContentFilePickerDesktop, .forceContentFilePickerModal';
  const selectionSelector = 'input, label, [role="checkbox"], .slds-checkbox, .slds-checkbox_faux, .slds-checkbox--faux, .slds-checkbox_button, .slds-checkbox-button, [data-selection-cell]';
  function selectionEvent(event) {
    return event.composedPath().some(node => node instanceof Element && (node.matches(selectionSelector) || node.matches('td, [role="gridcell"]') && !!node.querySelector('input[type="checkbox"], [role="checkbox"]')));
  }
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
    if (selectionEvent(event)) return null;
    const anchor = path.find(node => node instanceof Element && node.matches('a, button, [role="link"], [role="button"], [data-file-link], .slds-file__title'));
    if (!anchor || host?.contains(anchor)) return null;
    // Inline email-body images are not attachment titles, including linked images.
    if (anchor.querySelector('img') && !anchor.textContent.trim()) return null;
    const candidate = anchor.closest(attachmentSelector);
    const attachment = candidate?.matches('tr, [role="row"]') ? null : candidate;
    const tableRow = anchor.closest('tr, [role="row"]');
    const row = attachment || tableRow || anchor.closest('.slds-media, .slds-file-selector__list-item, li');
    // Each attachment has its own boundary. Never borrow a sibling attachment's ID.
    let id = metadataId(anchor) || metadataId(attachment);
    const cell = anchor.closest('td, th, [role="gridcell"], [role="rowheader"]');
    const titleCell = cell && (cell.matches('th[scope="row"], [role="rowheader"], [data-label="Title"]') || cell === tableRow?.querySelector('td, th, [role="gridcell"], [role="rowheader"]'));
    if (!id && tableRow && titleCell) id = metadataId(tableRow) || Q.fileId(tableRow.dataset.rowKeyValue);
    if (!id && row && anchor.matches('[data-file-link], .slds-file__title')) id = metadataId(row);
    const aura = !id && anchor.matches('a[data-index]') && !!anchor.closest('.emailMessage__attachment') && !!anchor.closest('.forceChatterFeedAuxBodyEmailMessage');
    if (!id && !aura) return null;
    const title = anchor.dataset.fileName || attachment?.dataset.fileName || anchor.querySelector('.slds-file__text, .slds-truncate')?.textContent.trim() || anchor.textContent.trim() || anchor.getAttribute('title') || anchor.getAttribute('aria-label') || 'File preview';
    const signals = [title, anchor.dataset.fileType, row?.dataset.fileType, anchor.dataset.fileExtension, row?.dataset.fileExtension];
    // Salesforce often separates the extension into a Type cell, or concatenates
    // it with the size in attachment-card text (for example, "326KBtxt").
    row?.querySelectorAll('td, [role="gridcell"], .slds-file__type, [data-file-type], [data-file-extension]').forEach(node => {
      signals.push(node.textContent.trim(), node.dataset.fileType, node.dataset.fileExtension);
    });
    row?.querySelectorAll('svg use, img, [data-key], [data-doctype]').forEach(node => signals.push(node.getAttribute('href'), node.getAttribute('xlink:href'), node.getAttribute('alt'), node.getAttribute('data-key'), node.getAttribute('data-doctype')));
    // File-picker titles omit extensions; the adjacent metadata ends with the file type.
    const pickerType = row?.textContent.match(/(?:•|·|\b\d+(?:\.\d+)?\s*(?:bytes|[kmgt]?b))\s*(?:[•·|]\s*)?(png|jpe?g|gif|webp|bmp|avif|csv|json|txt|log|md|xml|ya?ml|pptx?|docx?|xlsx?|pdf|zip|rar|7z)\s*$/i)?.[1];
    const kind = Q.kind(pickerType ? `file.${pickerType}` : title, signals.filter(Boolean).join(' '));
    let versionId = Q.fileId(anchor.dataset.versionId || anchor.dataset.contentVersionId || row?.dataset.versionId || row?.dataset.contentVersionId);
    const existingURL = anchor.getAttribute('href')?.includes('/renditionDownload') ? anchor.getAttribute('href') : row?.querySelector('img[src*="/sfc/servlet.shepherd/"], a[href*="/renditionDownload"]')?.getAttribute('src') || row?.querySelector('a[href*="/renditionDownload"]')?.getAttribute('href');
    if (!versionId && existingURL) {
      try { const reference = Q.fileId(new URL(existingURL, location.href).searchParams.get('versionId')); if (reference?.startsWith('068')) versionId = reference; } catch { /* Ignore malformed thumbnail URLs. */ }
    }
    return { anchor, row, id, title, aura, kind, dialog: path.some(node => node instanceof Element && !!node.closest(dialogSelector)), image: kind === 'image', versionId, existingURL };
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
      img{display:block;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain} [hidden]{display:none!important}
      p{margin:12px;text-align:center;color:var(--muted);max-width:300px}
      .text-view{align-self:stretch;width:100%;overflow:hidden;display:flex;flex-direction:column;gap:10px}
      pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace;overflow:hidden}
      table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px}td,th{padding:6px 8px;border:1px solid var(--edge);text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:100px}th{font-weight:650;background:color-mix(in srgb,var(--fg) 6%,var(--bg))}
      .text-notice{font-size:11px;color:var(--muted);flex-shrink:0}.excerpt{overflow:hidden;min-height:0}
      .name{padding:10px 14px;border-top:1px solid var(--edge);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:550}
    </style><div class="panel" role="tooltip"><div class="media"><img hidden alt=""><div class="text-view" hidden><div class="text-notice"></div><div class="excerpt"></div></div><p role="status"></p></div><div class="name"></div></div>`;
    panel = shadow.querySelector('.panel'); image = shadow.querySelector('img'); status = shadow.querySelector('p'); name = shadow.querySelector('.name'); media = shadow.querySelector('.media');
    textView = shadow.querySelector('.text-view'); textNotice = shadow.querySelector('.text-notice');
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
    clearTimeout(timer); clearTimeout(loadTimer); generation++; activation++;
    textController?.abort(); textController = null;
    metadataController?.abort(); metadataController = null;
    active = null; restoreTitles();
    if (image) { image.onload = null; image.onerror = null; }
    if (closing && immediate !== true) return;
    cancelMotion();
    function finish() {
      cancelMotion();
      if (host) host.style.display = 'none';
      if (image) image.removeAttribute('src');
      if (textView) { textView.hidden = true; textView.querySelector('.excerpt').replaceChildren(); textNotice.textContent = ''; }
    }
    if (immediate !== true && host?.style.display === 'block') motion = Q.animate(panel, settings.animation, true);
    if (motion) { closing = true; motion.onfinish = finish; }
    else finish();
  }
  async function show(file) {
    if (!file || active !== file || !file.anchor.isConnected) return hide();
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
    textView.hidden = true; textView.querySelector('.excerpt').replaceChildren();
    image.hidden = true; status.hidden = false; status.textContent = 'Loading preview…';
    name.textContent = file.kind === 'document' ? `${file.title} · First-page preview` : file.title; image.alt = `Preview of ${file.title}`;
    host.style.display = 'block'; appearance();
    motion = Q.animate(panel, settings.animation);
    if (motion) motion.onfinish = cancelMotion;
    if (file.kind === 'document' && file.id?.startsWith('069') && !file.versionId && !file.existingURL) {
      metadataController = new AbortController();
      const controller = metadataController, requestId = crypto.randomUUID();
      const result = await new Promise(resolve => {
        let timeout;
        const finish = value => {
          clearTimeout(timeout); file.anchor.removeEventListener('quickview-file-result', receive);
          controller.signal.removeEventListener('abort', cancelled); resolve(value);
        };
        const cancelled = () => finish(null);
        const receive = event => {
          try { const value = JSON.parse(event.detail); if (value.requestId === requestId) finish(value); } catch { /* Ignore malformed page events. */ }
        };
        file.anchor.addEventListener('quickview-file-result', receive);
        controller.signal.addEventListener('abort', cancelled, { once: true });
        timeout = setTimeout(() => finish(null), 9000);
        file.anchor.dispatchEvent(new CustomEvent('quickview-file-request', { bubbles: true, detail: JSON.stringify({ id: file.id, requestId }) }));
      });
      if (generation !== token || active !== file) return;
      metadataController = null;
      file.versionId = Q.fileId(result?.versionId);
      file.existingURL = Q.safeURL(result?.previewURL);
    }
    if (['csv', 'json', 'text'].includes(file.kind)) {
      const url = Q.originalURL(file.versionId || file.id);
      if (!url) { status.textContent = 'Attachment reference unavailable. Click the file to open Salesforce’s viewer.'; return; }
      textController = new AbortController();
      const controller = textController;
      loadTimer = setTimeout(() => controller.abort(), 10000);
      QuickViewText.read(url, controller.signal).then(result => {
        if (generation !== token) return;
        const formatted = QuickViewText.format(result.text, file.kind, result.truncated);
        const excerpt = textView.querySelector('.excerpt');
        if (formatted.rows) {
          const table = document.createElement('table');
          for (const [rowIndex, row] of formatted.rows.entries()) {
            const tr = document.createElement('tr');
            for (const value of row) { const cell = document.createElement(rowIndex ? 'td' : 'th'); cell.textContent = value; tr.append(cell); }
            table.append(tr);
          }
          excerpt.append(table);
        } else { const pre = document.createElement('pre'); pre.textContent = formatted.text; excerpt.append(pre); }
        textNotice.textContent = formatted.notice;
        textView.hidden = false; status.hidden = true;
      }).catch(() => { if (generation === token) status.textContent = 'Text preview unavailable. Click the file to open Salesforce’s viewer.'; })
        .finally(() => { if (generation === token) { clearTimeout(loadTimer); textController = null; } });
      return;
    }
    const urls = Q.sources({ ...file, scale: settings.scale });
    let index = 0;
    function diagnose(stage) {
      if (file.aura) file.anchor.dispatchEvent(new CustomEvent('quickview-preview-diagnostic', { bubbles: true, detail: JSON.stringify({ stage, sources: urls.length, attempts: index }) }));
    }
    diagnose(urls.length ? 'loading' : 'no-file-reference');
    function unavailable() {
      clearTimeout(loadTimer); image.hidden = true; image.removeAttribute('src');
      diagnose(urls.length ? 'image-load-failed' : 'no-file-reference');
      status.hidden = false; status.textContent = file.kind === 'archive' ? 'Archive previews are not supported. Click the file to open it.' : urls.length ? 'Preview unavailable: image or rendition could not be loaded. Click the file to open Salesforce’s viewer.' : file.kind === 'document' ? 'Preview unavailable: document version or rendition is unavailable. Click the file to open Salesforce’s viewer.' : file.aura ? 'Attachment reference unavailable. Click the file to open Salesforce’s viewer.' : 'Preview unavailable. Click the file to open Salesforce’s viewer.';
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
  function applySettings(value) {
    settingsRevision++;
    settingsReady = true;
    const next = Q.normalize(value);
    if (JSON.stringify(next) !== JSON.stringify(settings)) {
      settings = next;
      const pendingActivation = activation;
      hide(true);
      activation = pendingActivation;
    }
  }
  async function refreshSettings() {
    if (!globalThis.chrome?.storage?.local) return;
    const revision = settingsRevision;
    try {
      const data = await chrome.storage.local.get('settings');
      if (revision === settingsRevision) applySettings(data.settings);
    } catch { /* Retain the last readable preferences. */ }
  }
  async function enter(event, keyboard = false) {
    if (selectionEvent(event)) return hide(true);
    if (!keyboard && event.pointerType === 'touch') return;
    const file = locate(event);
    if (!file) { if (!keyboard) hide(true); return; }
    // Read local storage on activation as well as listening for changes. This also
    // catches updates made while this Salesforce tab was suspended or unfocused.
    const pendingActivation = ++activation;
    await refreshSettings();
    if (pendingActivation !== activation) return;
    if (!settingsReady || !settings.enabled || !file?.anchor.isConnected) return;
    if (file.dialog && !settings.dialogPreviews) { hide(true); return; }
    if (active?.anchor === file.anchor) return;
    hide(true); active = { ...file, keyboard }; suppress(active);
    const pending = active;
    timer = setTimeout(() => { if (active === pending) show(pending); }, file.dialog ? settings.dialogDelay : settings.delay);
  }
  document.addEventListener('pointerover', event => enter(event), true);
  document.addEventListener('pointermove', event => { if (selectionEvent(event)) return hide(true); point = { x: event.clientX, y: event.clientY }; position(); }, { passive: true });
  document.addEventListener('pointerout', event => { if (!active && !event.target.contains?.(event.relatedTarget)) activation++; if (active && !active.keyboard && event.composedPath().includes(active.anchor) && !active.anchor.contains(event.relatedTarget)) hide(); }, true);
  document.addEventListener('focusin', event => enter(event, true), true);
  document.addEventListener('focusout', event => { activation++; if (active?.keyboard && event.composedPath().includes(active.anchor)) hide(); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); }, true);
  document.addEventListener('pointerdown', () => hide(true), true);
  document.addEventListener('click', hide, true);
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('blur', hide); window.addEventListener('resize', appearance);
  window.visualViewport?.addEventListener('resize', appearance);
  new ResizeObserver(appearance).observe(document.documentElement);
  window.addEventListener('focus', refreshSettings);
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); else refreshSettings(); });
  const observer = new MutationObserver(() => {
    if (active && !active.anchor.isConnected) hide();
    else if (active) suppress(active);
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  systemDark.addEventListener('change', appearance);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => hide(true));
  if (globalThis.chrome?.storage?.local) {
    refreshSettings().finally(() => { settingsReady = true; });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      applySettings(changes.settings.newValue);
    });
  }
})();
