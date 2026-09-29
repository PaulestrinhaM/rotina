// ═══ HISTÓRICO ═══
// Lista de semanas (índice vem de v2:resumo + a semana corrente), com
// detalhe dia a dia montado sob demanda reprocessando v2:semana:<segunda>
// com as regras/tipos atuais — mesma técnica de fecharSemanasPendentes().

let historicoAbertos = new Set();  // mondayKeys expandidos
const historicoCache = {};         // mondayKey -> { ocorrencias, disciplina, estudos }

async function dadosDaSemanaHist(mon) {
  if (historicoCache[mon]) return historicoCache[mon];

  const isCurrent = mon === getMondayKey();
  let semanaObj = isCurrent ? semana : null;
  if (!semanaObj) {
    try {
      const raw = await store.get('v2:semana:' + mon);
      semanaObj = raw ? JSON.parse(raw) : defaultSemana();
    } catch { semanaObj = defaultSemana(); }
  }

  const contexto = { books, inventario, progresso, config };
  const ocorrencias = expandOcorrenciasSemana(regras, tipos, semanaObj, mon, contexto);
  const disciplina = calcDisciplina(ocorrencias);
  const minFeitos = minutosFechadosNaSemana(inventario, progresso, mon);
  const estudos = calcEstudos(ocorrencias, minFeitos);

  const dados = { mon, ocorrencias, disciplina, estudos };
  historicoCache[mon] = dados;
  return dados;
}

async function renderHistorico() {
  const list = document.getElementById('histList');
  delete historicoCache[getMondayKey()]; // a semana corrente pode ter mudado desde o último render

  const curMon = getMondayKey();
  const semanasPassadas = resumo.map(r => r.semana).filter(m => m !== curMon);
  const todasSemanas = [curMon, ...semanasPassadas].sort((a, b) => b.localeCompare(a));

  list.innerHTML = '';
  if (!todasSemanas.length) {
    list.innerHTML = '<div class="hist-empty">Nenhum histórico ainda.<br>Completa ocorrências para<br>registrar semanas.</div>';
    return;
  }

  for (const mon of todasSemanas) {
    const dados = await dadosDaSemanaHist(mon);
    list.appendChild(criarHistCard(dados, mon === curMon));
  }
}

function criarHistCard(dados, isCurrent) {
  const { mon, disciplina, estudos } = dados;
  const gd = gradeOf(disciplina.score10);
  const aberto = historicoAbertos.has(mon);
  const pct = disciplina.totalPts ? Math.round(disciplina.donePts / disciplina.totalPts * 100) : 0;

  const badgeEstudos = estudos
    ? `<span class="h-badge ${gradeOf(estudos.score10).cls}">E ${estudos.score10.toFixed(1)}</span>`
    : `<span class="h-badge" style="color:var(--muted2);background:rgba(106,106,134,.14);">E —</span>`;

  const card = document.createElement('div');
  card.className = 'hist-card';
  card.innerHTML = `
    <div class="hist-card-hdr${aberto ? ' open' : ''}">
      <div>
        <div class="hw-label">${isCurrent ? '<span style="color:var(--green);font-size:9px;">●</span> ' : ''}${sanitize(weekLabel(mon))}</div>
        <div class="hw-meta">${disciplina.donePts}/${disciplina.totalPts} pts${isCurrent ? ' · semana atual' : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="display:flex;gap:6px;">
          <span class="h-badge ${gd.cls}">D ${disciplina.score10.toFixed(1)}</span>
          ${badgeEstudos}
        </div>
        <span class="h-chevron">▼</span>
      </div>
    </div>
    <div class="h-prog"><div class="h-prog-fill" style="width:${pct}%;background:${gd.color};"></div></div>
    <div class="h-detail${aberto ? ' open' : ''}"></div>`;

  const hdr = card.querySelector('.hist-card-hdr');
  const detalhe = card.querySelector('.h-detail');

  const montarSeAbrindo = () => {
    if (!detalhe.dataset.montado) {
      montarDetalheHist(detalhe, dados);
      detalhe.dataset.montado = '1';
    }
  };
  if (aberto) montarSeAbrindo();

  hdr.addEventListener('click', () => {
    const abrir = !historicoAbertos.has(mon);
    if (abrir) historicoAbertos.add(mon); else historicoAbertos.delete(mon);
    hdr.classList.toggle('open', abrir);
    detalhe.classList.toggle('open', abrir);
    if (abrir) montarSeAbrindo();
  });

  return card;
}

