/* -------------------------------------------------------
   Proxy Landing — app.js
   Безопасность + улучшения UX/надёжности
------------------------------------------------------- */

'use strict';

// ── Константы ────────────────────────────────────────────
const DEAD_DROP_URL =
  'https://gist.githubusercontent.com/cuk3/04c44a18430914d72a83450c3cf78b54/raw';

const FALLBACK_API_URL = 'https://103.75.126.27.sslip.io';

// Белый список разрешённых хостов для API
const ALLOWED_API_HOSTS = [
  '103.75.126.27.sslip.io',
];

const FETCH_TIMEOUT_MS = 6_000;
const RETRY_DELAYS_MS  = [1_500, 3_000];
const LS_CACHE_KEY     = 'proxy_cache';

// ── Состояние ────────────────────────────────────────────
let API_URL      = '';
let currentProxy = null;
let statsInterval = null;

// ── DOM-элементы ─────────────────────────────────────────
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

/**
 * Проверяет, что URL начинается с https:// и хост входит в белый список.
 * Если белый список пуст — разрешает любой https-хост.
 */
function isAllowedApiUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (ALLOWED_API_HOSTS.length === 0) return true;
    return ALLOWED_API_HOSTS.includes(url.host);
  } catch {
    return false;
  }
}

/** IPv4 или валидный hostname (без спецсимволов) */
function isValidHost(ip) {
  if (typeof ip !== 'string') return false;
  // IPv4
  const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(n => Number(n) >= 0 && Number(n) <= 255);
  // Hostname (напр. example.com) — только буквы, цифры, дефисы, точки
  const hostname = /^[a-zA-Z0-9][a-zA-Z0-9\-.]{0,251}[a-zA-Z0-9]$/.test(ip);
  return ipv4 || hostname;
}

/** Порт в диапазоне 1-65535 */
function isValidPort(port) {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/**
 * MTProxy secret:
 *   - 32 символа HEX (base mode)
 *   - "dd" + 32 HEX      (dd-mode)
 *   - "ee" + HEX + domain (FakeTLS)
 * Разрешаем hex + base64-символы длиной 32–300 знаков.
 */
function isValidSecret(secret) {
  if (typeof secret !== 'string') return false;
  return /^[0-9a-fA-F+/=]{32,300}$/.test(secret);
}

// ── Fetch с таймаутом ────────────────────────────────────
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Retry с экспоненциальной задержкой ───────────────────
async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (err) {
      lastError = err;
      // Не делаем retry при AbortError (таймаут) — сразу падаем в фоллбэк
      if (err.name === 'AbortError') break;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastError;
}

// ── Кеш прокси в localStorage ────────────────────────────
function saveCachedProxy(proxy) {
  try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(proxy)); } catch {}
}

function loadCachedProxy() {
  try {
    const data = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || 'null');
    if (data && isValidHost(data.ip) && isValidPort(data.port) && isValidSecret(data.secret)) {
      return data;
    }
  } catch {}
  return null;
}

// ── Dead Drop: получить API URL ──────────────────────────
async function getAPIUrl() {
  try {
    const response = await fetchWithTimeout(DEAD_DROP_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('Dead Drop HTTP ' + response.status);

    const data = await response.json();
    const candidate = data.api_url || data.control_api;

    if (!candidate || !isAllowedApiUrl(candidate)) {
      throw new Error('Dead Drop вернул недопустимый URL: ' + candidate);
    }

    API_URL = candidate;
    return API_URL;
  } catch (error) {
    console.warn('Dead Drop недоступен, используем запасной URL.', error);
    API_URL = FALLBACK_API_URL;
    return API_URL;
  }
}

// ── Статистика сети ──────────────────────────────────────
async function loadNetworkStats() {
  try {
    if (!API_URL) await getAPIUrl();

    const response = await fetchWithTimeout(`${API_URL}/total-stats`);
    if (!response.ok) return;

    const data = await response.json();

    // Валидация чисел перед подстановкой в DOM
    const users    = Number.isFinite(data.total_users)    ? data.total_users    : 0;
    const nodes    = Number.isFinite(data.total_nodes)    ? data.total_nodes    : 0;
    const loadPct  = Number.isFinite(data.load_percentage)? data.load_percentage: 0;

    totalUsers.textContent = users.toLocaleString('ru-RU');
    networkInfo.textContent = `${nodes} серверов • Загрузка ${loadPct}%`;
    networkStats.style.display = 'block';
  } catch (error) {
    console.warn('Network stats error:', error);
  }
}

// ── Статистика конкретного прокси ────────────────────────
async function loadProxyStats(ip) {
  try {
    if (!API_URL) await getAPIUrl();
    if (!isValidHost(ip)) return;

    // IP в URL-пути — энкодируем на случай нестандартных символов
    const response = await fetchWithTimeout(
      `${API_URL}/node-stats/${encodeURIComponent(ip)}`
    );
    if (!response.ok) {
      proxyStats.style.display = 'none';
      return;
    }

    const data = await response.json();
    const cu = Number.isFinite(data.current_users) ? data.current_users : 0;
    proxyUsers.textContent = String(cu);
    proxyStats.style.display = 'block';
  } catch (error) {
    console.warn('Proxy stats error:', error);
    proxyStats.style.display = 'none';
  }
}

// ── Периодическое обновление статистики ──────────────────
function startStatsUpdate(ip) {
  if (statsInterval) clearInterval(statsInterval);

  loadProxyStats(ip);
  loadNetworkStats();

  statsInterval = setInterval(() => {
    if (currentProxy) loadProxyStats(currentProxy.ip);
    loadNetworkStats();
  }, 30_000);
}

// ── Показать прокси в UI ─────────────────────────────────
function renderProxy(data, fromCache = false) {
  const safeIp     = encodeURIComponent(data.ip);
  const safePort   = Number(data.port);
  const safeSecret = encodeURIComponent(data.secret);

  const proxyUrl       = `https://t.me/proxy?server=${safeIp}&port=${safePort}&secret=${safeSecret}`;
  const proxyUrlDirect = `tg://proxy?server=${safeIp}&port=${safePort}&secret=${safeSecret}`;

  linkBox.textContent = proxyUrl;
  telegramLink.href   = proxyUrlDirect;

  // QR-код — цвета адаптируем под тёмную тему
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.getElementById('qrcode').textContent = '';
  new QRCode(document.getElementById('qrcode'), {
    text: proxyUrlDirect,
    width: 150,
    height: 150,
    colorDark:  isDark ? '#e2e8f0' : '#1a1a1a',
    colorLight: isDark ? '#2a2a3e' : '#f7f9fc',
    correctLevel: QRCode.CorrectLevel.M,
  });

  // Плавное появление QR
  qrContainer.style.display = 'flex';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => qrContainer.classList.remove('hidden'));
  });

  linkBox.style.display      = 'block';
  telegramLink.style.display = 'flex';
  copyBtn.style.display      = 'flex';
  if (navigator.share) shareBtn.style.display = 'flex';

  // Статус — очищаем старые точки перед добавлением новой
  statusEl.className = fromCache ? 'status loading' : 'status';
  statusEl.querySelectorAll('.status-dot, .spinner').forEach(el => el.remove());
  statusTextEl.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  statusEl.insertBefore(dot, statusTextEl);
  statusTextEl.textContent = fromCache ? ' Кеш (получаем новый…)' : ' Готов';

  getProxyBtn.disabled    = false;
  getProxyBtn.textContent = '🔄 Другой прокси';
}

