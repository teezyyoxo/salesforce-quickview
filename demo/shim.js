// Demo-only storage adapter. Never included in the extension package.
(() => {
  const listeners = [];
  const read = () => { try { return JSON.parse(localStorage.getItem('quickview-demo-settings') || 'null'); } catch { return null; } };
  globalThis.chrome = { storage: { local: { get: async () => ({ settings: read() }) }, onChanged: { addListener: callback => listeners.push(callback) } } };
  window.addEventListener('storage', event => { if (event.key === 'quickview-demo-settings') listeners.forEach(callback => callback({ settings: { newValue: read() } }, 'local')); });
})();