function montarDetalheHist(container, dados) {
  const { mon, ocorrencias } = dados;

  container.innerHTML = DAYS.map((dia, i) => {
    const ts = ocorrenciasDoDia(ocorrencias, dia);
    const { donePts, totalPts } = calcDisciplina(ts);
    const pct = totalPts ? Math.round(donePts / totalPts * 100) : 0;
    const scoreDia = totalPts ? +(donePts / totalPts * 10).toFixed(1) : 0;
    const gDia = gradeOf(scoreDia);
    const moodEmoji = getMoodEmoji(dia, mon);
    const uid = `${mon}_${i}`;
    return `
      <div class="h-day-row" data-uid="${uid}">
        <div class="h-day-name">${DAYS_SHORT[i]}${moodEmoji ? ' ' + moodEmoji : ''}</div>
        <div class="h-bar-wrap"><div class="h-bar-fill" style="width:${pct}%;background:${gDia.color};"></div></div>
        <div class="h-day-pct">${pct}%</div>
        <div class="h-score-num" style="color:${gDia.color};">${scoreDia}</div>
        <div class="h-day-chevron">›</div>
      </div>
      <div class="h-task-list" id="htl_${uid}"></div>`;
  }).join('');

  DAYS.forEach((dia, i) => {
    const uid = `${mon}_${i}`;
    container.querySelector(`.h-day-row[data-uid="${uid}"]`)
      .addEventListener('click', () => toggleHistDia(mon, i, dados));
  });
}

function toggleHistDia(mon, i, dados) {
  const uid = `${mon}_${i}`;
  const el = document.getElementById('htl_' + uid);
  if (!el) return;
  const row = el.previousElementSibling;
  const isOpen = el.classList.toggle('open');
  row.querySelector('.h-day-chevron').style.transform = isOpen ? 'rotate(90deg)' : '';
  if (isOpen && !el.dataset.montado) {
    montarTarefasDoDiaHist(el, mon, i, dados);
    el.dataset.montado = '1';
  }
}

function montarTarefasDoDiaHist(container, mon, i, dados) {
  const dia = DAYS[i];
  const ts = ocorrenciasDoDia(dados.ocorrencias, dia);

  const monday = new Date(mon + 'T12:00:00');
  const dayDate = new Date(monday);
  dayDate.setDate(monday.getDate() + i);
  const dateKey = dayDate.toISOString().split('T')[0];
  const journalEntry = journal[dateKey] || {};
  const moodInfo = journalEntry.mood ? MOODS.find(m => m.id === journalEntry.mood) : null;
  const journalHtml = (moodInfo || journalEntry.description) ? `
    <div class="h-journal-entry">
      ${moodInfo ? `<div class="h-journal-mood">${moodInfo.emoji} <span class="h-journal-mood-label">${moodInfo.label}</span></div>` : ''}
      ${journalEntry.description ? `<div class="h-journal-desc">${sanitize(journalEntry.description).replace(/\n/g, '<br>')}</div>` : ''}
    </div>` : '';

  const taskRows = ts.map(occ => `
    <div class="h-task-row ${occ.feito ? 'h-task-done' : ''}">
      <span class="h-task-chk">${occ.feito ? '✓' : '○'}</span>
      <span class="h-task-icon">${sanitize(occ.icone)}</span>
      <span class="h-task-label">${sanitize(occ.titulo)}</span>
      <span class="h-task-pts" style="color:${occ.feito ? 'var(--green)' : 'var(--muted)'};">${occ.peso}pt</span>
    </div>`).join('');

  container.innerHTML = journalHtml +
    (taskRows || '<div style="padding:8px 12px;font-family:var(--mono);font-size:10px;color:var(--muted);">SEM OCORRÊNCIAS</div>');
}
