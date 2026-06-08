// ===========================================================================
// Atelier OLDA — cockpit frontend (vanilla ES module, aucun build)
// ===========================================================================

// --- Étapes : groupes pour les séparateurs (3 blocs). ----------------------
const STAGE_GROUPS = [
  [
    { slug: 'demande', label: 'Demande' },
    { slug: 'devis_en_cours', label: 'Devis en cours' },
    { slug: 'devis_accepte', label: 'Devis accepté' },
  ],
  [
    { slug: 'prod_dtf', label: 'Production DTF' },
    { slug: 'prod_pressage', label: 'Production Pressage' },
    { slug: 'prod_trotec', label: 'Production Trotec' },
    { slug: 'prod_roland_uv', label: 'Production Roland UV' },
    { slug: 'prod_sous_traitance', label: 'Production Sous-traitance' },
    { slug: 'prod_autre', label: 'Production Autre' },
  ],
  [
    { slug: 'facturation', label: 'Facturation' },
    { slug: 'archive', label: 'Archivé' },
    { slug: 'maquette_fiverr', label: 'Demande Maquette Fiverr' },
    { slug: 'toptex', label: 'Toptex' },
  ],
];
const STAGES = STAGE_GROUPS.flat();
const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.slug, s.label]));

// --- État applicatif -------------------------------------------------------
let currentStage = 'demande';
let rows = [];                 // demandes de l'étape courante
let counts = {};               // compteurs par étape
let sort = { key: null, dir: 1 }; // tri manuel via en-têtes (null = tri par défaut)

// --- Sélecteurs ------------------------------------------------------------
const $stages = document.getElementById('stages');
const $rows = document.getElementById('rows');
const $empty = document.getElementById('empty');
const $stageTitle = document.getElementById('stageTitle');
const $stageCount = document.getElementById('stageCount');
const $btnNew = document.getElementById('btnNew');

// --- API helpers -----------------------------------------------------------
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).error || detail; } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

// --- Rendu sidebar ---------------------------------------------------------
function renderSidebar() {
  $stages.innerHTML = '';
  STAGE_GROUPS.forEach((group, gi) => {
    group.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'stage' + (s.slug === currentStage ? ' active' : '');
      el.dataset.slug = s.slug;
      const n = counts[s.slug] ?? 0;
      el.innerHTML = `<span class="stage-label">${escapeHtml(s.label)}</span>` +
        `<span class="stage-count${n > 0 ? ' has-items' : ''}">${n}</span>`;
      el.addEventListener('click', () => selectStage(s.slug));
      attachDrop(el, s.slug);
      $stages.appendChild(el);
    });
    if (gi < STAGE_GROUPS.length - 1) {
      const hr = document.createElement('hr');
      hr.className = 'stage-sep';
      $stages.appendChild(hr);
    }
  });
}

function selectStage(slug) {
  currentStage = slug;
  sort = { key: null, dir: 1 };
  $stageTitle.textContent = STAGE_LABEL[slug];
  document.querySelectorAll('.stage').forEach((el) => {
    el.classList.toggle('active', el.dataset.slug === slug);
  });
  loadRows();
}

// --- Chargement données ----------------------------------------------------
async function loadCounts() {
  counts = await api('GET', '/api/counts');
  document.querySelectorAll('.stage').forEach((el) => {
    const c = el.querySelector('.stage-count');
    if (c) {
      const n = counts[el.dataset.slug] ?? 0;
      c.textContent = n;
      c.classList.toggle('has-items', n > 0);
    }
  });
}

async function loadRows() {
  rows = await api('GET', `/api/requests?stage=${encodeURIComponent(currentStage)}`);
  lastRowsSig = signature(rows);
  applySortAndRender();
}

