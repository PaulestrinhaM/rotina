// ═══ TRACKER ═══
let activeDay = null;

function ocorrenciasContexto() {
  return { books, inventario, progresso, config };
}

function semanaOcorrencias() {
  return expandOcorrenciasSemana(regras, tipos, semana, getMondayKey(), ocorrenciasContexto());
}

function renderTracker(day) {
  const diaAnterior = activeDay;
  activeDay = day || DAYS[todayIdx()];
  document.getElementById('weekBadge').textContent = weekLabel(getMondayKey());

  const ocorrencias = semanaOcorrencias();
  updateScoreBanner(ocorrencias);

  const strip = document.getElementById('dayStrip');
  strip.innerHTML = '';
  DAYS.forEach((d, i) => {
    const { score10, donePts, totalPts } = calcDisciplinaDia(ocorrencias, d);
    const pct = totalPts ? Math.round(donePts / totalPts * 100) : 0;
    const allDone = totalPts > 0 && donePts === totalPts;
    const moodEmoji = getMoodEmoji(d, getMondayKey());

    const pill = document.createElement('button');
    pill.className = 'day-pill' + (d === activeDay ? ' active' : '') + (i === todayIdx() ? ' today' : '') + (allDone ? ' all-done' : '');
    pill.innerHTML = `
      <span class="dp-name">${DAYS_SHORT[i]}${moodEmoji ? ' ' + moodEmoji : ''}</span>
      <span class="dp-pct">${pct}%</span>
    `;
    pill.addEventListener('click', () => renderTracker(d));
    strip.appendChild(pill);
  });

  renderDayOcorrencias(ocorrencias, activeDay);
  renderPausadas();
  // Diário só precisa re-renderizar quando o dia mostrado muda de verdade —
  // ações do Tracker (marcar ocorrência, pausar regra, etc.) chamam
  // renderTracker(activeDay) com o MESMO dia só pra atualizar banner/lista,
  // e um renderJournal() incondicional aqui fechava o acordeão e destruía
  // o textarea (perdendo foco/digitação) a cada uma dessas ações.
  if (activeDay !== diaAnterior) renderJournal(activeDay);
  updateWeekBar(ocorrencias);
}

function updateScoreBanner(ocorrencias) {
  const disciplina = calcDisciplina(ocorrencias);
  const minutosFechados = minutosFechadosNaSemana(inventario, progresso, getMondayKey());
  const estudos = calcEstudos(ocorrencias, minutosFechados);

  const gd = gradeOf(disciplina.score10);
  document.getElementById('scoreDisciplina').textContent = disciplina.score10.toFixed(1) + '/10';
  document.getElementById('scoreDisciplina').style.color = gd.color;
  document.getElementById('scoreDisciplinaSub').textContent = `· ${disciplina.donePts}/${disciplina.totalPts} pts`;

  const estEl = document.getElementById('scoreEstudos');
  const estSub = document.getElementById('scoreEstudosSub');
  if (estudos === null) {
    estEl.textContent = '—';
    estEl.style.color = 'var(--muted2)';
    estSub.textContent = 'sem meta de estudo';
  } else {
    const ge = gradeOf(estudos.score10);
    estEl.textContent = estudos.score10.toFixed(1) + '/10';
    estEl.style.color = ge.color;
    estSub.textContent = `· ${estudos.doneMin}/${estudos.totalMin} min`;
  }
}

function renderDayOcorrencias(ocorrencias, day) {
  const ts = ocorrenciasDoDia(ocorrencias, day);
  const { donePts, totalPts } = calcDisciplina(ts);
  const pct = totalPts ? Math.round(donePts / totalPts * 100) : 0;
  const conflicts = getConflictIds(ts);
  const area = document.getElementById('tasksList');

  area.innerHTML = `
    <div class="day-hdr">
      <div class="day-title">${sanitize(day)}</div>
      <div class="day-pts">${donePts}/${totalPts} pts</div>
    </div>
    <div class="dprog-wrap"><div class="dprog-fill${pct === 100 ? ' done' : ''}" style="width:${pct}%"></div></div>`;

  if (!ts.length) { area.innerHTML += '<div class="empty">NENHUMA OCORRÊNCIA</div>'; return; }

  ts.forEach(occ => {
    const hasConflict = conflicts.has(occ.id);
    const isEstudoDuplo = occ.conteudo === 'roadmap' && (occ.topicoIds || []).length > 0;
    const card = document.createElement('div');
    card.className = 'task-card' + (occ.feito ? ' checked' : '') + (hasConflict ? ' conflict' : '') + (occ.parcial ? ' parcial' : '');
    card.innerHTML = `
      <div class="chk"><svg class="chk-svg" width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l3 3 5-5" stroke="#0c0c10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div class="t-icon">${sanitize(occ.icone)}</div>
      <div class="t-info">
        <div class="t-label">${sanitize(occ.titulo)}</div>
        <div class="t-meta">
          <span class="t-time">${sanitize(occ.time)}</span>
          <span class="t-pts-badge">${occ.peso} pt${occ.peso > 1 ? 's' : ''}</span>
          ${hasConflict ? '<span class="t-conflict-badge">⚠ conflito</span>' : ''}
          ${occ.avisoNaoCabe ? '<span class="t-conflict-badge">⚠ não cabe no slot</span>' : ''}
          ${occ.semLivro ? '<button class="t-choose-livro-btn">Escolher livro</button>' : ''}
        </div>
        ${isEstudoDuplo && !occ.feito ? `
          <div class="t-estudo-actions">
            <button class="btn btn-primary t-estudo-btn">Feito</button>
            <button class="btn t-estudo-btn-parcial">Sentei, não terminei</button>
          </div>` : ''}
      </div>
      <div class="t-occ-actions">
        <button class="t-occ-btn" title="Pular esta ocorrência">⏭</button>
        <button class="t-occ-btn" title="Pausar regra nesta semana">⏸</button>
      </div>`;
    const [pularBtn, pausarBtn] = card.querySelectorAll('.t-occ-btn');
    pularBtn.addEventListener('click', e => { e.stopPropagation(); pularOcorrencia(occ.id); });
    pausarBtn.addEventListener('click', e => { e.stopPropagation(); pausarRegra(occ.regraId); });
    const chooseLivroBtn = card.querySelector('.t-choose-livro-btn');
    if (chooseLivroBtn) chooseLivroBtn.addEventListener('click', e => {
      e.stopPropagation();
      switchView('refs', document.getElementById('bn-refs'));
    });

    if (isEstudoDuplo) {
      if (!occ.feito) {
        const feitoBtn = card.querySelector('.t-estudo-btn');
        const parcialBtn = card.querySelector('.t-estudo-btn-parcial');
        feitoBtn.addEventListener('click', e => { e.stopPropagation(); marcarEstudoFeito(occ.id); });
        parcialBtn.addEventListener('click', e => { e.stopPropagation(); marcarEstudoParcial(occ.id); });
      }
      // sem toggle no clique do card: check duplo tem duas ações explícitas.
    } else {
      card.addEventListener('click', () => toggleOcorrencia(occ.id));
    }
    area.appendChild(card);
  });
}

