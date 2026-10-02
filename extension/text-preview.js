/* Bounded, inert previews. File contents are never stored or treated as HTML. */
(() => {
  'use strict';
  const limit = 256 * 1024;
  async function read(url, signal) {
    const response = await fetch(url, { credentials: 'same-origin', signal });
    if (!response.ok || /text\/html/i.test(response.headers.get('content-type') || '')) throw new Error('File could not be read');
    if (!response.body) throw new Error('Streaming unavailable');
    const reader = response.body.getReader(), chunks = [];
    let size = 0, truncated = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const remaining = limit - size;
        chunks.push(value.subarray(0, remaining)); size += Math.min(value.length, remaining);
        if (value.length >= remaining) { truncated = true; break; }
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
    if (text.includes('\0')) throw new Error('Unsupported text encoding');
    return { text, truncated };
  }
  function csv(text, maxRows = 21, maxColumns = 10) {
    const rows = []; let row = [], field = '', quoted = false, trimmed = false;
    function cell() { if (row.length < maxColumns) row.push(field.slice(0, 500)); else trimmed = true; if (field.length > 500) trimmed = true; field = ''; }
    function line() { cell(); rows.push(row); row = []; }
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else if (quoted || !field) quoted = !quoted;
        else field += char;
      } else if (char === ',' && !quoted) cell();
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        line();
        if (rows.length >= maxRows) { trimmed ||= i < text.length - 1; return { rows, trimmed }; }
      } else field += char;
    }
    if (field || row.length) line();
    return { rows, trimmed: trimmed || quoted };
  }
  function format(text, kind, truncated) {
    let notice = truncated ? 'Showing the first 256 KiB. ' : '';
    if (kind === 'csv') {
      const result = csv(text);
      if (result.trimmed) notice += 'Table limited to 21 rows, 10 columns, and 500 characters per cell. ';
      return { rows: result.rows, notice: notice + 'CSV excerpt; first row shown as headings.' };
    }
    if (kind === 'json' && !truncated) {
      try { text = JSON.stringify(JSON.parse(text), null, 2); }
      catch { notice += 'Invalid JSON; showing raw text. '; }
    }
    const lines = text.split(/\r?\n/);
    const excerpt = lines.slice(0, 200).join('\n').slice(0, 20000);
    if (lines.length > 200 || excerpt.length < text.length) notice += 'Text excerpt limited to 200 lines / 20,000 characters. ';
    return { text: excerpt, notice: notice || 'Text preview' };
  }
  globalThis.QuickViewText = Object.freeze({ read, csv, format, limit });
})();
