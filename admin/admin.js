/* Админка Ателье Инари — статика на GitHub Pages.
   Авторизация: пароль расшифровывает PAT (AES-GCM) → PAT шлёт GitHub API. */
(() => {
'use strict';

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => root.querySelectorAll(sel);

const SESSION_KEY = 'inari_admin_token_v1';

const state = {
  token: null,
  services: [],
  servicesOrig: [],
  gallery: [],
  galleryOrig: [],
};

/* ───────── HTML escape ───────── */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])
);

/* ───────── Crypto (AES-GCM + PBKDF2) ───────── */
async function decryptToken(b64Payload, password) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const p = JSON.parse(atob(b64Payload));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(p.salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(p.iv) },
    key,
    new Uint8Array(p.data)
  );
  return dec.decode(plain);
}

/* ───────── Login ───────── */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = $('#password').value;
  const errEl = $('#login-error');
  errEl.hidden = true;
  const cfg = window.ADMIN_CONFIG;
  if (!cfg || !cfg.encryptedToken || cfg.encryptedToken.indexOf('СЮДА') === 0) {
    errEl.textContent = 'Админка не настроена: токен ещё не вставлен в config.js.';
    errEl.hidden = false;
    return;
  }
  showLoading('Проверка пароля…');
  try {
    const token = await decryptToken(cfg.encryptedToken, pwd);
    // verify via GitHub
    const r = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, {
      headers: { Authorization: `token ${token}` }
    });
    if (!r.ok) throw new Error('GitHub auth failed');
    state.token = token;
    sessionStorage.setItem(SESSION_KEY, token);
    hideLoading();
    await enterApp();
  } catch (err) {
    hideLoading();
    errEl.textContent = 'Неверный пароль';
    errEl.hidden = false;
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    state.token = saved;
    await enterApp();
  }
});

async function enterApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  showLoading('Загружаем данные…');
  try {
    await Promise.all([loadServices(), loadGallery()]);
    renderServices();
    renderGallery();
  } catch (e) {
    toast('Не удалось загрузить данные: ' + e.message, 'error');
  } finally {
    hideLoading();
  }
}

$('#logout').addEventListener('click', () => {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
});

/* ───────── Tabs ───────── */
$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    $$('.pane').forEach(p => { p.hidden = p.dataset.pane !== target; });
  });
});

/* ───────── Загрузка данных ───────── */
async function loadServices() {
  const r = await fetch('../data/services.json?t=' + Date.now());
  if (!r.ok) throw new Error('services.json: ' + r.status);
  const data = await r.json();
  state.services     = deepClone(data);
  state.servicesOrig = deepClone(data);
}
async function loadGallery() {
  const r = await fetch('../data/gallery.json?t=' + Date.now());
  if (!r.ok) throw new Error('gallery.json: ' + r.status);
  const data = await r.json();
  state.gallery     = data.map(g => ({ file: g.file, alt: g.alt || '' }));
  state.galleryOrig = deepClone(state.gallery);
}
const deepClone = (x) => JSON.parse(JSON.stringify(x));

/* ───────── Услуги ───────── */
function renderServices() {
  const ul = $('#svc-list');
  ul.innerHTML = '';
  state.services.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'svc-item';
    li.innerHTML =
      `<div class="num">— ${esc(s.id)}</div>` +
      `<div class="body">` +
        `<div class="name">${esc(s.name)}${s.highlight ? ' <em>' + esc(s.highlight) + '</em>' : ''}</div>` +
        `<div class="desc">${esc(s.description)}</div>` +
      `</div>` +
      `<div class="actions">` +
        `<button class="btn-ghost" data-act="edit" data-i="${i}">Изменить</button>` +
        `<button class="btn-ghost" data-act="del"  data-i="${i}">Удалить</button>` +
      `</div>`;
    ul.appendChild(li);
  });
  updateSvcDirty();
}

$('#svc-list').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const i = +btn.dataset.i;
  if (btn.dataset.act === 'edit') openSvcModal(i);
  if (btn.dataset.act === 'del') {
    confirmModal(
      'Удалить услугу?',
      `«${state.services[i].name}» будет удалена. Сохраните, чтобы изменения попали на сайт.`,
      () => { state.services.splice(i, 1); renderServices(); }
    );
  }
});

$('#svc-add').addEventListener('click', () => openSvcModal(-1));

let svcEditIndex = -1;
function openSvcModal(i) {
  svcEditIndex = i;
  const form = $('#svc-form');
  const fId = form.elements['id'];
  const fName = form.elements['name'];
  const fHl = form.elements['highlight'];
  const fDesc = form.elements['description'];
  if (i >= 0) {
    const s = state.services[i];
    fId.value = s.id;
    fName.value = s.name;
    fHl.value = s.highlight || '';
    fDesc.value = s.description;
    $('#svc-modal-title').textContent = 'Редактировать услугу';
  } else {
    form.reset();
    const maxId = state.services.reduce((m, s) => Math.max(m, parseInt(s.id, 10) || 0), 0);
    fId.value = String(maxId + 1).padStart(2, '0');
    $('#svc-modal-title').textContent = 'Новая услуга';
  }
  $('#svc-modal').hidden = false;
  setTimeout(() => fName.focus(), 30);
}

