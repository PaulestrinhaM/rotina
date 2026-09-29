// ═══ CONFIG (engrenagem) — SDD seção 7.5 ═══
// Substitui o antigo editor.js por dia. Aqui se edita o catálogo de tipos e
// as regras de rotina que a expansão em ocorrências (occurrences.js) usa.

let regraForm = null;
let tipoForm = null;

const LEGACY_KEYS_PRESERVADAS = ['books_data', 'journal_data'];

function renderConfig() {
  renderRegraTiposGrid();
  renderRegrasList();
  renderTiposList();
}

// ═══ REGRAS ═══
function renderRegraTiposGrid() {
  const grid = document.getElementById('regraTiposGrid');
  grid.innerHTML = '';
  tipos.forEach(tipo => {
    const btn = document.createElement('button');
    btn.className = 'tipo-chip';
    btn.innerHTML = `<span class="tipo-chip-icon">${sanitize(tipo.icone)}</span><span class="tipo-chip-nome">${sanitize(tipo.nome)}</span>`;
    btn.addEventListener('click', () => abrirNovaRegra(tipo.id));
    grid.appendChild(btn);
  });
}

function renderRegrasList() {
  const list = document.getElementById('regrasList');
  list.innerHTML = '';
  if (!regras.length) { list.innerHTML = '<div class="empty">NENHUMA REGRA AINDA</div>'; return; }

  regras.forEach(r => {
    const tipo = tipoPorId(r.tipoId);
    const cadTxt = r.cadencia.tipo === 'semanal'
      ? (r.dias || []).map(d => DAYS_SHORT[DAYS.indexOf(d)]).join(' ')
      : r.cadencia.tipo === 'quinzenal'
      ? 'Quinzenal · ' + (r.dias || []).map(d => DAYS_SHORT[DAYS.indexOf(d)]).join(' ')
      : 'Única · ' + (r.cadencia.data || '');
    const blocosTxt = (r.blocos || []).map(b => `${b.de}–${b.ate}`).join(', ');
    const peso = r.peso != null ? r.peso : (tipo ? tipo.pesoPadrao : '—');

    const row = document.createElement('div');
    row.className = 'regra-row';
    row.innerHTML = `
      <div class="regra-row-icon">${sanitize(tipo ? tipo.icone : '📌')}</div>
      <div class="regra-row-info">
        <div class="regra-row-title">${sanitize(r.titulo || (tipo ? tipo.nome : r.tipoId))}</div>
        <div class="regra-row-meta">${sanitize(cadTxt)} · ${sanitize(blocosTxt)} · peso ${peso}</div>
      </div>
      <button class="btn btn-sq regra-edit-btn" title="Editar">✏</button>`;
    row.querySelector('.regra-edit-btn').addEventListener('click', () => editarRegra(r.id));
    list.appendChild(row);
  });
}

function abrirNovaRegra(tipoId) {
  const tipo = tipoPorId(tipoId);
  const segunda = getMondayKey();
  regraForm = {
    id: null,
    tipoId,
    titulo: '',
    peso: tipo ? tipo.pesoPadrao : 4,
    cadencia: { tipo: 'semanal', ancora: segunda, data: segunda },
    dias: ['Segunda','Terça','Quarta','Quinta','Sexta'],
    blocos: tipo ? clone(tipo.blocosPadrao) : [],
    moduloFixo: null,
  };
  openRegraModal();
}

function editarRegra(regraId) {
  const r = regras.find(x => x.id === regraId);
  if (!r) return;
  regraForm = clone(r);
  if (!regraForm.dias) regraForm.dias = [];
  if (!regraForm.cadencia.ancora) regraForm.cadencia.ancora = getMondayKey();
  if (!regraForm.cadencia.data) regraForm.cadencia.data = getMondayKey();
  openRegraModal();
}

function openRegraModal() {
  const tipo = tipoPorId(regraForm.tipoId);
  document.getElementById('regraModalTitle').textContent = regraForm.id ? 'Editar regra' : 'Nova regra';
  document.getElementById('rfTipoLabel').textContent = `${tipo ? tipo.icone : '📌'} ${tipo ? tipo.nome : regraForm.tipoId}`;
  document.getElementById('rfTitulo').value = regraForm.titulo || '';
  document.getElementById('rfPeso').value = regraForm.peso;
  document.getElementById('rfPesoVal').textContent = regraForm.peso;
  document.getElementById('rfCadencia').value = regraForm.cadencia.tipo;
  document.getElementById('rfAncora').value = regraForm.cadencia.ancora || getMondayKey();
  document.getElementById('rfData').value = regraForm.cadencia.data || getMondayKey();
  renderDiasPills();
  atualizarCamposCadencia();
  renderBlocosChips('rfBlocos', regraForm.blocos, blocos => { regraForm.blocos = blocos; });
  document.getElementById('regraDeleteBtn').style.display = regraForm.id ? '' : 'none';
  document.getElementById('regraModal').classList.add('open');
}

