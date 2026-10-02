(() => {
  'use strict';
  const Q = globalThis.QuickView;
  const form = document.querySelector('#settings');
  const status = document.querySelector('#save-status');
  let settings = Q.normalize(), pendingSave, revision = 0, queue = Promise.resolve();
  const storage = globalThis.chrome?.storage?.local;
  let previewMotion, scene = 'files';
  function cancelPreviewMotion() {
    if (previewMotion) { previewMotion.onfinish = null; previewMotion.cancel(); previewMotion = null; }
  }
  function replay() {
    cancelPreviewMotion();
    if (!settings.enabled) return;
    const preview = document.querySelector('#sample-preview');
    previewMotion = Q.animate(preview, settings.animation, true);
    if (previewMotion) previewMotion.onfinish = () => {
      cancelPreviewMotion();
      previewMotion = Q.animate(preview, settings.animation);
      if (previewMotion) previewMotion.onfinish = cancelPreviewMotion;
    };
  }
  function paint() {
    if (settings.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = settings.theme;
    for (const [key, value] of Object.entries(settings)) {
      const input = document.getElementById(key);
      if (input.type === 'checkbox') input.checked = value; else input.value = value;
      const output = document.getElementById(`${key}-value`);
      if (output) output.textContent = key === 'scale' ? `${value}%` : `${value} ${key === 'delay' ? 'ms' : 'px'}`;
    }
    document.querySelector('#color-value').textContent = settings.borderColor.toUpperCase();
    const preview = document.querySelector('#sample-preview');
    const canvas = document.querySelector('.preview-scene');
    // Edited assets were resized. Their natural pixels are not the original viewport.
    const viewportWidth = 2560, viewportHeight = scene === 'feed' ? 1255 : 1258;
    const factor = canvas.clientWidth / viewportWidth;
    const wrap = document.querySelector('.preview-wrap');
    canvas.style.aspectRatio = `${viewportWidth} / ${viewportHeight}`;
    wrap.style.width = `${viewportWidth}px`;
    wrap.style.height = `${viewportHeight}px`;
    wrap.style.transform = `scale(${factor})`;
    preview.querySelector('.sample-name').hidden = !settings.showName;
    const nameHeight = preview.querySelector('.sample-name').offsetHeight;
    const { width, height } = Q.previewSize(settings, viewportWidth, viewportHeight, nameHeight);
    preview.style.width = `${width}px`;
    preview.querySelector('.sample-image').style.height = `${height}px`;
    const fullHeight = height + nameHeight + settings.borderWidth * 2;
    const anchorX = viewportWidth * .08, anchorY = viewportHeight * (scene === 'feed' ? .88 : .25);
    preview.style.left = `${Math.max(12, Math.min(anchorX + 18, viewportWidth - width - 12))}px`;
    preview.style.top = `${anchorY + 20 + fullHeight <= viewportHeight - 12 ? anchorY + 20 : Math.max(12, anchorY - fullHeight - 14)}px`;
    preview.style.borderRadius = `${settings.radius}px`;
    preview.style.borderWidth = `${settings.borderWidth}px`;
    preview.style.borderColor = settings.borderColor;
    preview.style.boxShadow = settings.shadow ? 'var(--shadow)' : 'none';
    preview.style.opacity = settings.enabled ? '1' : '.3';
    preview.querySelector('.sample-name').hidden = !settings.showName;
    document.querySelector('#preview-caption').textContent = settings.enabled ? `${settings.scale}% · Example viewport: 2560 × ${viewportHeight} px. Dummy preview content.` : 'Hover previews are paused.';
  }
  function save() {
    clearTimeout(pendingSave);
    status.textContent = 'Saving…';
    const snapshot = { ...settings }, currentRevision = revision;
    queue = queue.catch(() => {}).then(async () => {
      try {
        if (storage) await storage.set({ settings: snapshot });
        else localStorage.setItem('quickview-demo-settings', JSON.stringify(snapshot));
        if (currentRevision === revision) status.textContent = storage ? 'Settings saved locally' : 'Saved in demo mode';
      } catch { if (currentRevision === revision) status.textContent = 'Could not save. Try again.'; }
    });
  }
  function change(event) {
    const input = event.target;
    if (!(input.id in Q.defaults)) return;
    revision++;
    settings = Q.normalize({ ...settings, [input.id]: input.type === 'checkbox' ? input.checked : input.value });
    cancelPreviewMotion(); paint(); save();
    if (input.id === 'animation') replay();
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', change);
  document.querySelector('#theme').addEventListener('change', change);
  document.querySelector('#reset').addEventListener('click', () => { cancelPreviewMotion(); revision++; settings = Q.normalize(); paint(); save(); });
  document.querySelectorAll('.scene-switcher button').forEach(button => button.addEventListener('click', () => {
    cancelPreviewMotion(); scene = button.dataset.scene;
    document.querySelector('.preview-scene').dataset.scene = scene;
    document.querySelector('#scene-background').src = `assets/salesforce-${scene === 'feed' ? 'feed' : 'files'}-masked.png`;
    document.querySelector('#scene-background').alt = scene === 'feed' ? 'Masked Salesforce Feed email attachment page' : 'Masked Salesforce Cases Files page';
    document.querySelector('.sample-name').textContent = scene === 'feed' ? 'image.png' : 'image';
    document.querySelectorAll('.scene-switcher button').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    paint();
  }));
  document.querySelector('#scene-background').addEventListener('load', paint);
  document.querySelector('#replay').addEventListener('click', replay);
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', cancelPreviewMotion);
  window.addEventListener('resize', paint);
  const initialRevision = revision;
  (async () => {
    try {
      const saved = storage ? (await storage.get('settings')).settings : JSON.parse(localStorage.getItem('quickview-demo-settings') || 'null');
      if (revision === initialRevision) settings = Q.normalize(saved || {});
      status.textContent = storage ? 'Settings saved locally' : 'Demo mode · changes stay in this browser';
    } catch { status.textContent = 'Using defaults · saved settings unavailable'; }
    paint();
  })();
  paint();
})();
