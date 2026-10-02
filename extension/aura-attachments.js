/* Read-only page-world adapter for Aura email tiles that expose only data-index. */
(() => {
  'use strict';
  let lastAnchor, lastLookup = null, lastLoad = null;
  // Explicit, local diagnostics: return field structure, never attachment/email values.
  function shape(value, index, depth = 0) {
    if (value == null) return 'absent';
    if (typeof value === 'string') return id(value) ? `file-id:${value.slice(0, 3)}` : 'string';
    if (typeof value !== 'object') return typeof value;
    if (depth >= 3) return Array.isArray(value) ? 'array' : 'object';
    if (Array.isArray(value)) return { length: value.length, indexedItem: shape(value[index], index, depth + 1) };
    return Object.fromEntries(Object.keys(value).slice(0, 40).map(key => [key, shape(value[key], index, depth + 1)]));
  }
  window.quickViewDiagnoseAttachment = () => {
    if (!lastAnchor) return { message: 'Hover a Feed email attachment first.' };
    const index = Number(lastAnchor.dataset.index), fields = [];
    const components = componentsFor(lastAnchor);
    for (const component of components) {
      const names = attributeNames(component), attributes = {};
      for (const key of metadataKeys(component)) {
        const value = read(component, `v.${key}`);
        if (value != null) attributes[key] = shape(value, index);
      }
      let type = 'unknown';
      try { type = component.getType?.() || 'value-provider'; } catch { /* Keep diagnostic usable. */ }
      fields.push({ component: type, attributeNames: names, readableMetadata: attributes });
    }
    const visited = new Set(components);
    return JSON.stringify({ auraAvailable: !!window.$A?.getComponent, componentsFound: visited.size, index, lookup: lastLookup, load: lastLoad, fields }, null, 2);
  };
  document.addEventListener('quickview-preview-diagnostic', event => {
    if (event.target !== lastAnchor) return;
    try { lastLoad = JSON.parse(event.detail); } catch { /* Ignore malformed page events. */ }
  }, true);
  const id = value => typeof value === 'string' && /^(?:068|069|00P)[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?$/.test(value) ? value : null;
  const read = (component, key) => { try { return component?.get?.(key); } catch { return null; } };
  function attributeNames(component) {
    // Use exported definition methods: private attributeSet properties may be hidden.
    try {
      const defs = component.getDef?.()?.getAttributeDefs?.();
      return (defs?.getNames?.() || Object.keys(defs?.getValues?.() || {})).filter(key => typeof key === 'string').slice(0, 100);
    } catch { return []; }
  }
  function metadataKeys(component) {
    const known = ['attachment', 'attachments', 'attachmentList', 'emailAttachments', 'files', 'emailMessage', 'record'];
    return [...new Set([...known, ...attributeNames(component).filter(key => /attach|file|email|record|message|data|item/i.test(key))])];
  }
  function componentsFor(anchor) {
    const boundary = anchor.closest('.forceChatterFeedAuxBodyEmailMessage');
    const queue = [], visited = new Set();
    for (let node = anchor; node && boundary?.contains(node); node = node.parentElement) {
      try {
        const reference = node.getAttribute('data-aura-rendered-by');
        if (reference) queue.push({ component: window.$A?.getComponent?.(reference), depth: 0 });
      } catch { /* Access may be restricted. */ }
    }
    // Inspect both ownership and value-provider branches, rather than choosing one.
    while (queue.length && visited.size < 60) {
      const { component, depth } = queue.shift();
      if (!component || visited.has(component)) continue;
      visited.add(component);
      if (depth >= 6) continue;
      for (const method of ['getAttributeValueProvider', 'getComponentValueProvider', 'getOwner', 'getComponent']) {
        try {
          const next = component[method]?.();
          if (next && next !== component) queue.push({ component: next, depth: depth + 1 });
        } catch { /* A restricted branch must not prevent inspecting another. */ }
      }
    }
    return [...visited];
  }
  function file(record, title) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const filename = record.fileName || record.filename || record.Name || record.name || record.Title || record.title;
    // Never select a sibling by index alone; require its displayed filename too.
    const extension = record.FileExtension || record.fileExtension;
    if (filename !== title && `${filename}.${extension}` !== title) return null;
    // Feed capability entries keep the label on the wrapper and the reference inside attachment.
    const nested = record.attachment && typeof record.attachment === 'object' ? record.attachment : {};
    const versionId = id(nested.ContentVersionId || nested.contentVersionId || nested.LatestPublishedVersionId || nested.latestPublishedVersionId) || id(record.ContentVersionId || record.contentVersionId || record.LatestPublishedVersionId || record.latestPublishedVersionId);
    const reference = id(record.ContentDocumentId || record.contentDocumentId || record.AttachmentId || record.attachmentId || record.Id || record.id || record.recordId) || id(nested.ContentDocumentId || nested.contentDocumentId || nested.AttachmentId || nested.attachmentId || nested.Id || nested.id || nested.recordId) || versionId;
    return reference ? { id: reference, versionId: versionId || (reference.startsWith('068') ? reference : null) } : null;
  }
  function search(value, index, title, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 4) return null;
    if (Array.isArray(value)) return file(value[index], title);
    const direct = file(value, title);
    if (direct) return direct;
    for (const key of ['attachments', 'Attachments', 'files', 'Files', 'attachmentList', 'emailAttachments', 'emailMessage', 'EmailMessage', 'record', 'records', 'items', 'capabilities', 'data', 'message', 'messageData', 'ContentDocument', 'ContentVersion']) {
      const found = search(value[key], index, title, depth + 1);
      if (found) return found;
    }
    return null;
  }
  document.addEventListener('quickview-aura-request', event => {
    const anchor = event.target;
    if (!(anchor instanceof Element) || !anchor.matches('.emailMessage__attachment a[data-index]')) return;
    lastAnchor = anchor; lastLoad = null;
    const boundary = anchor.closest('.forceChatterFeedAuxBodyEmailMessage');
    const index = Number(anchor.getAttribute('data-index'));
    if (!boundary || !Number.isInteger(index) || index < 0 || index > 1000) return;
    const title = anchor.querySelector('.slds-truncate')?.textContent.trim();
    let result = null;
    for (const component of componentsFor(anchor)) {
      for (const key of metadataKeys(component)) {
        result = search(read(component, `v.${key}`), index, title);
        if (result) break;
      }
      if (result) break;
    }
    lastLookup = result ? { resolved: true, idPrefix: result.id.slice(0, 3), hasVersion: !!result.versionId } : { resolved: false };
    // Only file identifiers cross worlds; no email contents, component objects or tokens.
    anchor.dispatchEvent(new CustomEvent('quickview-aura-result', { detail: JSON.stringify(result) }));
  }, true);
})();
