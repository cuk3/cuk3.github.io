/* app.js */
'use strict';

// Статический прокси — API не нужен
const STATIC_PROXY = { ip: '103.75.126.27', port: 443, secret: 'd4cf95473aefd3effc1e0a3d3fbb9040' };

const LS_CACHE_KEY = 'proxy_cache';
let currentProxy = null;

function isValidHost(v) {
  if (typeof v !== 'string') return false;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ||
         /^[a-zA-Z0-9][a-zA-Z0-9\-.]{0,251}[a-zA-Z0-9]$/.test(v);
}
function isValidPort(v) { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 65535; }
function isValidSecret(v) { return typeof v === 'string' && /^[0-9a-fA-F+/=]{32,300}$/.test(v); }

function saveCache(p) { try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(p)); } catch {} }
function loadCache() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || 'null');
    if (d && isValidHost(d.ip) && isValidPort(d.port) && isValidSecret(d.secret)) return d;
  } catch {}
  return null;
}

function setStatus(type, text) {
  const el = document.getElementById('status');
  if (!el) return;
  el.className = 'status' + (type ? ' ' + type : '');
  el.innerHTML = '';
  if (type === 'loading') {
    const s = document.createElement('span');
    s.className = 'spinner';
    el.appendChild(s);
    el.append(' ' + text);
  } else if (type === '') {
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    el.appendChild(dot);
    el.append(' ' + text);
  } else {
    el.textContent = text;
  }
}

async function getNewProxy() {
  ['qrContainer','linkBox','telegramLink','copyBtn','shareBtn','proxyStats']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const btn = document.getElementById('getProxyBtn');
  if (btn) btn.disabled = true;
  setStatus('loading', 'Подбираем...');

  currentProxy = STATIC_PROXY;
  saveCache(STATIC_PROXY);
  renderProxy(STATIC_PROXY, false);
}

function renderProxy(data, fromCache) {
  const ip     = encodeURIComponent(data.ip);
  const port   = data.port;
  const secret = encodeURIComponent(data.secret);
  const tgUrl  = 'tg://proxy?server=' + ip + '&port=' + port + '&secret=' + secret;
  const webUrl = 'https://t.me/proxy?server=' + ip + '&port=' + port + '&secret=' + secret;

  const linkBox = document.getElementById('linkBox');
  if (linkBox) { linkBox.textContent = webUrl; linkBox.style.display = 'block'; }

  const tgLink = document.getElementById('telegramLink');
  if (tgLink) { tgLink.href = tgUrl; tgLink.style.display = 'flex'; }

  const qrEl = document.getElementById('qrcode');
  if (qrEl && typeof QRCode !== 'undefined') {
    qrEl.innerHTML = '';
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    new QRCode(qrEl, {
      text: tgUrl, width: 150, height: 150,
      colorDark:  dark ? '#e2e8f0' : '#1a1a1a',
      colorLight: dark ? '#2a2a3e' : '#f7f9fc',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  const qrContainer = document.getElementById('qrContainer');
  if (qrContainer) qrContainer.style.display = 'flex';

  const copyBtn = document.getElementById('copyBtn');
  if (copyBtn) copyBtn.style.display = 'flex';

  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn && navigator.share) shareBtn.style.display = 'flex';

  setStatus(fromCache ? 'loading' : '', fromCache ? '⚠️ Кэш (старые данные)' : 'Готово');

  const btn = document.getElementById('getProxyBtn');
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Другой прокси'; }
}

async function copyLink() {
  if (!currentProxy) return;
  const url = 'https://t.me/proxy?server=' + encodeURIComponent(currentProxy.ip) +
    '&port=' + currentProxy.port + '&secret=' + encodeURIComponent(currentProxy.secret);
  try { await navigator.clipboard.writeText(url); showToast('Скопировано!'); }
  catch { showToast('Копируй вручную из поля'); }
}

async function shareProxy() {
  if (!navigator.share) return;
  const text = '🚀 Бесплатный MTProxy для Telegram\nОбходи блокировку — без VPN\n\n✅ Бесплатно  ✅ Без регистрации\n\n📢 Канал: t.me/telegaLIFEpls';
  try {
    const img = await fetch('./og-preview.png');
    if (img.ok) {
      const blob = await img.blob();
      const file = new File([blob], 'proxy.png', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Фикс Телеграм', text, url: 'https://cuk3.github.io/', files: [file] });
        return;
      }
    }
  } catch {}
  try { await navigator.share({ title: 'Фикс Телеграм', text, url: 'https://cuk3.github.io/' }); }
  catch (e) { if (e.name !== 'AbortError') console.warn(e); }
}

function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

window.addEventListener('load', getNewProxy);
window.getNewProxy = getNewProxy;
window.copyLink    = copyLink;
window.shareProxy  = shareProxy;
