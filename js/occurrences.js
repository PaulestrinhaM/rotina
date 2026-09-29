// ═══ EXPANSÃO DE REGRAS EM OCORRÊNCIAS (SDD seção 6.1) ═══
// Lógica pura, sem tocar o DOM. Reaproveitada pelo tracker e, futuramente,
// por qualquer outra tela que precise da semana expandida.

function blocoMinutos(bloco) {
  const [dh, dm] = bloco.de.split(':').map(Number);
  const [ah, am] = bloco.ate.split(':').map(Number);
  return (ah * 60 + am) - (dh * 60 + dm);
}

// Título (e, para roadmap, os tópicos) resolvidos de tipos com conteúdo
// dinâmico (SDD 6.3/6.4). `regra` entra para respeitar `moduloFixo`.
function resolveTituloOcorrencia(tipo, regra, bloco, contexto) {
  if (!tipo) return { titulo: null, semLivro: false, topicoIds: null, avisoNaoCabe: false };

  if (tipo.conteudo === 'roadmap') {
    const inventario = contexto.inventario || { fases: [] };
    const progresso = contexto.progresso || {};
    const moduloId = regra.moduloFixo || (contexto.config && contexto.config.moduloFoco) || primeiroModuloComConteudo(inventario);
    if (!moduloId) return { titulo: `${tipo.nome} · sem conteúdo ainda`, semLivro: false, topicoIds: [], avisoNaoCabe: false };
    const resolucao = resolveSlotEstudo(bloco, moduloId, inventario, progresso);
    if (!resolucao.topicoIds.length) {
      const texto = resolucao.moduloConcluido ? `${tipo.nome} · módulo concluído` : `${tipo.nome} · sem conteúdo ainda`;
      return { titulo: texto, semLivro: false, topicoIds: [], avisoNaoCabe: false };
    }
    return { titulo: resolucao.titulo, semLivro: false, topicoIds: resolucao.topicoIds, avisoNaoCabe: resolucao.avisoNaoCabe };
  }

  if (tipo.conteudo === 'livro') {
    const lendo = (contexto.books || []).find(b => b.status === 'lendo');
    return lendo
      ? { titulo: `Leitura: ${lendo.title}`, semLivro: false, topicoIds: null, avisoNaoCabe: false }
      : { titulo: null, semLivro: true, topicoIds: null, avisoNaoCabe: false };
  }

  return { titulo: null, semLivro: false, topicoIds: null, avisoNaoCabe: false };
}

function expandRegraSemana(regra, segunda) {
  const entries = [];
  const cad = regra.cadencia || { tipo: 'semanal' };

  if (cad.tipo === 'unica') {
    if (!cad.data || cad.data < segunda || cad.data > addDays(segunda, 6)) return entries;
    const diaSemana = diaSemanaFromDate(cad.data);
    (regra.blocos || []).forEach((bloco, blocoIdx) => {
      entries.push({ data: cad.data, diaSemana, blocoIdx, bloco });
    });
    return entries;
  }

  if (cad.tipo === 'quinzenal') {
    if (!cad.ancora) return entries;
    const diffDias = Math.round((new Date(segunda + 'T12:00:00') - new Date(cad.ancora + 'T12:00:00')) / 86400000);
    const diffSemanas = diffDias / 7;
    const par = ((Math.round(diffSemanas) % 2) + 2) % 2 === 0;
    if (!par) return entries;
  }

  // semanal, ou quinzenal em semana par: gera nos dias marcados
  (regra.dias || []).forEach(dia => {
    const idx = DAYS.indexOf(dia);
    if (idx < 0) return;
    const data = addDays(segunda, idx);
    (regra.blocos || []).forEach((bloco, blocoIdx) => {
      entries.push({ data, diaSemana: dia, blocoIdx, bloco });
    });
  });

  return entries;
}