function renderDiasPills() {
  const wrap = document.getElementById('rfDiasPills');
  wrap.innerHTML = '';
  DAYS.forEach((d, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dia-pill' + (regraForm.dias.includes(d) ? ' active' : '');
    btn.textContent = DAYS_SHORT[i];
    btn.addEventListener('click', () => {
      const idx = regraForm.dias.indexOf(d);
      if (idx >= 0) regraForm.dias.splice(idx, 1);
      else regraForm.dias.push(d);
      btn.classList.toggle('active');
    });
    wrap.appendChild(btn);
  });
}

function atualizarCamposCadencia() {
  const val = document.getElementById('rfCadencia').value;
  document.getElementById('rfDiasWrap').style.display = (val === 'semanal' || val === 'quinzenal') ? '' : 'none';
  document.getElementById('rfAncoraWrap').style.display = (val === 'quinzenal') ? '' : 'none';
  document.getElementById('rfDataWrap').style.display = (val === 'unica') ? '' : 'none';
}

// Chips de bloco de horário, reaproveitados por regra e por tipo.
function renderBlocosChips(containerId, blocos, onChange) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = '';
  blocos.forEach((bloco, idx) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'bloco-chip';
    chip.innerHTML = `${sanitize(bloco.de)}–${sanitize(bloco.ate)} <span class="bloco-chip-x">✕</span>`;
    chip.addEventListener('click', e => {
      if (e.target.classList.contains('bloco-chip-x')) {
        blocos.splice(idx, 1);
        onChange(blocos);
        renderBlocosChips(containerId, blocos, onChange);
        return;
      }
      openTimeModalFor(`${bloco.de}–${bloco.ate}`, val => {
        const [de, ate] = val.split('–');
        blocos[idx] = { de, ate };
        onChange(blocos);
        renderBlocosChips(containerId, blocos, onChange);
      });
    });
    wrap.appendChild(chip);
  });

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'bloco-add-btn';
  addBtn.textContent = '+ bloco';
  addBtn.addEventListener('click', () => {
    openTimeModalFor(null, val => {
      const [de, ate] = val.split('–');
      blocos.push({ de, ate });
      onChange(blocos);
      renderBlocosChips(containerId, blocos, onChange);
    });
  });
  wrap.appendChild(addBtn);
}

async function salvarRegra() {
  const tipo = tipoPorId(regraForm.tipoId);
  const cadTipo = document.getElementById('rfCadencia').value;
  const cadencia = { tipo: cadTipo };
  if (cadTipo === 'quinzenal') cadencia.ancora = document.getElementById('rfAncora').value;
  if (cadTipo === 'unica') cadencia.data = document.getElementById('rfData').value;
  const dias = (cadTipo === 'semanal' || cadTipo === 'quinzenal') ? [...regraForm.dias] : [];

  if (!regraForm.blocos.length) { showToast('Adiciona ao menos um bloco de horário'); return; }
  if (cadTipo !== 'unica' && !dias.length) { showToast('Seleciona ao menos um dia'); return; }

  regraForm.titulo = document.getElementById('rfTitulo').value.trim() || null;
  regraForm.peso = parseInt(document.getElementById('rfPeso').value) || (tipo ? tipo.pesoPadrao : 4);
  regraForm.cadencia = cadencia;
  regraForm.dias = dias;

  if (regraForm.id) {
    const idx = regras.findIndex(r => r.id === regraForm.id);
    if (idx >= 0) regras[idx] = clone(regraForm);
  } else {
    regraForm.id = 'r_' + regraForm.tipoId + '_' + Date.now();
    regraForm.criadaEm = getMondayKey();
    regras.push(clone(regraForm));
  }
  await saveRegras();
  document.getElementById('regraModal').classList.remove('open');
  renderConfig();
  renderTracker(activeDay);
  showToast('Regra salva ✓');
}

async function excluirRegra() {
  if (!regraForm || !regraForm.id) return;
  regras = regras.filter(r => r.id !== regraForm.id);
  await saveRegras();
  document.getElementById('regraModal').classList.remove('open');
  renderConfig();
  renderTracker(activeDay);
  showToast('Regra excluída');
}

function closeRegraModal(e) {
  if (!e || e.target === document.getElementById('regraModal'))
    document.getElementById('regraModal').classList.remove('open');
}