function renderPausadas() {
  const area = document.getElementById('tasksList');
  const pausadas = semana.pausadas || [];
  if (!pausadas.length) return;

  const wrap = document.createElement('div');
  wrap.className = 'pausadas-wrap';
  wrap.innerHTML = '<div class="pausadas-label">Pausadas nesta semana</div>';
  pausadas.forEach(regraId => {
    const regra = regras.find(r => r.id === regraId);
    const tipo = regra ? tipoPorId(regra.tipoId) : null;
    const nome = regra ? (regra.titulo || (tipo ? tipo.nome : regraId)) : regraId;
    const chip = document.createElement('button');
    chip.className = 'pausada-chip';
    chip.textContent = `${nome} ✕`;
    chip.title = 'Reativar esta semana';
    chip.addEventListener('click', () => despausarRegra(regraId));
    wrap.appendChild(chip);
  });
  area.appendChild(wrap);
}

// ═══ CHECK DUPLO DO SLOT DE ESTUDO (SDD 6.5) ═══
async function marcarEstudoFeito(occId) {
  const occ = semanaOcorrencias().find(o => o.id === occId);
  if (!occ) return;
  semana.checks[occId] = { feito: true, parcial: false, em: new Date().toISOString() };
  if (occ.topicoIds && occ.topicoIds.length) {
    semana.alocacoes[occId] = { topicoIds: occ.topicoIds };
    occ.topicoIds.forEach(topicoId => marcarTopicoSei(progresso, topicoId, 'desafio'));
    await saveProgresso();
  }
  await saveSemana();
  renderTracker(activeDay);
  showToast('Tópico concluído ✓');
}

async function marcarEstudoParcial(occId) {
  const occ = semanaOcorrencias().find(o => o.id === occId);
  if (!occ) return;
  semana.checks[occId] = { feito: true, parcial: true, em: new Date().toISOString() };
  if (occ.topicoIds && occ.topicoIds.length) {
    semana.alocacoes[occId] = { topicoIds: occ.topicoIds };
  }
  await saveSemana();
  renderTracker(activeDay);
  showToast('Ocorrência fechada — tópico segue pendente');
}

// Sentido inverso do check duplo: fechar um tópico pela aba Estudos marca a
// ocorrência de estudo do dia, se existir e ainda estiver aberta (SDD 6.5).
async function sincronizarOcorrenciaAoFecharTopico(topicoId) {
  const hoje = DAYS[todayIdx()];
  const alvo = semanaOcorrencias().find(o =>
    o.diaSemana === hoje && o.conteudo === 'roadmap' && !o.feito && (o.topicoIds || []).includes(topicoId)
  );
  if (!alvo) return false;
  semana.checks[alvo.id] = { feito: true, parcial: false, em: new Date().toISOString() };
  semana.alocacoes[alvo.id] = { topicoIds: alvo.topicoIds };
  await saveSemana();
  return true;
}

async function toggleOcorrencia(id) {
  if (!semana.checks[id]) semana.checks[id] = {};
  semana.checks[id].feito = !semana.checks[id].feito;
  semana.checks[id].parcial = false;
  semana.checks[id].em = new Date().toISOString();
  await saveSemana();
  renderTracker(activeDay);
}

async function pularOcorrencia(id) {
  if (!semana.puladas.includes(id)) semana.puladas.push(id);
  await saveSemana();
  renderTracker(activeDay);
  showToast('Ocorrência pulada');
}

async function pausarRegra(regraId) {
  if (!semana.pausadas.includes(regraId)) semana.pausadas.push(regraId);
  await saveSemana();
  renderTracker(activeDay);
  showToast('Regra pausada nesta semana');
}

async function despausarRegra(regraId) {
  semana.pausadas = semana.pausadas.filter(id => id !== regraId);
  await saveSemana();
  renderTracker(activeDay);
  showToast('Regra reativada');
}

function updateWeekBar(ocorrencias) {
  const { donePts, totalPts } = calcDisciplina(ocorrencias);
  const pct = totalPts ? Math.round(donePts / totalPts * 100) : 0;
  document.getElementById('weekFill').style.width = pct + '%';
  document.getElementById('weekPct').textContent = pct + '%';
}
