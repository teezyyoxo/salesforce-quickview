/* Shared settings and Salesforce URL resolution. No page content is persisted. */
(() => {
  'use strict';
  const defaults = Object.freeze({ enabled: true, theme: 'system', animation: 'none', scale: 100, delay: 250, radius: 12, borderWidth: 1, borderColor: '#d5dbe7', shadow: true, suppressTooltip: true, showName: true });
  const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  function normalize(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    const result = { ...defaults };
    // Migrate the previous independent size controls into a single percentage.
    const legacyScale = Math.round(Math.max(Number(value.width) || 520, 520) / 520 * 100 / 5) * 5;
    const legacyHeightScale = Math.round(Math.max(Number(value.height) || 380, 380) / 380 * 100 / 5) * 5;
    result.scale = bounded(value.scale ?? Math.max(legacyScale, legacyHeightScale), 50, 500, defaults.scale);
    for (const key of ['enabled', 'shadow', 'suppressTooltip', 'showName']) if (typeof value[key] === 'boolean') result[key] = value[key];
    if (['system', 'light', 'dark'].includes(value.theme)) result.theme = value.theme;
    if (['none', 'fade', 'fall', 'scale-up', 'scale-down'].includes(value.animation)) result.animation = value.animation;
    for (const [key, min, max] of [['delay', 0, 1500], ['radius', 0, 32], ['borderWidth', 0, 6]]) result[key] = bounded(value[key] ?? defaults[key], min, max, defaults[key]);
    if (/^#[\da-f]{6}$/i.test(value.borderColor)) result.borderColor = value.borderColor;
    return result;
  }
  function fileId(value) {
    let text = String(value || '');
    try { text = decodeURIComponent(text); } catch { /* Keep malformed URLs as text. */ }
    return text.match(/\b((?:06[89]|00P)[a-zA-Z0-9]{12}(?:[a-zA-Z0-9]{3})?)\b/)?.[1] || null;
  }
  function isSalesforceHost(host) { return /(?:^|\.)(?:salesforce\.com|force\.com|salesforce\.mil)$/.test(host); }
  function safeURL(value, base = location.href) {
    try {
      const url = new URL(value, base);
      const source = new URL(base);
      if (url.protocol !== 'https:' && !(source.hostname === '127.0.0.1' && url.origin === source.origin)) return null;
      if (url.username || url.password) return null;
      if (url.origin !== source.origin && !isSalesforceHost(url.hostname)) return null;
      if (!url.pathname.startsWith('/sfc/servlet.shepherd/')) return null;
      return url.href;
    } catch { return null; }
  }
  function kind(title, signals = '') {
    const extension = String(title).match(/\.([a-z0-9]+)(?:$|\s)/i)?.[1].toLowerCase();
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(extension)) return 'archive';
    if (['csv', 'json'].includes(extension)) return extension;
    if (['txt', 'log', 'md', 'xml', 'yaml', 'yml'].includes(extension)) return 'text';
    if (['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'pdf', 'rtf', 'odt', 'ods', 'odp'].includes(extension)) return 'document';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) return 'image';
    if (extension && !/^\d+$/.test(extension)) return 'unknown';
    if (/(?:^|[\s/#_-])csv(?:$|[\s_-])/i.test(signals)) return 'csv';
    if (/(?:^|[\s/#_-])json(?:$|[\s_-])/i.test(signals)) return 'json';
    if (/(?:^|[\s/#_-])(?:txt|text)(?:$|[\s_-])/i.test(signals)) return 'text';
    if (/(?:^|[\s/#_-])(?:excel|word|ppt|powerpoint|pdf)(?:$|[\s_-])/i.test(signals)) return 'document';
    return /(?:^|[\s/#_-])(?:image|png|jpe?g|gif|webp|bmp|avif)(?:$|[\s_-])/i.test(signals) ? 'image' : 'unknown';
  }
  function originalURL(reference, base = location.href) {
    const resolved = fileId(reference);
    if (!resolved) return null;
    if (resolved.startsWith('00P')) return new URL(`/servlet/servlet.FileDownload?file=${resolved}`, base).href;
    return new URL(`/sfc/servlet.shepherd/${resolved.startsWith('068') ? 'version' : 'document'}/download/${resolved}`, base).href;
  }
  function sources({ id, versionId, image, kind: fileKind, existingURL, scale = 100 }, base = location.href) {
    if (fileKind === 'archive') return [];
    const result = [];
    const existing = existingURL && safeURL(existingURL, base);
    if (existing && /\/renditionDownload(?:\?|$)/.test(existing)) result.push(existing);
    const version = fileId(versionId) || (id?.startsWith('068') ? id : null);
    if (version?.startsWith('068')) {
      const url = new URL('/sfc/servlet.shepherd/version/renditionDownload', base);
      url.search = new URLSearchParams({ rendition: 'THUMB720BY480', versionId: version, operationContext: 'CHATTER' });
      result.push(url.href);
    }
    // Original downloads are restricted to identified raster images. Documents never load here.
    if (image && fileId(id)) {
      if (id.startsWith('00P')) {
        const url = new URL('/servlet/servlet.FileDownload', base);
        url.searchParams.set('file', id);
        result.push(url.href);
      } else {
        const original = new URL(`/sfc/servlet.shepherd/${id.startsWith('068') ? 'version' : 'document'}/download/${id}`, base).href;
        if (scale > 100) result.unshift(original); else result.push(original);
      }
    }
    return [...new Set(result)];
  }
  function previewSize(settings, viewportWidth, viewportHeight, nameHeight = 40.5) {
    return {
      width: Math.min(520 * settings.scale / 100, Math.max(120, viewportWidth - 24)),
      height: Math.min(380 * settings.scale / 100, Math.max(72, viewportHeight - 24 - (settings.showName ? nameHeight : 0) - settings.borderWidth * 2))
    };
  }
  function animate(element, mode, exiting = false) {
    if (mode === 'none' || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return null;
    const transforms = { fade: 'none', fall: 'translateY(-12px)', 'scale-up': 'scale(.94)', 'scale-down': 'scale(1.04)' };
    if (!(mode in transforms)) return null;
    const hidden = { opacity: 0, transform: transforms[mode] };
    const visible = { opacity: 1, transform: 'none' };
    return element.animate(exiting ? [visible, hidden] : [hidden, visible], {
      duration: exiting ? 140 : 180,
      easing: exiting ? 'ease-in' : 'cubic-bezier(.2,.8,.2,1)',
      fill: 'both'
    });
  }
  globalThis.QuickView = Object.freeze({ defaults, normalize, fileId, safeURL, sources, kind, originalURL, previewSize, animate });
})();