// --- Tri -------------------------------------------------------------------
function applySortAndRender() {
  const data = [...rows];
  if (sort.key) {
    data.sort((a, b) => cmp(a, b, sort.key) * sort.dir);
  } else {
    // tri par défaut : priorité desc, échéance asc
    data.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return cmpDeadline(a.deadline, b.deadline);
    });
  }
  renderRows(data);
  $stageCount.textContent = data.length ? `${data.length} demande${data.length > 1 ? 's' : ''}` : '';
}

function cmpDeadline(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function daysLeft(deadline) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  return Math.round((d - today) / 86400000);
}

function cmp(a, b, key) {
  if (key === 'days') {
    const da = daysLeft(a.deadline), db = daysLeft(b.deadline);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }
  let va = a[key], vb = b[key];
  if (key === 'priority' || key === 'quantity' || key === 'project_value') {
    va = va == null ? -Infinity : Number(va);
    vb = vb == null ? -Infinity : Number(vb);
    return va - vb;
  }
  va = (va ?? '').toString().toLowerCase();
  vb = (vb ?? '').toString().toLowerCase();
  return va < vb ? -1 : va > vb ? 1 : 0;
}

// --- Rendu grille ----------------------------------------------------------
function renderRows(data) {
  $rows.innerHTML = '';
  $empty.hidden = data.length > 0;
  for (const r of data) $rows.appendChild(buildRow(r));
  updateSortArrows();
}

function buildRow(r) {
  const tr = document.createElement('tr');
  tr.dataset.id = r.id;

  // poignée draggable
  const tdHandle = document.createElement('td');
  tdHandle.className = 'col-handle';
  tdHandle.innerHTML = `<div class="handle" title="glisser pour déplacer">
    <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg>
  </div>`;
  attachDrag(tdHandle.querySelector('.handle'), tr, r);
  tr.appendChild(tdHandle);

  // priorité (étoiles)
  tr.appendChild(cellStars(r));
  // type
  tr.appendChild(cellType(r));
  // société
  tr.appendChild(cellText(r, 'billing_company', 'société'));
  // référent
  tr.appendChild(cellText(r, 'contact_referent', 'référent'));
  // quantité
  tr.appendChild(cellNumber(r, 'quantity', 'qté'));
  // produits
  tr.appendChild(cellText(r, 'product', 'produits'));
  // valeur
  tr.appendChild(cellMoney(r, 'project_value'));
  // description
  tr.appendChild(cellText(r, 'description', 'description'));
  // échéance
  tr.appendChild(cellDate(r, 'deadline'));
  // jours restant (calculé)
  tr.appendChild(cellDays(r));
  // état
  tr.appendChild(cellStatus(r));
  // suppression
  const tdDel = document.createElement('td');
  tdDel.className = 'col-del';
  const del = document.createElement('button');
  del.className = 'del-btn';
  del.type = 'button';
  del.textContent = '×';
  del.title = 'Supprimer';
  del.addEventListener('click', () => removeRow(r));
  tdDel.appendChild(del);
  tr.appendChild(tdDel);

  return tr;
}

// --- Cellules ---------------------------------------------------------------
function cellStars(r) {
  const td = document.createElement('td');
  td.className = 'col-priority';
  const wrap = document.createElement('div');
  wrap.className = 'stars';
  for (let n = 1; n <= 3; n++) {
    const star = document.createElement('span');
    star.className = 'star' + (n <= r.priority ? ' on' : '');
    star.textContent = '★';
    star.title = `priorité ${n}`;
    star.addEventListener('click', () => patch(r, { priority: n }, () => {
      r.priority = n;
      [...wrap.children].forEach((s, i) => s.classList.toggle('on', i < n));
    }));
    wrap.appendChild(star);
  }
  td.appendChild(wrap);
  return td;
}

function cellType(r) {
  const td = document.createElement('td');
  td.className = 'col-type';
  const pill = document.createElement('span');
  const render = () => {
    pill.className = 'type-pill ' + (r.client_type === 'pro' ? 'pro' : 'perso');
    pill.textContent = r.client_type === 'pro' ? 'pro' : 'perso';
  };
  render();
  pill.title = 'cliquer pour basculer';
  pill.addEventListener('click', () => {
    const next = r.client_type === 'pro' ? 'perso' : 'pro';
    patch(r, { client_type: next }, () => { r.client_type = next; render(); });
  });
  td.appendChild(pill);
  return td;
}

