// ═══ ESTUDOS (SDD seção 7.2) — substitui a v1 chaveada por índice ═══

const ESTADO_BADGE = {
  nao_visto:    { label: 'Não visto',   color: 'var(--muted2)', bg: 'rgba(106,106,134,.14)' },
  em_fila:      { label: 'Em fila',     color: 'var(--blue)',   bg: 'rgba(122,180,255,.12)' },
  em_andamento: { label: 'Em andamento',color: 'var(--accent)', bg: 'rgba(232,197,71,.12)' },
  sei:          { label: 'Sei',         color: 'var(--green)',  bg: 'rgba(168,224,90,.12)' },
};

let estudosTopicoManual = null; // { moduloId, topicoId } | null — override do "próximo" automático
let estudosFasesAbertas = null; // Set<faseId>, inicializado no 1º render
let estudosModulosAbertos = new Set();
let estudosFiltro = 'tudo'; // 'tudo' | 'teoria' | um valor de ferramenta — só afeta a árvore fase→módulo→tópico

// Pílulas de natureza/ferramenta/duração (SDD-adendo-design.md §3), mesmo
// esquema visual do protótipo estudos-mvp-v3.html.
function tagsHTML(topico, minutos) {
  const nat = topico.natureza === 'ferramenta'
    ? '<span class="tg tg-ferramenta">ferramenta</span>'
    : '<span class="tg tg-teoria">teoria</span>';
  const fer = topico.ferramenta ? `<span class="tg tg-tool">${sanitize(topico.ferramenta)}</span>` : '';
  const min = minutos ? `<span class="tg tg-min">${minutos} min</span>` : '';
  return `<div class="tags">${nat}${fer}${min}</div>`;
}

async function topicoCompleto(moduloId, topicoId) {
  const modulo = moduloPorId(inventario, moduloId);
  const topicoInv = modulo && (modulo.topicos || []).find(t => t.id === topicoId);
  if (!topicoInv) return null;
  const conteudoModulo = await getConteudoModulo(moduloId);
  const topicoConteudo = conteudoModulo && (conteudoModulo.topicos || []).find(t => t.id === topicoId);
  if (!topicoConteudo) return null;
  return { ...topicoInv, ...topicoConteudo };
}

async function renderEstudos() {
  if (!config.moduloFoco) {
    config.moduloFoco = primeiroModuloComConteudo(inventario);
    await saveConfig();
  }
  const modulo = config.moduloFoco ? moduloPorId(inventario, config.moduloFoco) : null;
  document.getElementById('estudosSub').textContent = modulo
    ? `Módulo em foco: ${modulo.id} · ${modulo.titulo}`
    : 'Nenhum módulo com conteúdo ainda';

  const faseAtiva = (inventario.fases || []).find(f => f.status === 'ativa') || null;
  document.getElementById('estudosDivisorSub').textContent = faseAtiva
    ? `O mapa inteiro do que vais precisar saber. Nada abaixo desta linha entra na nota desta semana. Só a fase "${faseAtiva.nome}" está ativa.`
    : 'O mapa inteiro do que vais precisar saber. Nada abaixo desta linha entra na nota desta semana.';

  renderModuloFocoSelect();
  renderKpis(faseAtiva);
  renderPrazo(modulo);
  await renderAgora();
  renderRevisar();
  renderFiltros();
  renderNavegacao();
}

