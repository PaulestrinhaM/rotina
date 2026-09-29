// ═══ VAGAS (SDD 5.9, 6.8, 7.4) ═══
// Não integra com tarefas nem notas — autocontido, lógica + render juntos
// (ninguém mais reaproveita isso, diferente de occurrences.js/roadmap.js).

const ETAPAS_VAGAS = ['radar', 'aplicada', 'triagem', 'entrevista', 'final', 'oferta', 'encerrada'];
const ETAPAS_ATIVAS = ['aplicada', 'triagem', 'entrevista', 'final', 'oferta'];
const ETAPAS_LABELS = {
  radar: 'Radar', aplicada: 'Aplicada', triagem: 'Triagem', entrevista: 'Entrevista',
  final: 'Final', oferta: 'Oferta', encerrada: 'Encerrada',
};

let vagasFiltroAtual = 'todas';
let vagasModoView = 'lista'; // 'lista' | 'kanban'
let editingVagaId = null;
let editingVagaStageOriginal = null;
let viewingVagaId = null;

// ═══ REGRAS DE NEGÓCIO ═══
function vagaEhAtiva(vaga) {
  return ETAPAS_ATIVAS.includes(vaga.stage);
}

function vagaPrecisaAcao(vaga, hojeISO, diasParadaVaga) {
  if (!vagaEhAtiva(vaga)) return false;
  if (vaga.passoData && vaga.passoData <= hojeISO) return true;
  if (!vaga.passo) {
    const eventos = vaga.eventos || [];
    const ultimo = eventos[eventos.length - 1];
    if (ultimo && diffDias(ultimo.data, hojeISO) >= diasParadaVaga) return true;
  }
  return false;
}

// 0 = passo atrasado, 1 = parada, 2 = resto
function vagaBucketUrgencia(vaga, hojeISO, diasParadaVaga) {
  if (!vagaEhAtiva(vaga)) return 2;
  if (vaga.passoData && vaga.passoData <= hojeISO) return 0;
  if (!vaga.passo) {
    const eventos = vaga.eventos || [];
    const ultimo = eventos[eventos.length - 1];
    if (ultimo && diffDias(ultimo.data, hojeISO) >= diasParadaVaga) return 1;
  }
  return 2;
}

function ultimoEventoData(vaga) {
  const eventos = vaga.eventos || [];
  return eventos.length ? eventos[eventos.length - 1].data : '';
}

function ordenarPorUrgencia(lista, hojeISO, diasParadaVaga) {
  return [...lista].sort((a, b) => {
    const ba = vagaBucketUrgencia(a, hojeISO, diasParadaVaga);
    const bb = vagaBucketUrgencia(b, hojeISO, diasParadaVaga);
    if (ba !== bb) return ba - bb;
    if (ba === 0) return (a.passoData || '').localeCompare(b.passoData || ''); // mais atrasada primeiro
    if (ba === 1) return ultimoEventoData(a).localeCompare(ultimoEventoData(b)); // mais parada primeiro
    return ultimoEventoData(b).localeCompare(ultimoEventoData(a)); // mais recente primeiro
  });
}

function candidaturasNaSemana(lista, segunda) {
  const fim = addDays(segunda, 6);
  return lista.filter(v => (v.eventos || []).some(e =>
    e.txt && e.txt.includes('Candidatura') && e.data >= segunda && e.data <= fim
  )).length;
}

function mudarEtapaVaga(vaga, novaEtapa, hojeISO) {
  if (vaga.stage === novaEtapa) return;
  vaga.stage = novaEtapa;
  vaga.eventos = vaga.eventos || [];
  vaga.eventos.push({ data: hojeISO, txt: `Mudou para ${ETAPAS_LABELS[novaEtapa] || novaEtapa}` });
}