function cellText(r, field, placeholder) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = 'text';
  input.value = r[field] ?? '';
  input.placeholder = placeholder;
  bindInline(input, r, field, (v) => v === '' ? null : v);
  td.appendChild(input);
  return td;
}

function cellNumber(r, field, placeholder) {
  const td = document.createElement('td');
  td.className = 'num';
  const input = document.createElement('input');
  input.className = 'cell-input num';
  input.type = 'number';
  input.value = r[field] ?? '';
  input.placeholder = placeholder;
  bindInline(input, r, field, (v) => v === '' ? null : parseInt(v, 10));
  td.appendChild(input);
  return td;
}

function cellMoney(r, field) {
  const td = document.createElement('td');
  td.className = 'num';
  const input = document.createElement('input');
  input.className = 'cell-input num';
  input.type = 'text';
  input.inputMode = 'decimal';
  const fmt = () => { input.value = r[field] != null ? formatMoney(r[field]) : ''; };
  fmt();
  input.placeholder = '€';
  input.addEventListener('focus', () => {
    input.value = r[field] != null ? String(r[field]) : '';
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  input.addEventListener('blur', () => {
    const raw = input.value.replace(/\s/g, '').replace(',', '.').replace('€', '');
    const val = raw === '' ? null : Number(raw);
    if (val !== null && Number.isNaN(val)) { fmt(); return; }
    if (val === r[field]) { fmt(); return; }
    const prev = r[field];
    r[field] = val;
    fmt();
    api('PATCH', `/api/requests/${r.id}`, { project_value: val }).catch((err) => {
      r[field] = prev; fmt(); reportError(err);
    });
  });
  td.appendChild(input);
  return td;
}

function cellDate(r, field) {
  const td = document.createElement('td');
  const input = document.createElement('input');
  input.className = 'cell-input';
  input.type = 'date';
  input.value = r[field] ? r[field].slice(0, 10) : '';
  input.addEventListener('change', () => {
    const val = input.value === '' ? null : input.value;
    const prev = r[field];
    r[field] = val;
    // re-render badge jours restant
    const td2 = input.closest('tr').querySelector('.col-days');
    if (td2) td2.replaceWith(cellDays(r));
    api('PATCH', `/api/requests/${r.id}`, { deadline: val }).catch((err) => {
      r[field] = prev; input.value = prev ? prev.slice(0, 10) : ''; reportError(err);
    });
  });
  td.appendChild(input);
  return td;
}

function cellDays(r) {
  const td = document.createElement('td');
  td.className = 'col-days';
  const d = daysLeft(r.deadline);
  if (d === null) { td.innerHTML = '<span class="days-badge" style="visibility:hidden">—</span>'; return td; }
  let cls = 'green';
  if (d <= 0) cls = 'red';
  else if (d <= 7) cls = 'orange';
  const label = d <= 0 ? (d === 0 ? "aujourd'hui" : `${d} j`) : `${d} j`;
  const badge = document.createElement('span');
  badge.className = `days-badge ${cls}`;
  badge.textContent = label;
  td.appendChild(badge);
  return td;
}

const STATUS_CLASS = {
  'À traiter': 's-atraiter',
  'En attente client': 's-attente',
  'Validé': 's-valide',
  'Bloqué': 's-bloque',
  'Terminé': 's-termine',
};

function cellStatus(r) {
  const td = document.createElement('td');
  td.className = 'col-status';
  const pill = document.createElement('span');
  const render = () => {
    const val = r.status || '';
    pill.className = 'status-pill ' + (STATUS_CLASS[val] || '');
    pill.textContent = val || 'définir';
    if (!val) pill.classList.add('placeholder');
  };
  render();
  pill.title = 'cliquer pour éditer';
  pill.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.setAttribute('list', 'statusOptions');
    input.value = r.status || '';
    input.placeholder = 'état';
    td.replaceChild(input, pill);
    input.focus();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const val = input.value.trim() === '' ? null : input.value.trim();
      const prev = r.status;
      if (val !== prev) {
        r.status = val; render(); td.replaceChild(pill, input);
        api('PATCH', `/api/requests/${r.id}`, { status: val }).catch((err) => {
          r.status = prev; render(); reportError(err);
        });
      } else {
        td.replaceChild(pill, input);
      }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { done = true; td.replaceChild(pill, input); } });
    input.addEventListener('blur', commit);
  });
  td.appendChild(pill);
  return td;
}