// ═══ TIPOS ═══
function renderTiposList() {
  const list = document.getElementById('tiposList');
  list.innerHTML = '';
  tipos.forEach(tipo => {
    const blocosTxt = (tipo.blocosPadrao || []).map(b => `${b.de}–${b.ate}`).join(', ') || 'sem horário padrão';
    const row = document.createElement('div');
    row.className = 'regra-row';
    row.innerHTML = `
      <div class="regra-row-icon">${sanitize(tipo.icone)}</div>
      <div class="regra-row-info">
        <div class="regra-row-title">${sanitize(tipo.nome)}</div>
        <div class="regra-row-meta">peso padrão ${tipo.pesoPadrao} · ${sanitize(blocosTxt)}</div>
      </div>
      <button class="btn btn-sq tipo-edit-btn" title="Editar">✏</button>`;
    row.querySelector('.tipo-edit-btn').addEventListener('click', () => editarTipo(tipo.id));
    list.appendChild(row);
  });
}

function editarTipo(tipoId) {
  const t = tipoPorId(tipoId);
  if (!t) return;
  tipoForm = clone(t);
  openTipoModal();
}

function openTipoModal() {
  document.getElementById('tpIconBtn').textContent = tipoForm.icone;
  document.getElementById('tpNome').value = tipoForm.nome;
  document.getElementById('tpPeso').value = tipoForm.pesoPadrao;
  document.getElementById('tpPesoVal').textContent = tipoForm.pesoPadrao;
  renderBlocosChips('tpBlocos', tipoForm.blocosPadrao, blocos => { tipoForm.blocosPadrao = blocos; });
  document.getElementById('tipoModal').classList.add('open');
}

function setTipoFormIcon(em) {
  tipoForm.icone = em;
  document.getElementById('tpIconBtn').textContent = em;
}

async function salvarTipo() {
  tipoForm.nome = document.getElementById('tpNome').value.trim() || tipoForm.nome;
  tipoForm.pesoPadrao = parseInt(document.getElementById('tpPeso').value) || tipoForm.pesoPadrao;
  const idx = tipos.findIndex(t => t.id === tipoForm.id);
  if (idx >= 0) tipos[idx] = clone(tipoForm);
  await saveTipos();
  document.getElementById('tipoModal').classList.remove('open');
  renderConfig();
  renderTracker(activeDay);
  showToast('Tipo atualizado ✓');
}

function closeTipoModal(e) {
  if (!e || e.target === document.getElementById('tipoModal'))
    document.getElementById('tipoModal').classList.remove('open');
}

// ═══ EXPORTAÇÃO / IMPORTAÇÃO GERAL (seção 8) ═══
async function exportarTudo() {
  const keys = await store.listKeys('v2:');
  const data = {};
  for (const k of keys) {
    const raw = await store.get(k);
    if (raw != null) { try { data[k] = JSON.parse(raw); } catch {} }
  }
  const booksRaw = await store.get('books_data');
  if (booksRaw != null) { try { data['books_data'] = JSON.parse(booksRaw); } catch {} }

  downloadJSON(`rotina-backup-${getMondayKey()}.json`, data);
  showToast('Exportado ✓');
}

async function importarArquivo(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('formato inválido');
    for (const [key, value] of Object.entries(data)) {
      await store.set(key, JSON.stringify(value));
    }
    await loadAll();
    renderConfig();
    renderTracker(activeDay);
    showToast('Importado ✓');
  } catch {
    showToast('Falha ao importar: arquivo inválido');
  }
}

// ═══ MANUTENÇÃO — limpeza de chaves da v1 (seção 3.3) ═══
async function escanearChavesAntigas() {
  const allKeys = await store.listKeys('');
  const legacy = allKeys.filter(k => !k.startsWith('v2:') && !LEGACY_KEYS_PRESERVADAS.includes(k));
  renderLegacyKeys(legacy);
}

function renderLegacyKeys(keys) {
  const area = document.getElementById('legacyKeysList');
  area.innerHTML = '';
  if (!keys.length) { area.innerHTML = '<div class="empty">Nenhuma chave antiga encontrada</div>'; return; }
  keys.forEach(k => {
    const row = document.createElement('div');
    row.className = 'legacy-row';
    row.innerHTML = `<span class="legacy-key">${sanitize(k)}</span><button class="btn btn-danger btn-sq" title="Excluir">✕</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      await store.del(k);
      showToast('Removida: ' + k);
      escanearChavesAntigas();
    });
    area.appendChild(row);
  });
}

// ═══ SETUP (chamado uma vez no boot) ═══
function setupConfigListeners() {
  document.getElementById('rfPeso').addEventListener('input', e => {
    document.getElementById('rfPesoVal').textContent = e.target.value;
  });
  document.getElementById('rfCadencia').addEventListener('change', atualizarCamposCadencia);
  document.getElementById('tpPeso').addEventListener('input', e => {
    document.getElementById('tpPesoVal').textContent = e.target.value;
  });
  document.getElementById('exportBtn').addEventListener('click', exportarTudo);
  document.getElementById('importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importarArquivo(file);
    e.target.value = '';
  });
  document.getElementById('scanLegacyBtn').addEventListener('click', escanearChavesAntigas);
  document.getElementById('configBackBtn').addEventListener('click', closeConfig);
}