// ═══ RENDER ═══
function renderVagas() {
  const hoje = new Date().toISOString().slice(0, 10);
  const segunda = getMondayKey();

  const candidaturas = candidaturasNaSemana(vagas, segunda);
  const ativas = vagas.filter(vagaEhAtiva).length;
  const precisamAcao = vagas.filter(v => vagaPrecisaAcao(v, hoje, config.diasParadaVaga));

  document.getElementById('vagasCandidaturasVal').textContent = `${candidaturas}/${config.metaVagasSemana}`;
  document.getElementById('vagasAtivasVal').textContent = ativas;
  document.getElementById('vagasAcaoVal').textContent = precisamAcao.length;

  renderVagasFiltros();
  renderVagasAcao(precisamAcao, hoje);
  renderVagasLista(hoje);
  renderVagasKanban();
}

function renderVagasFiltros() {
  const area = document.getElementById('vagasFiltros');
  area.innerHTML = '';
  const opts = [{ key: 'todas', label: 'Todas' }, ...ETAPAS_VAGAS.map(e => ({ key: e, label: ETAPAS_LABELS[e] }))];
  opts.forEach(o => {
    const btn = document.createElement('button');
    btn.className = 'bfilter' + (vagasFiltroAtual === o.key ? ' active' : '');
    btn.textContent = o.label;
    btn.addEventListener('click', () => { vagasFiltroAtual = o.key; renderVagas(); });
    area.appendChild(btn);
  });
}

function renderVagasAcao(precisamAcao, hoje) {
  const area = document.getElementById('vagasAcaoSecao');
  if (!precisamAcao.length) { area.innerHTML = ''; return; }
  const ordenadas = ordenarPorUrgencia(precisamAcao, hoje, config.diasParadaVaga);
  area.innerHTML = '<div class="estudo-secao-hdr">Precisa de ação</div><div class="regras-list" id="vagasAcaoList"></div>';
  const list = area.querySelector('#vagasAcaoList');
  ordenadas.forEach(v => list.appendChild(criarVagaRow(v, hoje)));
}

function renderVagasLista(hoje) {
  const wrap = document.getElementById('vagasListaWrap');
  wrap.style.display = vagasModoView === 'lista' ? '' : 'none';
  wrap.innerHTML = '';

  const filtradas = vagasFiltroAtual === 'todas' ? vagas : vagas.filter(v => v.stage === vagasFiltroAtual);
  if (!filtradas.length) { wrap.innerHTML = '<div class="empty">NENHUMA VAGA AQUI</div>'; return; }

  const ordenadas = ordenarPorUrgencia(filtradas, hoje, config.diasParadaVaga);
  const list = document.createElement('div');
  list.className = 'regras-list';
  ordenadas.forEach(v => list.appendChild(criarVagaRow(v, hoje)));
  wrap.appendChild(list);
}

function criarVagaRow(vaga, hoje) {
  const bucket = vagaBucketUrgencia(vaga, hoje, config.diasParadaVaga);
  const corBorda = bucket === 0 ? 'var(--danger)' : bucket === 1 ? 'var(--accent)' : 'var(--b1)';
  const passoTxt = vaga.passo
    ? `${sanitize(vaga.passo)}${vaga.passoData ? ' · ' + sanitize(vaga.passoData) : ''}`
    : (ultimoEventoData(vaga) ? `sem próximo passo · parada há ${diffDias(ultimoEventoData(vaga), hoje)}d` : 'sem próximo passo');

  const row = document.createElement('div');
  row.className = 'regra-row';
  row.style.borderLeft = `3px solid ${corBorda}`;
  row.innerHTML = `
    <div class="regra-row-info">
      <div class="regra-row-title">${sanitize(vaga.cargo || '(sem cargo)')} · ${sanitize(vaga.empresa || '(sem empresa)')}</div>
      <div class="regra-row-meta"><span class="etapa-pill">${sanitize(ETAPAS_LABELS[vaga.stage] || vaga.stage)}</span> ${passoTxt}</div>
    </div>
    <button class="btn btn-sq vaga-editar-btn" title="Editar">✏</button>
    <button class="btn btn-sq vaga-ver-btn" title="Ver detalhes">›</button>`;
  row.querySelector('.vaga-editar-btn').addEventListener('click', e => { e.stopPropagation(); abrirVaga(vaga.id); });
  row.querySelector('.vaga-ver-btn').addEventListener('click', e => { e.stopPropagation(); abrirVagaView(vaga.id); });
  row.addEventListener('click', () => abrirVagaView(vaga.id));
  return row;
}