$('#svc-modal').addEventListener('click', (e) => {
  if (e.target === $('#svc-modal') || (e.target.dataset && e.target.dataset.close !== undefined)) {
    $('#svc-modal').hidden = true;
  }
});

$('#svc-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const data = {
    id:          form.elements['id'].value.trim(),
    name:        form.elements['name'].value.trim(),
    highlight:   form.elements['highlight'].value.trim(),
    description: form.elements['description'].value.trim()
  };
  if (!data.id || !data.name || !data.description) return;
  if (svcEditIndex >= 0) state.services[svcEditIndex] = data;
  else state.services.push(data);
  $('#svc-modal').hidden = true;
  renderServices();
});

function updateSvcDirty() {
  const dirty = JSON.stringify(state.services) !== JSON.stringify(state.servicesOrig);
  $('#svc-save').disabled = !dirty;
  $('#svc-dirty').hidden = !dirty;
}

/* ───────── Галерея ───────── */
function renderGallery() {
  const grid = $('#gal-grid');
  grid.innerHTML = '';
  state.gallery.forEach((g, i) => {
    const el = document.createElement('div');
    el.className = 'gal-item' + (g._isNew ? ' new' : '');
    const src = g._isNew ? g._dataUrl : `../${encodeURIComponent(g.file)}.webp`;
    el.innerHTML =
      `<div class="thumb" style="background-image:url('${src.replace(/'/g, "%27")}')"></div>` +
      `<div class="meta">` +
        `<input class="alt-input" type="text" value="${esc(g.alt || '')}" placeholder="Подпись" data-i="${i}" />` +
        `<div class="gal-actions">` +
          `<span class="filename" title="${esc(g.file)}">${esc(g.file)}</span>` +
          `<button class="del" data-i="${i}">Удалить</button>` +
        `</div>` +
      `</div>`;
    grid.appendChild(el);
  });
  updateGalDirty();
}

$('#gal-grid').addEventListener('input', (e) => {
  if (e.target.classList && e.target.classList.contains('alt-input')) {
    const i = +e.target.dataset.i;
    state.gallery[i].alt = e.target.value;
    updateGalDirty();
  }
});

$('#gal-grid').addEventListener('click', (e) => {
  const btn = e.target.closest('button.del');
  if (!btn) return;
  const i = +btn.dataset.i;
  const g = state.gallery[i];
  confirmModal(
    'Удалить фото?',
    `«${g.file}» будет удалено с сайта. Сохраните, чтобы изменения вступили в силу.`,
    () => { state.gallery.splice(i, 1); renderGallery(); }
  );
});