// --- Édition inline générique (texte/nombre) ------------------------------
function bindInline(input, r, field, transform) {
  let lastSent = r[field] ?? '';
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  input.addEventListener('blur', () => {
    const raw = input.value;
    if (raw === (lastSent ?? '').toString()) return;
    const val = transform(raw);
    if (val !== null && typeof val === 'number' && Number.isNaN(val)) {
      input.value = r[field] ?? ''; return;
    }
    const prev = r[field];
    r[field] = val;
    lastSent = raw;
    api('PATCH', `/api/requests/${r.id}`, { [field]: val }).catch((err) => {
      r[field] = prev; input.value = prev ?? ''; lastSent = prev ?? ''; reportError(err);
    });
  });
}

// --- PATCH générique optimiste --------------------------------------------
function patch(r, body, applyOptimistic) {
  applyOptimistic();
  api('PATCH', `/api/requests/${r.id}`, body).catch((err) => {
    reportError(err);
    loadRows(); // resync en cas d'échec
  });
}

// --- Création --------------------------------------------------------------
$btnNew.addEventListener('click', async () => {
  try {
    const created = await api('POST', '/api/requests', { stage: currentStage });
    rows.push(created);
    applySortAndRender();
    await loadCounts();
    // focus première cellule éditable de la nouvelle ligne
    const tr = $rows.querySelector(`tr[data-id="${created.id}"]`);
    if (tr) {
      tr.scrollIntoView({ block: 'nearest' });
      const firstInput = tr.querySelector('.col-company input, .cell-input');
      if (firstInput) firstInput.focus();
    }
  } catch (err) { reportError(err); }
});

// --- Suppression -----------------------------------------------------------
async function removeRow(r) {
  const label = r.billing_company || r.product || 'cette demande';
  if (!confirm(`Supprimer « ${label} » ?`)) return;
  try {
    await api('DELETE', `/api/requests/${r.id}`);
    rows = rows.filter((x) => x.id !== r.id);
    applySortAndRender();
    await loadCounts();
  } catch (err) { reportError(err); }
}

// --- Glisser-déposer unifié souris + tactile (Pointer Events) --------------
// Fonctionne au doigt sur tablette : le DnD HTML5 ne se déclenche pas au tactile,
// on utilise donc les Pointer Events (souris, doigt et stylet unifiés).
let dragState = null;

function attachDrag(handle, tr, r) {
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragState = {
      id: r.id, r, tr, handle,
      startX: e.clientX, startY: e.clientY,
      pointerId: e.pointerId, active: false, ghost: null, grabDX: 0, grabDY: 0,
    };
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
    handle.addEventListener('pointermove', onDragMove);
    handle.addEventListener('pointerup', onDragEnd);
    handle.addEventListener('pointercancel', onDragEnd);
  });
}

function beginDrag() {
  const { tr, r, startX, startY } = dragState;
  const rect = tr.getBoundingClientRect();
  dragState.active = true;
  dragState.grabDX = startX - rect.left;
  dragState.grabDY = startY - rect.top;
  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = r.billing_company || r.product || 'demande';
  ghost.style.width = rect.width + 'px';
  document.body.appendChild(ghost);
  dragState.ghost = ghost;
  tr.classList.add('dragging');
  document.body.classList.add('dragging-active');
}

function onDragMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  if (!dragState.active) {
    if (Math.hypot(dx, dy) < 8) return; // seuil avant de démarrer le drag
    beginDrag();
  }
  e.preventDefault();
  dragState.ghost.style.left = (e.clientX - dragState.grabDX) + 'px';
  dragState.ghost.style.top = (e.clientY - dragState.grabDY) + 'px';

  const el = document.elementFromPoint(e.clientX, e.clientY);
  document.querySelectorAll('.stage.drop-target').forEach((s) => s.classList.remove('drop-target'));
  const stageEl = el && el.closest ? el.closest('.stage') : null;
  if (stageEl) {
    if (stageEl.dataset.slug !== dragState.r.stage) stageEl.classList.add('drop-target');
  } else {
    // réordonnancement vertical dans la grille
    const after = getDragAfterElement($rows, e.clientY);
    if (after == null) $rows.appendChild(dragState.tr);
    else if (after !== dragState.tr) $rows.insertBefore(dragState.tr, after);
  }
  autoScroll(e.clientY);
}

async function onDragEnd(e) {
  if (!dragState) return;
  const ds = dragState;
  ds.handle.removeEventListener('pointermove', onDragMove);
  ds.handle.removeEventListener('pointerup', onDragEnd);
  ds.handle.removeEventListener('pointercancel', onDragEnd);
  try { ds.handle.releasePointerCapture(ds.pointerId); } catch (_) {}

  if (!ds.active) { dragState = null; return; } // simple clic, pas un drag

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const stageEl = el && el.closest ? el.closest('.stage') : null;

  if (ds.ghost) ds.ghost.remove();
  ds.tr.classList.remove('dragging');
  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.stage.drop-target').forEach((s) => s.classList.remove('drop-target'));
  dragState = null;

  if (stageEl && stageEl.dataset.slug !== ds.r.stage) {
    await moveToStage(ds.r, stageEl.dataset.slug);
  } else {
    await commitReorder(ds.r);
  }
}

async function moveToStage(r, slug) {
  try {
    await api('PATCH', `/api/requests/${r.id}`, { stage: slug });
    rows = rows.filter((x) => x.id !== r.id);
    applySortAndRender();
    await loadCounts();
  } catch (err) { reportError(err); loadRows(); }
}

async function commitReorder(r) {
  const siblings = [...$rows.querySelectorAll('tr')];
  const idx = siblings.findIndex((el) => el.dataset.id === r.id);
  const posOf = (el) => el ? (rows.find((x) => x.id === el.dataset.id)?.position ?? null) : null;
  const pPrev = posOf(siblings[idx - 1]);
  const pNext = posOf(siblings[idx + 1]);
  let newPos;
  if (pPrev == null && pNext == null) newPos = 1000;
  else if (pPrev == null) newPos = pNext - 1000;
  else if (pNext == null) newPos = pPrev + 1000;
  else newPos = (pPrev + pNext) / 2;
  const prevPos = r.position;
  if (newPos === prevPos) return;
  r.position = newPos;
  try {
    await api('PATCH', `/api/requests/${r.id}`, { position: newPos });
    sort = { key: null, dir: 1 };
    rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    lastRowsSig = signature(rows);
  } catch (err) { r.position = prevPos; reportError(err); loadRows(); }
}

// Conservé pour compat : le dépôt sidebar est géré par elementFromPoint ci-dessus.
function attachDrop() { /* géré via Pointer Events */ }

// auto-scroll vertical quand le doigt approche des bords de la grille
function autoScroll(y) {
  const wrap = document.querySelector('.grid-wrap');
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const margin = 64;
  if (y < rect.top + margin) wrap.scrollTop -= 14;
  else if (y > rect.bottom - margin) wrap.scrollTop += 14;
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('tr:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

// --- Tri par en-têtes -------------------------------------------------------
document.querySelectorAll('th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sort.key === key) sort.dir *= -1;
    else sort = { key, dir: 1 };
    applySortAndRender();
  });
});