function renderVagasKanban() {
  const wrap = document.getElementById('vagasKanbanWrap');
  wrap.style.display = vagasModoView === 'kanban' ? '' : 'none';
  if (vagasModoView !== 'kanban') return;

  const hoje = new Date().toISOString().slice(0, 10);
  const isMobile = window.innerWidth < 680;
  wrap.innerHTML = '';
  wrap.className = 'kanban-panel';

  ETAPAS_VAGAS.forEach(etapa => {
    let doColuna = vagas.filter(v => v.stage === etapa);
    if (isMobile) doColuna = doColuna.filter(v => vagaBucketUrgencia(v, hoje, config.diasParadaVaga) !== 0);

    const col = document.createElement('div');
    col.className = 'kb-col';
    col.innerHTML = `
      <div class="kb-col-hdr">
        <div class="kb-col-name">${ETAPAS_LABELS[etapa]}</div>
        <div class="kb-col-meta"><span class="kb-col-pct">${doColuna.length} vaga${doColuna.length === 1 ? '' : 's'}</span></div>
      </div>
      <div class="kb-tasks"></div>`;
    const tasksEl = col.querySelector('.kb-tasks');

    if (!doColuna.length) {
      tasksEl.innerHTML = '<div class="kb-empty">VAZIO</div>';
    } else {
      doColuna.forEach(v => {
        const bucket = vagaBucketUrgencia(v, hoje, config.diasParadaVaga);
        const card = document.createElement('div');
        card.className = 'kb-card' + (bucket === 0 ? ' kb-conflict' : '');
        card.innerHTML = `
          <div class="kb-card-top">
            <div class="kb-label">${sanitize(v.cargo || '(sem cargo)')}</div>
          </div>
          <div class="kb-footer">
            <span class="kb-time">${sanitize(v.empresa || '')}</span>
          </div>`;
        card.addEventListener('click', () => abrirVagaView(v.id));
        tasksEl.appendChild(card);
      });
    }
    wrap.appendChild(col);
  });
}

function toggleVagasView() {
  vagasModoView = vagasModoView === 'lista' ? 'kanban' : 'lista';
  const btn = document.getElementById('vagasViewToggleBtn');
  btn.classList.toggle('active', vagasModoView === 'kanban');
  const hoje = new Date().toISOString().slice(0, 10);
  renderVagasLista(hoje);
  renderVagasKanban();
}

// ═══ MODAL DE LEITURA (SDD-adendo, pedido do usuário: notas legíveis sem
// precisar abrir o formulário de edição) ═══
function campoView(label, valor, opts) {
  if (!valor) return '';
  const html = opts && opts.html ? valor : sanitize(valor);
  return `<div class="estudo-campo${opts && opts.destaque ? ' estudo-campo-destaque' : ''}">
    <div class="estudo-campo-label">${sanitize(label)}</div>
    <div class="estudo-campo-texto" style="white-space:pre-wrap;">${html}</div>
  </div>`;
}