$('#gal-upload').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;
  showLoading('Конвертация в WebP…');
  try {
    for (const file of files) {
      const { dataUrl, blob } = await convertToWebP(file);
      const name = `photo-${Date.now()}-${Math.floor(Math.random()*9000+1000)}`;
      state.gallery.push({
        file: name,
        alt: 'Работа мастерской',
        _isNew: true,
        _dataUrl: dataUrl,
        _blob: blob,
      });
    }
    renderGallery();
  } catch (err) {
    toast('Ошибка при конвертации: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

async function convertToWebP(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Не удалось загрузить изображение'));
      i.src = url;
    });
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('Браузер не поддерживает WebP')), 'image/webp', 0.85)
    );
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return { blob, dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function updateGalDirty() {
  const clean = state.gallery.map(g => ({ file: g.file, alt: g.alt || '' }));
  const dirty = JSON.stringify(clean) !== JSON.stringify(state.galleryOrig);
  $('#gal-save').disabled = !dirty;
  $('#gal-dirty').hidden = !dirty;
}

/* ───────── Confirm modal ───────── */
let confirmCb = null;
function confirmModal(title, text, cb) {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  confirmCb = cb;
  $('#confirm-modal').hidden = false;
}
$('[data-confirm-cancel]').addEventListener('click', () => {
  $('#confirm-modal').hidden = true; confirmCb = null;
});
$('[data-confirm-ok]').addEventListener('click', () => {
  $('#confirm-modal').hidden = true;
  if (confirmCb) { const cb = confirmCb; confirmCb = null; cb(); }
});

/* ───────── Сохранение услуг (services.json + index.html в один коммит) ───────── */
$('#svc-save').addEventListener('click', async () => {
  if ($('#svc-save').disabled) return;
  showLoading('Сохраняем услуги…');
  try {
    const servicesJson = JSON.stringify(state.services, null, 2) + '\n';
    const indexHtml = await updateIndexHtmlServices(state.services);
    await commitFiles(
      [
        { path: 'data/services.json', content: servicesJson, encoding: 'utf-8' },
        { path: 'index.html',         content: indexHtml,    encoding: 'utf-8' },
      ],
      [],
      'admin: обновлены услуги'
    );
    state.servicesOrig = deepClone(state.services);
    updateSvcDirty();
    toast('Сохранено! Сайт обновится через 1–2 минуты', 'success');
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

async function updateIndexHtmlServices(services) {
  const r = await fetch('../index.html?t=' + Date.now());
  if (!r.ok) throw new Error('index.html: ' + r.status);
  const html = await r.text();
  const delays = ['d1','d2','d3','d4','d1','d2','d3','d4'];
  const items = services.map((s, i) => {
    const hl = s.highlight
      ? ` <em style="font-style:italic;color:var(--gold)">${esc(s.highlight)}</em>`
      : '';
    return [
      `      <li class="svc reveal ${delays[i % delays.length]}">`,
      `        <div class="svc-num">— ${esc(s.id)}</div>`,
      `        <div class="svc-name">${esc(s.name)}${hl}</div>`,
      `        <div class="svc-desc">${esc(s.description)}</div>`,
      `        <div class="svc-arrow">→</div>`,
      `      </li>`,
    ].join('\n');
  }).join('\n');
  const re = /(<ul class="svc-list"[^>]*>)[\s\S]*?(<\/ul>)/;
  if (!re.test(html)) throw new Error('Не найден блок <ul class="svc-list"> в index.html');
  return html.replace(re, `$1\n${items}\n    $2`);
}

/* ───────── Сохранение галереи ───────── */
$('#gal-save').addEventListener('click', async () => {
  if ($('#gal-save').disabled) return;
  showLoading('Сохраняем галерею…');
  try {
    const files = [];
    for (const g of state.gallery) {
      if (g._isNew && g._blob) {
        const b64 = await blobToBase64(g._blob);
        files.push({ path: `${g.file}.webp`, content: b64, encoding: 'base64' });
      }
    }
    const cleanGallery = state.gallery.map(g => ({ file: g.file, alt: g.alt || '' }));
    files.push({
      path: 'data/gallery.json',
      content: JSON.stringify(cleanGallery, null, 2) + '\n',
      encoding: 'utf-8'
    });
    const current = new Set(state.gallery.map(g => g.file));
    const removed = state.galleryOrig.map(g => g.file).filter(f => !current.has(f));
    // Удаляем и .webp, и .avif (если есть). filterExistingPaths уберёт несуществующие.
    const deleteCandidates = removed.flatMap(f => [`${f}.webp`, `${f}.avif`]);
    const deletes = await filterExistingPaths(deleteCandidates);

    await commitFiles(files, deletes, 'admin: обновлена галерея');

    state.gallery = cleanGallery;
    state.galleryOrig = deepClone(cleanGallery);
    renderGallery();
    toast('Сохранено! Сайт обновится через 1–2 минуты', 'success');
  } catch (err) {
    toast('Ошибка: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
});

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); };
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function utf8ToBase64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}

/* ───────── GitHub Git Data API ───────── */
async function ghFetch(url, opts = {}) {
  const headers = {
    Authorization: `token ${state.token}`,
    Accept: 'application/vnd.github+json',
    ...(opts.headers || {})
  };
  if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...opts, headers });
  if (!r.ok) {
    let detail = '';
    try { detail = (await r.json()).message || ''; } catch {}
    throw new Error(`GitHub ${r.status}: ${detail || r.statusText}`);
  }
  return r.json();
}

async function filterExistingPaths(paths) {
  if (!paths.length) return [];
  const { owner, repo, branch } = window.ADMIN_CONFIG;
  const ref = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`);
  const commit = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const tree = await ghFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const existing = new Set((tree.tree || []).map(t => t.path));
  return paths.filter(p => existing.has(p));
}

async function commitFiles(files, deletedPaths, message) {
  const { owner, repo, branch } = window.ADMIN_CONFIG;
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  const ref = await ghFetch(`${base}/git/refs/heads/${branch}`);
  const parentSha = ref.object.sha;
  const parentCommit = await ghFetch(`${base}/git/commits/${parentSha}`);

  const tree = [];
  for (const f of files) {
    const content = f.encoding === 'base64' ? f.content : utf8ToBase64(f.content);
    const blob = await ghFetch(`${base}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding: 'base64' })
    });
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  for (const p of (deletedPaths || [])) {
    tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
  }
  if (!tree.length) throw new Error('Нет изменений для коммита');

  const newTree = await ghFetch(`${base}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree })
  });
  const newCommit = await ghFetch(`${base}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: newTree.sha, parents: [parentSha] })
  });
  await ghFetch(`${base}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha })
  });
  return newCommit.sha;
}

/* ───────── UI: loading + toast ───────── */
function showLoading(text) {
  $('#loading .overlay-text').textContent = text || 'Сохраняем…';
  $('#loading').hidden = false;
}
function hideLoading() { $('#loading').hidden = true; }

let toastTimer = null;
function toast(text, kind) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
}

})();
