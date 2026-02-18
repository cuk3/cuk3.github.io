/* -------------------------------------------------------
   Proxy Landing — app.js
   Безопасность + улучшения UX/надёжности
------------------------------------------------------- */

'use strict';

const DEAD_DROP_URL  = 'https://gist.githubusercontent.com/cuk3/04c44a18430914d72a83450c3cf78b54/raw';
const FALLBACK_API   = 'https://103.75.126.27.sslip.io';
const ALLOWED_HOSTS  = ['103.75.126.27.sslip.io'];
const LS_CACHE_KEY   = 'proxy_cache';

let API_URL      = '';
let currentProxy = null;
let statsInterval = null;

// ── DOM ──────────────────────────────────────────────────
const statusEl     = document.getElementById('status');
const statusTextEl = document.getElementById('statusText');
const qrContainer  = document.getElementById('qrContainer');
const linkBox      = document.getElementById('linkBox');
const telegramLink = document.getElementById('telegramLink');
const copyBtn      = document.getElementById('copyBtn');
const shareBtn     = document.getElementById('shareBtn');
const getProxyBtn  = document.getElementById('getProxyBtn');
const proxyStats   = document.getElementById('proxyStats');
const proxyUsers   = document.getElementById('proxyUsers');
const networkStats = document.getElementById('networkStats');
const totalUsers   = document.getElementById('totalUsers');
const networkInfo  = document.getElementById('networkInfo');

// ── Валидаторы ───────────────────────────────────────────
function isAllowedApiUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.host);
  } catch { return false; }
}
function isValidHost(v) {
  if (typeof v !== 'string') return false;
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every(n => +n <= 255);
  const host = /^[a-zA-Z0-9][a-zA-Z0-9\-.]{0,251}[a-zA-Z0-9]$/.test(v);
  return ipv4 || host;
}
function isValidPort(v) { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 65535; }
function isValidSecret(v) { return typeof v === 'string' && /^[0-9a-fA-F+/=]{32,300}$/.test(v); }

function saveCachedProxy(p) { try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(p)); } catch {} }
function loadCachedProxy() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || 'null');
    if (d && isValidHost(d.ip) && isValidPort(d.port) && isValidSecret(d.secret)) return d;
  } catch {}
  return null;
}

// ── API URL через Dead Drop ───────────────────────────────
async function getAPIUrl() {
  try {
    const r = await fetch(DEAD_DROP_URL, { cache: 'no-store' });
    const d = await r.json();
    const c = d.api_url || d.control_api;
    if (c && isAllowedApiUrl(c)) { API_URL = c; return; }
  } catch {}
  API_URL = FALLBACK_API;
}

// ── Статистика ───────────────────────────────────────────
async function loadNetworkStats() {
  try {
    const r = await fetch(`${API_URL}/total-stats`);
    if (!r.ok) return;
    const d = await r.json();
    totalUsers.textContent  = Number.isFinite(d.total_users) ? d.total_users.toLocaleString('ru-RU') : '—';
    networkInfo.textContent = `${d.total_nodes || 0} серверов • Загрузка ${d.load_percentage || 0}%`;
    networkStats.style.display = 'block';
  } catch {}
}

async function loadProxyStats(ip) {
  try {
    const r = await fetch(`${API_URL}/node-stats/${encodeURIComponent(ip)}`);
    if (!r.ok) { proxyStats.style.display = 'none'; return; }
    const d = await r.json();
    proxyUsers.textContent   = Number.isFinite(d.current_users) ? d.current_users : 0;
    proxyStats.style.display = 'block';
  } catch { proxyStats.style.display = 'none'; }
}

function startStatsUpdate(ip) {
  if (statsInterval) clearInterval(statsInterval);
  loadProxyStats(ip);
  loadNetworkStats();
  statsInterval = setInterval(() => {
    if (currentProxy) loadProxyStats(currentProxy.ip);
    loadNetworkStats();
  }, 30_000);
}