function updateSortArrows() {
  document.querySelectorAll('th.sortable').forEach((th) => {
    const existing = th.querySelector('.arrow');
    if (existing) existing.remove();
    if (sort.key === th.dataset.sort) {
      const a = document.createElement('span');
      a.className = 'arrow';
      a.textContent = sort.dir === 1 ? '▲' : '▼';
      th.appendChild(a);
    }
  });
}

// --- Utilitaires -----------------------------------------------------------
function formatMoney(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return '';
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return rounded.toLocaleString('fr-FR') + ' €';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function reportError(err) {
  console.error(err);
  // signal discret et non bloquant
  const msg = (err && err.message) ? err.message : 'Erreur réseau';
  showToast(msg);
}

let toastTimer = null;
function showToast(text) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
      'background:#1d1d1f;color:#fff;padding:9px 16px;border-radius:8px;font-size:13px;' +
      'z-index:1000;opacity:0;transition:opacity .2s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2600);
}

// --- Synchronisation temps réel (polling) ----------------------------------
// Re-synchronise compteurs + grille en arrière-plan, sans recharger la page et
// sans jamais écraser une saisie en cours. Permet à plusieurs personnes (ex.
// le patron depuis l'étranger) de voir les changements des autres en continu.
const POLL_MS = 8000; // filet de sécurité uniquement ; le temps réel passe par SSE
let lastRowsSig = '';

// Vrai si l'utilisateur est en train d'éditer / glisser → on ne touche pas à la grille.
function isInteracting() {
  if (dragState) return true;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return true;
  return false;
}

function signature(list) {
  // signature compacte : détecte tout changement de contenu ou d'ordre
  return list.map((r) => `${r.id}:${r.updated_at}`).join('|') + '#' + list.length;
}

async function poll() {
  if (document.hidden) return; // onglet en arrière-plan : on économise
  try {
    await loadCounts(); // compteurs sidebar : toujours sûrs à rafraîchir
    if (isInteracting()) return; // ne pas perturber une saisie / un glisser
    const fresh = await api('GET', `/api/requests?stage=${encodeURIComponent(currentStage)}`);
    const sig = signature(fresh);
    if (sig !== lastRowsSig) {
      rows = fresh;
      lastRowsSig = sig;
      applySortAndRender();
    }
  } catch (_) { /* silencieux : on réessaiera au prochain cycle */ }
}

// Push instantané via SSE (Server-Sent Events) — comme Google Sheets : le
// serveur prévient le navigateur dès qu'une donnée change, refresh en ~150 ms.
let streamAlive = false;
let streamDebounce = null;

function onStreamChange() {
  // coalesce les rafales (plusieurs modifs quasi simultanées) en un seul refresh
  clearTimeout(streamDebounce);
  streamDebounce = setTimeout(poll, 120);
}

function connectStream() {
  try {
    const es = new EventSource('/api/stream');
    es.addEventListener('change', onStreamChange);
    es.onopen = () => { streamAlive = true; };
    es.onerror = () => { streamAlive = false; /* EventSource se reconnecte seul */ };
  } catch (_) { streamAlive = false; }
}

function startRealtime() {
  connectStream();
  // filet de sécurité : si le flux est coupé, on revient à un poll lent
  setInterval(() => { if (!streamAlive) poll(); }, POLL_MS);
  // rafraîchit immédiatement quand on revient sur l'onglet / réveille la tablette
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
}

// --- Init ------------------------------------------------------------------
async function start() {
  renderSidebar();
  await loadCounts();
  $stageTitle.textContent = STAGE_LABEL[currentStage];
  await loadRows();
  lastRowsSig = signature(rows);
  startRealtime();
}

start().catch(reportError);