function renderVagaViewBody(vaga) {
  const linkHtml = vaga.link
    ? `<a href="${sanitize(vaga.link)}" target="_blank" rel="noopener" class="estudo-recurso">${sanitize(vaga.link)}</a>` : '';
  const stackHtml = (vaga.stack || []).length
    ? `<div class="tags">${vaga.stack.map(s => `<span class="tg tg-tool">${sanitize(s)}</span>`).join('')}</div>` : '';
  const passoTxt = vaga.passo
    ? `${sanitize(vaga.passo)}${vaga.passoData ? ' · ' + sanitize(vaga.passoData) : ''}` : '';
  const eventos = [...(vaga.eventos || [])].sort((a, b) => a.data.localeCompare(b.data));
  const timelineHtml = eventos.length
    ? `<div class="estudo-campo">
        <div class="estudo-campo-label">Linha do tempo</div>
        <div class="regras-list">${eventos.map(e => `
          <div class="regra-row" style="cursor:default;">
            <div class="regra-row-info">
              <div class="regra-row-title">${sanitize(e.txt)}</div>
              <div class="regra-row-meta">${sanitize(e.data)}</div>
            </div>
          </div>`).join('')}</div>
      </div>` : '';

  document.getElementById('vagaViewBody').innerHTML = `
    <div class="estudo-card-hdr" style="color:var(--text); font-size:16px; font-weight:600; font-family:var(--sans);">
      <span>${sanitize(vaga.cargo || '(sem cargo)')} · ${sanitize(vaga.empresa || '(sem empresa)')}</span>
      <span class="etapa-pill">${sanitize(ETAPAS_LABELS[vaga.stage] || vaga.stage)}</span>
    </div>
    ${stackHtml}
    ${campoView('Próximo passo', passoTxt)}
    ${campoView('Notas', vaga.notas, { destaque: true })}
    ${campoView('Modelo', vaga.modelo)}
    ${campoView('Faixa salarial', vaga.faixa)}
    ${campoView('Origem', vaga.origem)}
    ${campoView('Contato', vaga.contato)}
    ${campoView('Canal', vaga.canal)}
    ${linkHtml ? campoView('Link', linkHtml, { html: true }) : ''}
    ${timelineHtml}`;
}

function abrirVagaView(id) {
  const vaga = vagas.find(v => v.id === id);
  if (!vaga) return;
  viewingVagaId = id;
  renderVagaViewBody(vaga);
  document.getElementById('vagaViewModal').classList.add('open');
}

function closeVagaViewModal(e) {
  if (!e || e.target === document.getElementById('vagaViewModal')) {
    document.getElementById('vagaViewModal').classList.remove('open');
  }
}

function editarDaVagaView() {
  if (!viewingVagaId) return;
  closeVagaViewModal();
  abrirVaga(viewingVagaId);
}

// ═══ MODAL (criar / editar) ═══
function abrirNovaVaga() {
  editingVagaId = null;
  editingVagaStageOriginal = null;
  document.getElementById('vagaModalTitle').textContent = 'Nova vaga';
  preencherFormVaga({
    cargo: '', empresa: '', stage: 'radar', origem: '', modelo: 'Remoto', faixa: '',
    link: '', contato: '', canal: '', stack: [], notas: '', passo: '', passoData: '', eventos: [],
  });
  document.getElementById('vagaTimelineWrap').style.display = 'none';
  document.getElementById('vagaExcluirBtn').style.display = 'none';
  document.getElementById('vagaModal').classList.add('open');
}

function abrirVaga(id) {
  const vaga = vagas.find(v => v.id === id);
  if (!vaga) return;
  editingVagaId = id;
  editingVagaStageOriginal = vaga.stage;
  document.getElementById('vagaModalTitle').textContent = 'Editar vaga';
  preencherFormVaga(vaga);
  document.getElementById('vagaTimelineWrap').style.display = '';
  document.getElementById('vagaExcluirBtn').style.display = '';
  renderVagaTimeline(vaga);
  document.getElementById('vagaModal').classList.add('open');
}

function preencherFormVaga(vaga) {
  document.getElementById('vfCargo').value = vaga.cargo || '';
  document.getElementById('vfEmpresa').value = vaga.empresa || '';
  document.getElementById('vfStage').innerHTML = ETAPAS_VAGAS.map(e =>
    `<option value="${e}"${e === vaga.stage ? ' selected' : ''}>${ETAPAS_LABELS[e]}</option>`
  ).join('');
  document.getElementById('vfModelo').value = vaga.modelo || 'Remoto';
  document.getElementById('vfOrigem').value = vaga.origem || '';
  document.getElementById('vfFaixa').value = vaga.faixa || '';
  document.getElementById('vfLink').value = vaga.link || '';
  document.getElementById('vfContato').value = vaga.contato || '';
  document.getElementById('vfCanal').value = vaga.canal || '';
  document.getElementById('vfStack').value = (vaga.stack || []).join(', ');
  document.getElementById('vfNotas').value = vaga.notas || '';
  document.getElementById('vfPasso').value = vaga.passo || '';
  document.getElementById('vfPassoData').value = vaga.passoData || '';
  document.getElementById('vfNovoEventoTxt').value = '';
}

