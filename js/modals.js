// ═══ ICON MODAL ═══
let iconModalCallback = null;

function openIconModal(idx, mode) {
  iconModalCallback = { idx, mode };
  const grid = document.getElementById('iconGrid');
  const currentIcon = mode === 'tipoIcon' ? (tipoForm ? tipoForm.icone : '') : '';
  grid.innerHTML = '';
  ICONS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'icon-opt' + (em === currentIcon ? ' selected' : '');
    btn.textContent = em;
    btn.onclick = () => selectIcon(em);
    grid.appendChild(btn);
  });
  document.getElementById('iconModal').classList.add('open');
}

function selectIcon(em) {
  const { mode } = iconModalCallback;
  if (mode === 'tipoIcon') setTipoFormIcon(em);
  document.getElementById('iconModal').classList.remove('open');
}

function closeIconModal(e) {
  if (e.target === document.getElementById('iconModal'))
    document.getElementById('iconModal').classList.remove('open');
}

// ═══ TIME PICKER MODAL ═══
let timeModalCallback = null;
let timeState = { startH:'08', startM:'00', endH:'09', endM:'00' };
let drums = {};

function buildDrum(containerId, items, initialVal) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  const sel = document.createElement('div'); sel.className = 'drum-selector'; wrap.appendChild(sel);
  const listEl = document.createElement('div'); listEl.className = 'drum-list'; wrap.appendChild(listEl);
  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'drum-item' + (item === initialVal ? ' active' : '');
    el.textContent = item;
    el.onclick = () => selectDrum(containerId, i, items);
    listEl.appendChild(el);
  });
  drums[containerId] = { items, current: items.indexOf(initialVal) < 0 ? 0 : items.indexOf(initialVal) };
  scrollDrum(containerId, drums[containerId].current, false);
}

function selectDrum(id, idx, items) {
  drums[id].current = idx;
  scrollDrum(id, idx, true);
  document.querySelectorAll(`#${id} .drum-item`).forEach((el, i) => el.classList.toggle('active', i === idx));
}

function scrollDrum(id, idx, animate) {
  const wrap = document.getElementById(id);
  const list = wrap.querySelector('.drum-list');
  if (!animate) list.style.transition = 'none';
  else list.style.transition = 'transform .15s ease';
  list.style.transform = `translateY(${-idx * 36}px)`;
}

// API genérica: quem abre passa o valor atual ("HH:MM–HH:MM" ou null) e um
// callback que recebe o novo valor no mesmo formato ao confirmar.
function openTimeModalFor(current, onConfirm) {
  timeModalCallback = { onConfirm };
  const cur = current || '08:00–09:00';
  const parts = cur.split('–');
  const [sh, sm] = (parts[0]||'08:00').split(':');
  const [eh, em] = (parts[1]||'09:00').split(':');
  timeState = { startH: sh||'08', startM: sm||'00', endH: eh||'09', endM: em||'00' };
  buildDrum('startH', HOURS, timeState.startH);
  buildDrum('startM', MINS,  timeState.startM);
  buildDrum('endH',   HOURS, timeState.endH);
  buildDrum('endM',   MINS,  timeState.endM);
  document.getElementById('timeModal').classList.add('open');
}

function confirmTime() {
  const get = id => drums[id] ? drums[id].items[drums[id].current] : '00';
  const val = `${get('startH')}:${get('startM')}–${get('endH')}:${get('endM')}`;
  document.getElementById('timeModal').classList.remove('open');
  if (timeModalCallback && timeModalCallback.onConfirm) timeModalCallback.onConfirm(val);
}

function closeTimeModal(e) {
  if (e.target === document.getElementById('timeModal'))
    document.getElementById('timeModal').classList.remove('open');
}