// contexto = { books, inventario, progresso, config }
function expandOcorrenciasSemana(regrasList, tiposList, semanaState, segunda, contexto) {
  const ocorrencias = [];
  const pausadas = semanaState.pausadas || [];
  const puladas = semanaState.puladas || [];
  const checks = semanaState.checks || {};
  const pesos = semanaState.pesos || {};
  const alocacoes = semanaState.alocacoes || {};
  const ctx = contexto || {};
  const inventario = ctx.inventario || { fases: [] };

  regrasList.forEach(regra => {
    if (pausadas.includes(regra.id)) return;
    const tipo = tiposList.find(t => t.id === regra.tipoId) || null;
    const entries = expandRegraSemana(regra, segunda);

    entries.forEach(entry => {
      const id = `${regra.id}#${entry.data}#${entry.blocoIdx}`;
      if (puladas.includes(id)) return;

      const peso = pesos[regra.id] != null ? pesos[regra.id]
        : (regra.peso != null ? regra.peso : (tipo ? tipo.pesoPadrao : 1));
      const check = checks[id] || {};
      const alocacao = alocacoes[id];

      let titulo, semLivro = false, topicoIds = null, avisoNaoCabe = false;

      if (regra.titulo) {
        titulo = regra.titulo;
      } else if (alocacao && alocacao.topicoIds) {
        // ocorrência já fechada alguma vez: passado é congelado, não re-resolve.
        topicoIds = alocacao.topicoIds;
        titulo = tituloDeTopicos(topicoIds, inventario);
      } else {
        const resolvido = resolveTituloOcorrencia(tipo, regra, entry.bloco, ctx);
        titulo = resolvido.titulo || (tipo ? tipo.nome : '—');
        semLivro = resolvido.semLivro;
        topicoIds = resolvido.topicoIds;
        avisoNaoCabe = resolvido.avisoNaoCabe;
      }

      ocorrencias.push({
        id, regraId: regra.id, tipoId: regra.tipoId,
        titulo,
        semLivro,
        topicoIds,
        avisoNaoCabe,
        icone: tipo ? tipo.icone : '📌',
        conteudo: tipo ? tipo.conteudo : 'fixo',
        peso,
        data: entry.data, diaSemana: entry.diaSemana, blocoIdx: entry.blocoIdx,
        bloco: entry.bloco,
        time: `${entry.bloco.de}–${entry.bloco.ate}`,
        feito: !!check.feito,
        parcial: !!check.parcial,
      });
    });
  });

  return ocorrencias;
}

function ocorrenciasDoDia(ocorrencias, dia) {
  return sortByTime(ocorrencias.filter(o => o.diaSemana === dia));
}

// ═══ AS DUAS NOTAS (SDD seção 6.2) ═══
function calcDisciplina(ocorrencias) {
  let totalPts = 0, donePts = 0;
  ocorrencias.forEach(o => {
    totalPts += o.peso;
    if (o.feito) donePts += o.peso;
  });
  const score10 = totalPts ? +(donePts / totalPts * 10).toFixed(1) : 0;
  return { score10, donePts, totalPts };
}

function calcDisciplinaDia(ocorrencias, dia) {
  return calcDisciplina(ocorrencias.filter(o => o.diaSemana === dia));
}

// minutosFechados: minutos de tópicos fechados na semana. Sempre 0 até o
// passo 4 (Estudos) existir — v2:progresso ainda não é gravado.
function calcEstudos(ocorrencias, minutosFechados = 0) {
  let totalMin = 0;
  ocorrencias.forEach(o => {
    if (o.conteudo === 'roadmap') totalMin += blocoMinutos(o.bloco);
  });
  if (totalMin === 0) return null; // "sem meta de estudo esta semana"
  const score10 = +(minutosFechados / totalMin * 10).toFixed(1);
  return { score10, doneMin: minutosFechados, totalMin };
}

// ═══ PROJEÇÃO DE PRAZO DE MÓDULO (SDD 6.9) ═══
// Minutos de estudo (tipo.conteudo==='roadmap') numa semana típica — a
// capacidade NOMINAL do SDD 6.9, sem contar pausas/pulos de uma semana
// específica (isso é o que expandOcorrenciasSemana faria; aqui é sobre a
// recorrência crua da regra).
function capacidadeSemanalRoadmap(regrasList, tiposList) {
  let total = 0;
  regrasList.forEach(regra => {
    const tipo = tiposList.find(t => t.id === regra.tipoId);
    if (!tipo || tipo.conteudo !== 'roadmap') return;
    const cad = regra.cadencia || { tipo: 'semanal' };
    if (cad.tipo === 'unica') return;
    const diasPorSemana = cad.tipo === 'quinzenal'
      ? (regra.dias || []).length / 2
      : (regra.dias || []).length;
    const minutosPorOcorrencia = (regra.blocos || []).reduce((s, b) => s + blocoMinutos(b), 0);
    total += diasPorSemana * minutosPorOcorrencia;
  });
  return total;
}

// Razão média minutosEstudoFeitos/minutosEstudoPlanejados em v2:resumo.
// null se houver menos de 4 semanas com plano > 0 (SDD 6.9: usa capacidade
// nominal e marca a projeção como estimativa nesse caso).
function aderenciaReal(resumoList) {
  const comPlano = (resumoList || []).filter(r => r.minutosEstudoPlanejados > 0);
  if (comPlano.length < 4) return null;
  const soma = comPlano.reduce((s, r) => s + r.minutosEstudoFeitos / r.minutosEstudoPlanejados, 0);
  return soma / comPlano.length;
}