function renderVagaTimeline(vaga) {
  const area = document.getElementById('vagaTimeline');
  const eventos = [...(vaga.eventos || [])].sort((a, b) => a.data.localeCompare(b.data));
  if (!eventos.length) { area.innerHTML = '<div class="empty" style="padding:12px;">SEM EVENTOS AINDA</div>'; return; }
  area.innerHTML = eventos.map(e => `
    <div class="regra-row" style="cursor:default;">
      <div class="regra-row-info">
        <div class="regra-row-title">${sanitize(e.txt)}</div>
        <div class="regra-row-meta">${sanitize(e.data)}</div>
      </div>
    </div>`).join('');
}

function adicionarEventoVaga() {
  if (!editingVagaId) return;
  const vaga = vagas.find(v => v.id === editingVagaId);
  if (!vaga) return;
  const txt = document.getElementById('vfNovoEventoTxt').value.trim();
  if (!txt) return;
  vaga.eventos = vaga.eventos || [];
  vaga.eventos.push({ data: new Date().toISOString().slice(0, 10), txt });
  document.getElementById('vfNovoEventoTxt').value = '';
  renderVagaTimeline(vaga);
}

async function salvarVaga() {
  const cargo = document.getElementById('vfCargo').value.trim();
  const empresa = document.getElementById('vfEmpresa').value.trim();
  if (!cargo || !empresa) { showToast('Preenche cargo e empresa'); return; }

  const novoStage = document.getElementById('vfStage').value;
  const hoje = new Date().toISOString().slice(0, 10);

  const dados = {
    id: editingVagaId || 'v_' + Date.now(),
    cargo, empresa,
    stage: novoStage,
    origem: document.getElementById('vfOrigem').value.trim(),
    modelo: document.getElementById('vfModelo').value,
    faixa: document.getElementById('vfFaixa').value.trim(),
    link: document.getElementById('vfLink').value.trim(),
    contato: document.getElementById('vfContato').value.trim(),
    canal: document.getElementById('vfCanal').value.trim(),
    stack: document.getElementById('vfStack').value.split(',').map(s => s.trim()).filter(Boolean),
    notas: document.getElementById('vfNotas').value.trim(),
    passo: document.getElementById('vfPasso').value.trim(),
    passoData: document.getElementById('vfPassoData').value,
    eventos: [],
  };

  if (editingVagaId) {
    const idx = vagas.findIndex(v => v.id === editingVagaId);
    const atual = vagas[idx];
    dados.eventos = atual.eventos || [];
    if (editingVagaStageOriginal !== novoStage) mudarEtapaVaga(dados, novoStage, hoje);
    vagas[idx] = dados;
  } else {
    vagas.push(dados);
  }

  await saveVagas();
  document.getElementById('vagaModal').classList.remove('open');
  renderVagas();
  showToast(editingVagaId ? 'Vaga atualizada' : 'Vaga adicionada');
  editingVagaId = null;
  editingVagaStageOriginal = null;
}

async function excluirVaga() {
  if (!editingVagaId) return;
  vagas = vagas.filter(v => v.id !== editingVagaId);
  await saveVagas();
  document.getElementById('vagaModal').classList.remove('open');
  renderVagas();
  showToast('Vaga excluída');
  editingVagaId = null;
  editingVagaStageOriginal = null;
}

function closeVagaModal(e) {
  if (!e || e.target === document.getElementById('vagaModal')) {
    document.getElementById('vagaModal').classList.remove('open');
  }
}

// ═══ SETUP (chamado uma vez no boot) ═══
function setupVagasListeners() {
  document.getElementById('vagasNovaBtn').addEventListener('click', abrirNovaVaga);
  document.getElementById('vagasViewToggleBtn').addEventListener('click', toggleVagasView);
  document.getElementById('vagaSalvarBtn').addEventListener('click', salvarVaga);
  document.getElementById('vagaExcluirBtn').addEventListener('click', excluirVaga);
  document.getElementById('vfAddEventoBtn').addEventListener('click', adicionarEventoVaga);
  document.getElementById('vagaViewEditarBtn').addEventListener('click', editarDaVagaView);
}
