/* app.js */
'use strict';

const API_BASE    = 'https://103.75.126.27.sslip.io';
const LS_CACHE_KEY = 'proxy_cache';

let currentProxy = null;
let statsInterval = null;

// в”Ђв”Ђ Fetch СЃ Р¶С‘СЃС‚РєРёРј С‚Р°Р№РјР°СѓС‚РѕРј в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function fetchTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

// в”Ђв”Ђ Р’Р°Р»РёРґР°С‚РѕСЂС‹ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function isValidHost(v) {
  if (typeof v !== 'string') return false;
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[a-zA-Z0-9][a-zA-Z0-9\-.]{0,251}[a-zA-Z0-9]$/.test(v);
}
function isValidPort(v) { const n = +v; return Number.isInteger(n) && n >= 1 && n <= 65535; }
function isValidSecret(v) { return typeof v === 'string' && /^[0-9a-fA-F+/=]{32,300}$/.test(v); }

// в”Ђв”Ђ РљРµС€ РїСЂРѕРєСЃРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function saveCache(p) { try { localStorage.setItem(LS_CACHE_KEY, JSON.stringify(p)); } catch {} }
function loadCache() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_CACHE_KEY) || 'null');
    if (d && isValidHost(d.ip) && isValidPort(d.port) && isValidSecret(d.secret)) return d;
  } catch {}
  return null;
}

// в”Ђв”Ђ РЎС‚Р°С‚СѓСЃ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

// в”Ђв”Ђ РџРѕР»СѓС‡РёС‚СЊ РїСЂРѕРєСЃРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function getNewProxy() {
  ['qrContainer','linkBox','telegramLink','copyBtn','shareBtn','proxyStats']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  const btn = document.getElementById('getProxyBtn');
  if (btn) btn.disabled = true;
  setStatus('loading', 'РџРѕРґР±РёСЂР°РµРј...');

  try {
    const r = await fetchTimeout(API_BASE + '/best-node', 8000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();

    if (!isValidHost(data.ip))       throw new Error('РџР»РѕС…РѕР№ IP');
    if (!isValidPort(data.port))     throw new Error('РџР»РѕС…РѕР№ РїРѕСЂС‚');
    if (!isValidSecret(data.secret)) throw new Error('РџР»РѕС…РѕР№ СЃРµРєСЂРµС‚');

    currentProxy = data;
    saveCache(data);
    renderProxy(data, false);
    startStats(data.ip);

  } catch (err) {
    console.error('[proxy]', err.message);
    const cached = loadCache();
    if (cached) {
      currentProxy = cached;
      renderProxy(cached, true);
      return;
    }
    setStatus('error', 'вќЊ ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'рџ”„ РџРѕРїСЂРѕР±РѕРІР°С‚СЊ СЃРЅРѕРІР°'; }
  }
}

// в”Ђв”Ђ РџРѕРєР°Р· РїСЂРѕРєСЃРё в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

  // QR-РєРѕРґ
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

  setStatus(fromCache ? 'loading' : '', fromCache ? 'вљ пёЏ РљРµС€ (СЃС‚Р°СЂС‹Рµ РґР°РЅРЅС‹Рµ)' : 'Р“РѕС‚РѕРІРѕ');

  const btn = document.getElementById('getProxyBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'рџ”„ Р”СЂСѓРіРѕР№ РїСЂРѕРєСЃРё'; }
}

// в”Ђв”Ђ РЎС‚Р°С‚РёСЃС‚РёРєР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function startStats(ip) {
  if (statsInterval) clearInterval(statsInterval);
  loadStats(ip);
  statsInterval = setInterval(() => { if (currentProxy) loadStats(currentProxy.ip); }, 30000);
}

function loadStats(ip) {
  fetchTimeout(API_BASE + '/node-stats/' + encodeURIComponent(ip), 5000)
    .then(r => r.ok ? r.json() : null).then(d => {
      const el = document.getElementById('proxyStats');
      if (!d || !el) return;
      const pu = document.getElementById('proxyUsers');
      if (pu) pu.textContent = d.current_users || 0;
      el.style.display = 'block';
    }).catch(() => {});

  fetchTimeout(API_BASE + '/total-stats', 5000)
    .then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const tu = document.getElementById('totalUsers');
      const ni = document.getElementById('networkInfo');
      const ns = document.getElementById('networkStats');
      if (tu) tu.textContent = (d.total_users || 0).toLocaleString('ru-RU');
      if (ni) ni.textContent = (d.total_nodes || 0) + ' СЃРµСЂРІРµСЂРѕРІ вЂў Р—Р°РіСЂСѓР·РєР° ' + (d.load_percentage || 0) + '%';
      if (ns) ns.style.display = 'block';
    }).catch(() => {});
}

// в”Ђв”Ђ РљРѕРїРёСЂРѕРІР°РЅРёРµ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function copyLink() {
  if (!currentProxy) return;
  const url = 'https://t.me/proxy?server=' + encodeURIComponent(currentProxy.ip) +
    '&port=' + currentProxy.port + '&secret=' + encodeURIComponent(currentProxy.secret);
  try { await navigator.clipboard.writeText(url); showToast('РЎРєРѕРїРёСЂРѕРІР°РЅРѕ!'); }
  catch { showToast('РЎРєРѕРїРёСЂСѓР№ РІСЂСѓС‡РЅСѓСЋ РёР· РїРѕР»СЏ'); }
}

// в”Ђв”Ђ РџРѕРґРµР»РёС‚СЊСЃСЏ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function shareProxy() {
  if (!navigator.share) return;
  const text = 'рџљЂ Р‘РµСЃРїР»Р°С‚РЅС‹Р№ MTProxy РґР»СЏ Telegram\nРћР±С…РѕРґРё Р±Р»РѕРєРёСЂРѕРІРєСѓ Р·Р° 10 СЃРµРєСѓРЅРґ вЂ” Р±РµР· VPN\n\nвњ… Р‘РµСЃРїР»Р°С‚РЅРѕ  вњ… Р‘РµР· СЂРµРіРёСЃС‚СЂР°С†РёРё\n\nрџ“ў РљР°РЅР°Р»: t.me/telegaLIFEpls';
  try {
    const img = await fetch('./og-preview.png');
    if (img.ok) {
      const blob = await img.blob();
      const file = new File([blob], 'proxy.png', { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Р¤РёРєСЃ РўРµР»РµРіСЂР°Рј', text, url: 'https://cuk3.github.io/', files: [file] });
        return;
      }
    }
  } catch {}
  try { await navigator.share({ title: 'Р¤РёРєСЃ РўРµР»РµРіСЂР°Рј', text, url: 'https://cuk3.github.io/' }); }
  catch (e) { if (e.name !== 'AbortError') console.warn(e); }
}

// в”Ђв”Ђ Toast в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// в”Ђв”Ђ РЎС‚Р°СЂС‚ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
window.addEventListener('load', getNewProxy);

window.getNewProxy = getNewProxy;
window.copyLink    = copyLink;
window.shareProxy  = shareProxy;