// ── Показать прокси ──────────────────────────────────────
function renderProxy(data, fromCache) {
  const ip     = encodeURIComponent(data.ip);
  const port   = Number(data.port);
  const secret = encodeURIComponent(data.secret);

  const proxyUrl  = `https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`;
  const proxyDirect = `tg://proxy?server=${ip}&port=${port}&secret=${secret}`;

  linkBox.textContent   = proxyUrl;
  telegramLink.href     = proxyDirect;

  // QR
  document.getElementById('qrcode').innerHTML = '';
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  new QRCode(document.getElementById('qrcode'), {
    text: proxyDirect, width: 150, height: 150,
    colorDark:  isDark ? '#e2e8f0' : '#1a1a1a',
    colorLight: isDark ? '#2a2a3e' : '#f7f9fc',
    correctLevel: QRCode.CorrectLevel.M,
  });

  qrContainer.style.display  = 'flex';
  linkBox.style.display      = 'block';
  telegramLink.style.display = 'flex';
  copyBtn.style.display      = 'flex';
  if (navigator.share) shareBtn.style.display = 'flex';

  statusEl.innerHTML = '';
  if (fromCache) {
    statusEl.className = 'status loading';
    statusEl.textContent = '⚠️ Кеш';
  } else {
    statusEl.className = 'status';
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    statusEl.appendChild(dot);
    statusEl.append(' Готов');
  }

  getProxyBtn.disabled    = false;
  getProxyBtn.textContent = '🔄 Другой прокси';
}

// ── Получить прокси ──────────────────────────────────────
async function getNewProxy() {
  qrContainer.style.display  = 'none';
  linkBox.style.display      = 'none';
  telegramLink.style.display = 'none';
  copyBtn.style.display      = 'none';
  shareBtn.style.display     = 'none';
  proxyStats.style.display   = 'none';

  statusEl.className = 'status loading';
  statusEl.innerHTML = '<span class="spinner"></span>';
  statusEl.append(' Подбираем...');
  getProxyBtn.disabled = true;

  try {
    if (!API_URL) await getAPIUrl();

    const r = await fetch(`${API_URL}/best-node`);
    if (!r.ok) throw new Error('Нет доступных прокси');
    const data = await r.json();

    if (!isValidHost(data.ip))       throw new Error('Недопустимый IP');
    if (!isValidPort(data.port))     throw new Error('Недопустимый порт');
    if (!isValidSecret(data.secret)) throw new Error('Недопустимый секрет');

    currentProxy = data;
    saveCachedProxy(data);
    renderProxy(data, false);
    startStatsUpdate(data.ip);

  } catch (err) {
    console.error(err);
    const cached = loadCachedProxy();
    if (cached) { currentProxy = cached; renderProxy(cached, true); return; }

    statusEl.className = 'status error';
    statusEl.textContent = '❌ ' + err.message;
    getProxyBtn.disabled    = false;
    getProxyBtn.textContent = '🔄 Попробовать снова';
  }
}

// ── Копирование ──────────────────────────────────────────
async function copyLink() {
  if (!currentProxy) return;
  const ip     = encodeURIComponent(currentProxy.ip);
  const port   = Number(currentProxy.port);
  const secret = encodeURIComponent(currentProxy.secret);
  const url    = `https://t.me/proxy?server=${ip}&port=${port}&secret=${secret}`;
  try { await navigator.clipboard.writeText(url); }
  catch {
    const r = document.createRange(); r.selectNode(linkBox);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(r);
    document.execCommand('copy');
    window.getSelection()?.removeAllRanges();
  }
  showToast('Ссылка скопирована!');
}

// ── Поделиться ───────────────────────────────────────────
async function shareProxy() {
  if (!navigator.share) return;
  const siteUrl   = 'https://cuk3.github.io/';
  const shareText =
    '🚀 Бесплатный MTProxy для Telegram\n' +
    'Обходи блокировку за 10 секунд — без VPN и регистрации\n\n' +
    '✅ Бесплатно\n✅ Работает прямо сейчас\n✅ Одна кнопка\n\n' +
    '📢 Канал: t.me/telegaLIFEpls';
  try {
    const imgResp = await fetch('./og-preview.png');
    if (imgResp.ok) {
      const blob = await imgResp.blob();
      const file = new File([blob], 'proxy-landing.png', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Фикс Телеграм', text: shareText, url: siteUrl, files: [file] });
        return;
      }
    }
  } catch {}
  try { await navigator.share({ title: 'Фикс Телеграм', text: shareText, url: siteUrl }); }
  catch (e) { if (e.name !== 'AbortError') console.warn(e); }
}

// ── Toast ─────────────────────────────────────────────────
function showToast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ── Инициализация ─────────────────────────────────────────
window.addEventListener('load', () => { getNewProxy(); loadNetworkStats(); });
window.addEventListener('beforeunload', () => { if (statsInterval) clearInterval(statsInterval); });

window.getNewProxy = getNewProxy;
window.copyLink    = copyLink;
window.shareProxy  = shareProxy;


// Белый список разрешённых хостов для API