// ═══ PRAZO DO MÓDULO EM FOCO (SDD 6.9) ═══
function renderPrazo(modulo) {
  const box = document.getElementById('estudoPrazo');
  if (!modulo) { box.style.display = 'none'; return; }
  box.style.display = '';

  const prazos = config.prazosModulo || {};
  document.getElementById('estudoPrazoInput').value = prazos[modulo.id] || '';

  const hoje = new Date().toISOString().slice(0, 10);
  const proj = projetarPrazoModulo(modulo, progresso, regras, tipos, resumo, hoje);
  const out = document.getElementById('estudoPrazoProjecao');
  out.className = 'estudo-prazo-projecao';

  if (proj.concluido) {
    out.textContent = 'Módulo concluído 🎉';
    out.classList.add('ok');
    return;
  }
  if (proj.semCapacidade) {
    out.textContent = 'Sem ritmo de estudo suficiente pra projetar (nenhuma regra de roadmap ativa).';
    return;
  }

  const dataFmt = new Date(proj.dataProjetada + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let texto = `No ritmo atual, terminaria em ${dataFmt}${proj.estimativa ? ' · estimativa (menos de 4 semanas de histórico)' : ''}.`;

  const prazoMeta = prazos[modulo.id];
  if (prazoMeta) {
    if (proj.dataProjetada <= prazoMeta) {
      texto += ' ✓ dentro do prazo.';
      out.classList.add('ok');
    } else {
      const atraso = diffDias(prazoMeta, proj.dataProjetada);
      texto += ` ✕ passaria do prazo em ${atraso}d.`;
      out.classList.add('atraso');
    }
  }
  out.textContent = texto;
}

async function definirPrazoModulo(valor) {
  if (!config.moduloFoco) return;
  if (!config.prazosModulo) config.prazosModulo = {};
  if (valor) config.prazosModulo[config.moduloFoco] = valor;
  else delete config.prazosModulo[config.moduloFoco];
  await saveConfig();
  renderPrazo(moduloPorId(inventario, config.moduloFoco));
}

// ═══ KPIs + STREAK (zona de ação) ═══
function renderKpis(faseAtiva) {
  document.getElementById('estudosStreak').textContent = '🔥 ' + streakEstudos(progresso) + 'd';

  const ocorrencias = semanaOcorrencias();
  const minutosFechados = minutosFechadosNaSemana(inventario, progresso, getMondayKey());
  const estudosScore = calcEstudos(ocorrencias, minutosFechados);

  const hoje = new Date().toISOString().slice(0, 10);
  const revisar = topicosVencidos(inventario, progresso, hoje).length;

  let kpiFase = '—', kpiFaseSub = '—', labelFase = 'Fase';
  if (faseAtiva) {
    const modulos = modulosDaFase(inventario, faseAtiva.numero);
    const topicos = modulos.flatMap(m => m.topicos || []);
    const { feitos, total } = progressoTopicos(topicos, progresso);
    kpiFase = total ? Math.round(feitos / total * 100) + '%' : '—';
    kpiFaseSub = `${feitos} de ${total} tópicos`;
    labelFase = `Fase ${faseAtiva.numero}`;
  }

  document.getElementById('estudosKpis').innerHTML = `
    <div class="estudo-kpi">
      <span class="estudo-kpi-l">Nota estudos</span>
      <span class="estudo-kpi-v" style="color:var(--green)">${estudosScore ? estudosScore.score10.toFixed(1) : '—'}</span>
      <span class="estudo-kpi-s">${estudosScore ? `${estudosScore.doneMin}/${estudosScore.totalMin} min` : 'sem meta de estudo'}</span>
    </div>
    <div class="estudo-kpi">
      <span class="estudo-kpi-l">${sanitize(labelFase)}</span>
      <span class="estudo-kpi-v" style="color:var(--accent)">${kpiFase}</span>
      <span class="estudo-kpi-s">${sanitize(kpiFaseSub)}</span>
    </div>
    <div class="estudo-kpi">
      <span class="estudo-kpi-l">A revisar</span>
      <span class="estudo-kpi-v" style="color:var(--blue)">${revisar}</span>
      <span class="estudo-kpi-s">vencidos</span>
    </div>`;
}

function renderModuloFocoSelect() {
  const sel = document.getElementById('estudosModuloFocoSelect');
  const modulosComConteudo = (inventario.modulos || []).filter(m => m.conteudo_escrito);
  sel.innerHTML = modulosComConteudo.map(m =>
    `<option value="${sanitize(m.id)}"${m.id === config.moduloFoco ? ' selected' : ''}>${sanitize(m.id)} · ${sanitize(m.titulo)}</option>`
  ).join('') || '<option value="">Nenhum módulo com conteúdo</option>';
}

async function trocarModuloFoco(moduloId) {
  config.moduloFoco = moduloId || null;
  await saveConfig();
  estudosTopicoManual = null;
  renderEstudos();
}

// ═══ BLOCO AGORA ═══
async function renderAgora() {
  const area = document.getElementById('estudosAgora');
  area.innerHTML = '';

  const moduloId = estudosTopicoManual ? estudosTopicoManual.moduloId : config.moduloFoco;
  let topicoId = estudosTopicoManual ? estudosTopicoManual.topicoId : null;

  if (!moduloId) { area.innerHTML = '<div class="empty">NENHUM MÓDULO COM CONTEÚDO AINDA</div>'; return; }
  const modulo = moduloPorId(inventario, moduloId);
  if (!modulo || !modulo.conteudo_escrito) { area.innerHTML = '<div class="empty">MÓDULO SEM CONTEÚDO AINDA</div>'; return; }

  if (!topicoId) {
    const proximo = primeiroTopicoPendente(modulo.topicos, progresso);
    if (!proximo) {
      area.innerHTML = '<div class="estudo-card"><div class="estudo-card-hdr"><span>Agora</span></div><div class="empty">MÓDULO CONCLUÍDO 🎉</div></div>';
      return;
    }
    topicoId = proximo.id;
  }

  const topico = await topicoCompleto(moduloId, topicoId);
  if (!topico) { area.innerHTML = '<div class="empty">TÓPICO SEM CONTEÚDO ESCRITO AINDA</div>'; return; }

  area.innerHTML = renderTopicoCardHTML(topico, { titulo: 'Agora', voltar: !!estudosTopicoManual });
  wireTopicoCard(area, topico);
}

function renderTopicoCardHTML(topico, opts) {
  const estado = estadoTopico(progresso, topico.id);
  const badge = ESTADO_BADGE[estado] || ESTADO_BADGE.nao_visto;
  const recursos = (topico.recursos || [])
    .map(r => `<a href="${sanitize(r.url)}" target="_blank" rel="noopener" class="estudo-recurso">${sanitize(r.nome)}</a>`)
    .join('');
  return `
    <div class="estudo-card">
      <div class="estudo-card-hdr">
        <span>${sanitize(opts.titulo || 'Tópico')}</span>
        <span class="estado-badge" style="color:${badge.color};background:${badge.bg};">${badge.label}</span>
      </div>
      ${opts.voltar ? '<button class="estudo-voltar-btn">← voltar para o próximo</button>' : ''}
      <div class="estudo-topico-titulo">${sanitize(topico.titulo)} <span class="estudo-duracao">${topico.minutos} min</span></div>
      ${tagsHTML(topico)}
      <div class="estudo-campo estudo-campo-resumo"><div class="estudo-campo-label">O que é isto</div><div class="estudo-campo-texto">${sanitize(topico.resumo)}</div></div>
      <div class="estudo-campo"><div class="estudo-campo-label">Objetivo</div><div class="estudo-campo-texto">${sanitize(topico.objetivo)}</div></div>
      <div class="estudo-campo"><div class="estudo-campo-label">Por que importa</div><div class="estudo-campo-texto">${sanitize(topico.porque_importa)}</div></div>
      <div class="estudo-campo estudo-campo-destaque"><div class="estudo-campo-label">Desafio</div><div class="estudo-campo-texto">${sanitize(topico.desafio)}</div></div>
      <div class="estudo-campo"><div class="estudo-campo-label">Por que ensina</div><div class="estudo-campo-texto">${sanitize(topico.porque_ensina)}</div></div>
      <div class="estudo-campo"><div class="estudo-campo-label">Critério de conclusão</div><div class="estudo-campo-texto">${sanitize(topico.criterio)}</div></div>
      ${recursos ? `<div class="estudo-recursos">${recursos}</div>` : ''}
      <div class="estudo-card-actions">
        <button class="btn btn-primary estudo-concluir-btn">Concluí o desafio</button>
        <button class="btn estudo-triar-btn">Triar este tópico</button>
      </div>
    </div>`;
}

function wireTopicoCard(container, topico) {
  const concluirBtn = container.querySelector('.estudo-concluir-btn');
  if (concluirBtn) concluirBtn.addEventListener('click', () => concluirDesafio(topico.id));
  const triarBtn = container.querySelector('.estudo-triar-btn');
  if (triarBtn) triarBtn.addEventListener('click', () => abrirTriagem([topico]));
  const voltarBtn = container.querySelector('.estudo-voltar-btn');
  if (voltarBtn) voltarBtn.addEventListener('click', () => { estudosTopicoManual = null; renderAgora(); });
}

async function concluirDesafio(topicoId) {
  marcarTopicoSei(progresso, topicoId, 'desafio');
  await saveProgresso();
  await sincronizarOcorrenciaAoFecharTopico(topicoId);
  estudosTopicoManual = null;
  renderEstudos();
  showToast('Tópico concluído ✓');
}

// ═══ BLOCO REVISAR ═══
function renderRevisar() {
  const area = document.getElementById('estudosRevisar');
  const hoje = new Date().toISOString().slice(0, 10);
  const vencidos = topicosVencidos(inventario, progresso, hoje);
  if (!vencidos.length) { area.innerHTML = ''; return; }

  area.innerHTML = '<div class="estudo-secao-hdr">Revisar</div><div class="regras-list" id="revisarList"></div>';
  const list = area.querySelector('#revisarList');

  vencidos.forEach(({ topico, modulo, progresso: p }) => {
    const acaoLabel = p.origem === 'triagem' ? 'Refazer triagem' : 'Refazer desafio';
    const row = document.createElement('div');
    row.className = 'regra-row';
    row.innerHTML = `
      <div class="regra-row-info">
        <div class="regra-row-title">${sanitize(topico.titulo)}</div>
        <div class="regra-row-meta">${sanitize(modulo.titulo)} · vencido</div>
      </div>
      <button class="btn btn-primary revisar-acao-btn">${acaoLabel}</button>`;
    row.querySelector('.revisar-acao-btn').addEventListener('click', async () => {
      if (p.origem === 'triagem') {
        const completo = await topicoCompleto(modulo.id, topico.id);
        if (completo) abrirTriagem([completo]);
      } else {
        aplicarRevisaoConcluida(progresso, topico.id);
        await saveProgresso();
        renderEstudos();
        showToast('Revisão registrada ✓');
      }
    });
    list.appendChild(row);
  });
}

// ═══ NAVEGAÇÃO FASE → MÓDULO → TÓPICO ═══
function renderNavegacao() {
  const area = document.getElementById('estudosNav');
  if (!estudosFasesAbertas) {
    estudosFasesAbertas = new Set((inventario.fases || []).filter(f => f.status === 'ativa').map(f => f.numero));
  }
  area.innerHTML = '<div class="estudo-secao-hdr">Fases</div>';

  [...(inventario.fases || [])].sort((a, b) => a.numero - b.numero).forEach(fase => {
    const aberta = estudosFasesAbertas.has(fase.numero);
    const ativa = fase.status === 'ativa';
    const modulos = moduloOrder(inventario, fase.numero);
    const totalTopicos = modulos.reduce((s, m) => s + (m.topicos || []).length, 0);
    const totalHoras = Math.round(modulos.reduce((s, m) => s + (m.minutos_estimados || 0), 0) / 60);

    const wrap = document.createElement('div');
    wrap.className = 'fase-wrap' + (ativa ? ' ativa' : ' futura');
    wrap.innerHTML = `
      <button class="fase-hdr${aberta ? ' aberta' : ''}">
        <span class="estudo-fase-num">${fase.numero}</span>
        <span class="fase-mid">
          <span class="fase-nome">${sanitize(fase.nome)}<span class="estudo-fase-badge ${ativa ? 'on' : 'off'}">${ativa ? 'ativa' : 'depois'}</span></span>
          <span class="fase-resumo">${modulos.length} módulos · ${totalTopicos} tópicos · ~${totalHoras}h</span>
        </span>
      </button>
      <div class="fase-body" style="display:${aberta ? '' : 'none'}">
        <div class="fase-obj">${sanitize(fase.objetivo)}</div>
      </div>`;
    wrap.querySelector('.fase-hdr').addEventListener('click', () => {
      if (estudosFasesAbertas.has(fase.numero)) estudosFasesAbertas.delete(fase.numero);
      else estudosFasesAbertas.add(fase.numero);
      renderNavegacao();
    });

    const body = wrap.querySelector('.fase-body');
    modulos.forEach((modulo, i) => renderModuloRow(body, modulo, { ativa, posicao: i + 1 }));
    area.appendChild(wrap);
  });
}

function renderModuloRow(container, modulo, opts) {
  const aberto = estudosModulosAbertos.has(modulo.id);
  const { feitos, total } = progressoTopicos(modulo.topicos, progresso);
  const foco = modulo.id === config.moduloFoco;

  const wrap = document.createElement('div');
  wrap.className = 'modulo-wrap' + (foco ? ' foco' : '') + (modulo.conteudo_escrito ? '' : ' vazio');
  wrap.innerHTML = `
    <button class="modulo-hdr">
      <span class="modulo-titulo">${opts.ativa ? `<span class="estudo-mod-pos">${opts.posicao}</span>` : ''}${sanitize(modulo.id)} · ${sanitize(modulo.titulo)}</span>
      ${modulo.conteudo_escrito
        ? `<span class="modulo-progresso">${feitos}/${total}</span>`
        : '<span class="estudo-conteudo-pendente">conteúdo a escrever</span>'}
    </button>
    <div class="modulo-body" style="display:${aberto ? '' : 'none'}"></div>`;
  wrap.querySelector('.modulo-hdr').addEventListener('click', () => {
    if (estudosModulosAbertos.has(modulo.id)) estudosModulosAbertos.delete(modulo.id);
    else estudosModulosAbertos.add(modulo.id);
    renderNavegacao();
  });

  const body = wrap.querySelector('.modulo-body');

  if (modulo.conteudo_escrito) {
    const acoes = document.createElement('div');
    acoes.className = 'modulo-acoes';
    acoes.innerHTML = `
      <button class="btn modulo-triar-btn">Triar módulo</button>
      <button class="btn modulo-export-btn">Exportar conteúdo</button>`;
    acoes.querySelector('.modulo-triar-btn').addEventListener('click', () => triarModulo(modulo.id));
    acoes.querySelector('.modulo-export-btn').addEventListener('click', () => exportarConteudo(modulo.id));
    body.appendChild(acoes);
  }

  (modulo.topicos || []).filter(t => passaFiltroTopico(t, estudosFiltro)).forEach(topico => {
    const estado = estadoTopico(progresso, topico.id);
    const badge = ESTADO_BADGE[estado] || ESTADO_BADGE.nao_visto;
    const row = document.createElement('div');
    row.className = 'topico-row' + (modulo.conteudo_escrito ? ' clicavel' : '');
    row.innerHTML = `
      <div class="topico-row-main">
        <span class="topico-row-titulo">${sanitize(topico.titulo)}</span>
        <span class="topico-row-duracao">${topico.minutos}min</span>
        <span class="estado-badge" style="color:${badge.color};background:${badge.bg};">${badge.label}</span>
      </div>
      ${tagsHTML(topico)}`;
    if (modulo.conteudo_escrito) {
      row.addEventListener('click', () => {
        estudosTopicoManual = { moduloId: modulo.id, topicoId: topico.id };
        renderAgora();
        document.getElementById('estudosAgora').scrollIntoView({ behavior: 'smooth' });
      });
    }
    body.appendChild(row);
  });

  container.appendChild(wrap);
}

// ═══ FILTRO POR NATUREZA/FERRAMENTA (zona de referência) ═══
function renderFiltros() {
  const area = document.getElementById('estudosFiltros');
  const todosTopicos = (inventario.modulos || []).flatMap(m => m.topicos || []);
  const ferramentas = [...new Set(todosTopicos.map(t => t.ferramenta).filter(Boolean))].sort();

  const opcoes = [['tudo', 'Tudo'], ['teoria', 'Só teoria'], ...ferramentas.map(f => [f, f])];
  area.innerHTML = '';
  opcoes.forEach(([chave, rotulo]) => {
    const n = todosTopicos.filter(t => passaFiltroTopico(t, chave)).length;
    if (!n) return;
    const btn = document.createElement('button');
    btn.className = 'estudo-filtro-btn' + (estudosFiltro === chave ? ' on' : '');
    btn.textContent = `${rotulo} ${n}`;
    btn.addEventListener('click', () => { estudosFiltro = chave; renderFiltros(); renderNavegacao(); });
    area.appendChild(btn);
  });
}

// ═══ TRIAGEM (SDD 6.7) ═══
let triagemQueue = [];
let triagemIdx = 0;

function abrirTriagem(topicos) {
  if (!topicos.length) return;
  triagemQueue = topicos;
  triagemIdx = 0;
  renderTriagemAtual();
  document.getElementById('triagemModal').classList.add('open');
}

async function triarModulo(moduloId) {
  const modulo = moduloPorId(inventario, moduloId);
  if (!modulo) return;
  const topicos = [];
  for (const t of modulo.topicos || []) {
    const completo = await topicoCompleto(moduloId, t.id);
    if (completo) topicos.push(completo);
  }
  if (!topicos.length) { showToast('Nenhum tópico com conteúdo pra triar'); return; }
  abrirTriagem(topicos);
}

function renderTriagemAtual() {
  const topico = triagemQueue[triagemIdx];
  document.getElementById('triagemTitulo').textContent = `Triagem · ${topico.titulo} (${triagemIdx + 1}/${triagemQueue.length})`;
  document.getElementById('triagemResumo').textContent = '';

  const body = document.getElementById('triagemBody');
  body.innerHTML = (topico.triagem || []).map((pergunta, pi) => `
    <div class="triagem-pergunta" data-pi="${pi}">
      <div class="triagem-pergunta-texto">${sanitize(pergunta.pergunta)}</div>
      <div class="triagem-alternativas">
        ${pergunta.alternativas.map(alt => `
          <label class="triagem-alt">
            <input type="radio" name="tp_${pi}" value="${sanitize(alt.id)}">
            <span>${sanitize(alt.texto)}</span>
          </label>`).join('')}
      </div>
      <div class="triagem-explicacao" style="display:none"></div>
    </div>`).join('');

  document.getElementById('triagemResponderBtn').style.display = '';
  document.getElementById('triagemContinuarBtn').style.display = 'none';
}

async function responderTriagemAtual() {
  const topico = triagemQueue[triagemIdx];
  const perguntaEls = document.querySelectorAll('#triagemBody .triagem-pergunta');
  const respostasPorIndice = [];
  let faltaResponder = false;
  perguntaEls.forEach((el, pi) => {
    const marcado = el.querySelector(`input[name="tp_${pi}"]:checked`);
    if (!marcado) faltaResponder = true;
    respostasPorIndice[pi] = marcado ? marcado.value : null;
  });
  if (faltaResponder) { showToast('Responde todas as perguntas antes de continuar'); return; }

  const { passouTudo, detalhes } = avaliarTriagem(topico, respostasPorIndice);
  aplicarResultadoTriagem(progresso, topico, passouTudo);
  await saveProgresso();

  perguntaEls.forEach((el, pi) => {
    const d = detalhes[pi];
    const exp = el.querySelector('.triagem-explicacao');
    exp.style.display = '';
    exp.innerHTML = `<span class="${d.correta ? 'triagem-ok' : 'triagem-erro'}">${d.correta ? '✓ Correto' : '✕ Errou'}</span> ${sanitize(d.explicacao)}`;
    el.querySelectorAll('input[type=radio]').forEach(r => { r.disabled = true; });
  });

  document.getElementById('triagemResumo').textContent = passouTudo
    ? 'Passou — marcado como sabido, reteste em 120 dias.'
    : 'Não passou dessa vez — entra na fila de estudo.';
  document.getElementById('triagemResponderBtn').style.display = 'none';
  document.getElementById('triagemContinuarBtn').style.display = '';
}

function continuarTriagem() {
  triagemIdx++;
  if (triagemIdx >= triagemQueue.length) {
    closeTriagemModal();
    renderEstudos();
    showToast('Triagem concluída');
    return;
  }
  renderTriagemAtual();
}

function closeTriagemModal(e) {
  if (!e || e.target === document.getElementById('triagemModal')) {
    document.getElementById('triagemModal').classList.remove('open');
  }
}

// ═══ IMPORTAÇÃO / EXPORTAÇÃO DE CONTEÚDO (seção 8) ═══
function validarConteudoModulo(data, inv) {
  if (!data || typeof data !== 'object') return { ok: false, erro: 'arquivo não é um objeto JSON válido' };
  if (!data.modulo) return { ok: false, erro: 'campo "modulo" ausente' };
  const moduloInv = moduloPorId(inv, data.modulo);
  if (!moduloInv) return { ok: false, erro: `módulo "${data.modulo}" não existe no inventário` };
  if (!Array.isArray(data.topicos) || !data.topicos.length) return { ok: false, erro: 'campo "topicos" ausente ou vazio' };

  const idsVistos = new Set();
  for (const t of data.topicos) {
    if (!t.id) return { ok: false, erro: 'há um tópico sem "id"' };
    if (idsVistos.has(t.id)) return { ok: false, erro: `id duplicado: "${t.id}"` };
    idsVistos.add(t.id);

    for (const campo of ['resumo', 'objetivo', 'porque_importa', 'desafio', 'porque_ensina', 'criterio', 'natureza']) {
      if (!t[campo]) return { ok: false, erro: `tópico "${t.id}": campo "${campo}" ausente` };
    }
    if (!('ferramenta' in t)) return { ok: false, erro: `tópico "${t.id}": campo "ferramenta" ausente (pode ser null, mas a chave precisa existir)` };
    if (!Array.isArray(t.recursos)) return { ok: false, erro: `tópico "${t.id}": campo "recursos" precisa ser uma lista` };
    if (!Array.isArray(t.triagem) || !t.triagem.length) return { ok: false, erro: `tópico "${t.id}": campo "triagem" ausente ou vazio` };

    for (const pergunta of t.triagem) {
      const idsAlternativas = (pergunta.alternativas || []).map(a => a.id);
      if (!idsAlternativas.includes(pergunta.correta)) {
        return { ok: false, erro: `tópico "${t.id}": "correta" (${pergunta.correta}) não aponta para nenhuma alternativa` };
      }
    }
    if (!(moduloInv.topicos || []).some(mt => mt.id === t.id)) {
      return { ok: false, erro: `tópico "${t.id}" não existe na lista de tópicos do módulo ${data.modulo} no inventário` };
    }
  }
  return { ok: true };
}

async function importarConteudo(file) {
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { showToast('Import rejeitado: arquivo não é JSON válido'); return; }

  const validacao = validarConteudoModulo(data, inventario);
  if (!validacao.ok) { showToast('Import rejeitado: ' + validacao.erro); return; }

  await saveConteudoModulo(data.modulo, data);
  const moduloInv = moduloPorId(inventario, data.modulo);
  moduloInv.conteudo_escrito = true;
  await saveInventario();
  renderEstudos();
  showToast(`Conteúdo de ${data.modulo} importado ✓`);
}

async function exportarConteudo(moduloId) {
  const conteudo = await getConteudoModulo(moduloId);
  if (!conteudo) { showToast('Este módulo não tem conteúdo pra exportar'); return; }
  downloadJSON(`conteudo-${moduloId}.json`, conteudo);
}

// ═══ SETUP (chamado uma vez no boot) ═══
function setupEstudosListeners() {
  document.getElementById('estudosModuloFocoSelect').addEventListener('change', e => trocarModuloFoco(e.target.value));
  document.getElementById('estudoPrazoInput').addEventListener('change', e => definirPrazoModulo(e.target.value));
  document.getElementById('estudosImportInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) importarConteudo(file);
    e.target.value = '';
  });
  document.getElementById('triagemResponderBtn').addEventListener('click', responderTriagemAtual);
  document.getElementById('triagemContinuarBtn').addEventListener('click', continuarTriagem);
}