// ── Получить новый прокси ────────────────────────────────
async function getNewProxy() {
  // Скрыть QR с анимацией
  qrContainer.classList.add('hidden');
  setTimeout(() => {
    if (qrContainer.classList.contains('hidden')) qrContainer.style.display = 'none';
  }, 380);

  linkBox.style.display      = 'none';
  telegramLink.style.display = 'none';
  copyBtn.style.display      = 'none';
  shareBtn.style.display     = 'none';
  proxyStats.style.display   = 'none';

  statusEl.className       = 'status loading';
  statusTextEl.textContent = 'Подбираем...';
  getProxyBtn.disabled     = true;

  try {
    if (!API_URL) await getAPIUrl();

    const response = await fetchWithRetry(`${API_URL}/best-node`);
    if (!response.ok) throw new Error('Нет доступных прокси');

    const data = await response.json();

    if (!isValidHost(data.ip))       throw new Error('Недопустимый IP от сервера');
    if (!isValidPort(data.port))     throw new Error('Недопустимый порт от сервера');
    if (!isValidSecret(data.secret)) throw new Error('Недопустимый секрет от сервера');

    currentProxy = data;
    saveCachedProxy(data);
    renderProxy(data, false);
    startStatsUpdate(data.ip);

  } catch (error) {
    console.error('Error:', error);

    // Фоллбэк: кешированный прокси из localStorage
    const cached = loadCachedProxy();
    if (cached) {
      console.warn('API недоступен, показываем кешированный прокси');
      currentProxy = cached;
      renderProxy(cached, true);
      return;
    }

    statusEl.className       = 'status error';
    statusTextEl.textContent = '❌ ' + error.message;
    getProxyBtn.disabled     = false;
    getProxyBtn.textContent  = '🔄 Попробовать снова';
  }
}

// ── Копирование ссылки ───────────────────────────────────
async function copyLink() {
  if (!currentProxy) return;

  const safeIp     = encodeURIComponent(currentProxy.ip);
  const safePort   = Number(currentProxy.port);
  const safeSecret = encodeURIComponent(currentProxy.secret);
  const proxyUrl   = `https://t.me/proxy?server=${safeIp}&port=${safePort}&secret=${safeSecret}`;

  try {
    await navigator.clipboard.writeText(proxyUrl);
  } catch {
    const range = document.createRange();
    range.selectNode(linkBox);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    document.execCommand('copy');
    window.getSelection()?.removeAllRanges();
  }

  showToast('Ссылка скопирована!');
}

// ── Web Share API ─────────────────────────────────────────
async function shareProxy() {
  if (!currentProxy || !navigator.share) return;

  const safeIp     = encodeURIComponent(currentProxy.ip);
  const safePort   = Number(currentProxy.port);
  const safeSecret = encodeURIComponent(currentProxy.secret);
  const proxyUrl   = `https://t.me/proxy?server=${safeIp}&port=${safePort}&secret=${safeSecret}`;

  try {
    await navigator.share({
      title: 'Рабочий MTProxy для Telegram',
      text:  'Бесплатный прокси — обходи блокировку без VPN',
      url:   proxyUrl,
    });
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('Share error:', err);
  }
}

// ── Toast-уведомление ────────────────────────────────────
function showToast(text = 'Готово!') {
  const toast = document.getElementById('toast');
  toast.textContent = text;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Регистрация Service Worker (PWA) ─────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Путь относительный — работает и на github.io/repo/, и на кастомном домене
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  });
}

// ── Инициализация ────────────────────────────────────────
window.addEventListener('load', () => {
  getNewProxy();
  loadNetworkStats();
});

window.addEventListener('beforeunload', () => {
  if (statsInterval) clearInterval(statsInterval);
});

// Экспорт обработчиков для onclick в HTML
window.getNewProxy = getNewProxy;
window.copyLink    = copyLink;
window.shareProxy  = shareProxy;
