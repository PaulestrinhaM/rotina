// ═══ INVENTÁRIO, PROGRESSO, TRIAGEM, REVISÃO ESPAÇADA ═══
// Lógica pura, sem tocar o DOM. `inventario`/`progresso` sempre explícitos
// nos parâmetros (nunca lidos de global), no mesmo estilo de occurrences.js.
//
// Schema do inventário real (SDD/inventario.json, pasta 2 > pasta 1):
//   { fases: [{numero, nome, objetivo, status}],
//     modulos: [{id, fase (número), titulo, conteudo_escrito, minutos_estimados, topicos:[
//       {id, titulo, minutos, natureza, ferramenta, estado}
//     ]}] }
// `modulos` é um array plano no nível raiz — nunca aninhado em `fase`.
// `topico.estado` do arquivo é ignorado: v2:progresso é a única fonte de
// verdade do estado do usuário.

// Ordem de estudo real da fase 1 — não é a ordem numérica dos módulos.
// Vem do protótipo (SDD/estudos-mvp-v3.html); não existe em nenhum campo do
// inventario.json, por isso mora aqui como constante.
const ORDEM_F1 = ['1.1','1.2','1.3','1.4','1.14','1.15','1.6','1.7','1.8','1.9','1.10','1.11','1.5','1.12','1.16','1.13','1.17'];

function moduloPorId(inventario, id) {
  return (inventario.modulos || []).find(m => m.id === id) || null;
}

function modulosDaFase(inventario, faseNumero) {
  return (inventario.modulos || []).filter(m => m.fase === faseNumero);
}

function faseDoModulo(inventario, moduloId) {
  const modulo = moduloPorId(inventario, moduloId);
  if (!modulo) return null;
  return (inventario.fases || []).find(f => f.numero === modulo.fase) || null;
}

// Módulos de uma fase na ordem de estudo real (ORDEM_F1 para a fase 1;
// módulo fora da constante entra no fim, mesma regra do protótipo).
function moduloOrder(inventario, faseNumero) {
  const doFase = modulosDaFase(inventario, faseNumero);
  if (faseNumero !== 1) return doFase;
  const porOrdem = ORDEM_F1.map(id => doFase.find(m => m.id === id)).filter(Boolean);
  const resto = doFase.filter(m => !ORDEM_F1.includes(m.id));
  return porOrdem.concat(resto);
}

function primeiroModuloComConteudo(inventario) {
  const fases = [...(inventario.fases || [])].sort((a, b) => a.numero - b.numero);
  for (const fase of fases) {
    const m = moduloOrder(inventario, fase.numero).find(mod => mod.conteudo_escrito);
    if (m) return m.id;
  }
  return null;
}

function estadoTopico(progresso, topicoId) {
  return (progresso[topicoId] && progresso[topicoId].estado) || 'nao_visto';
}

// Tópicos "sei" vs total de uma lista de tópicos — reusado pelo KPI de
// fase, pela linha de resumo de cada fase e pela contagem por módulo.
function progressoTopicos(topicos, progresso) {
  const total = (topicos || []).length;
  const feitos = (topicos || []).filter(t => estadoTopico(progresso, t.id) === 'sei').length;
  return { feitos, total };
}

// Dias consecutivos com pelo menos um tópico fechado (.em setado), olhando
// pra trás a partir de hoje (ou ontem, se hoje ainda não tem nada) — porte
// direto de streak() em estudos-mvp-v3.html.
function streakEstudos(progresso, hojeISO) {
  const datas = new Set(Object.values(progresso).map(p => p.em).filter(Boolean));
  let dia = hojeISO || new Date().toISOString().slice(0, 10);
  if (!datas.has(dia)) dia = addDays(dia, -1);
  let n = 0;
  while (datas.has(dia)) { n++; dia = addDays(dia, -1); }
  return n;
}

// true se o tópico deve aparecer sob o filtro ativo ('tudo' | 'teoria' | um
// valor de ferramenta) — mesma regra de passaFiltro() do protótipo.
function passaFiltroTopico(topico, filtro) {
  if (filtro === 'tudo') return true;
  if (filtro === 'teoria') return topico.natureza === 'teoria' && !topico.ferramenta;
  return topico.ferramenta === filtro;
}

function primeiroTopicoPendente(topicos, progresso) {
  return (topicos || []).find(t => estadoTopico(progresso, t.id) !== 'sei') || null;
}

function tituloDeTopicos(topicoIds, inventario) {
  const todos = [];
  (inventario.modulos || []).forEach(m => (m.topicos || []).forEach(t => todos.push(t)));
  return (topicoIds || []).map(id => {
    const t = todos.find(x => x.id === id);
    return t ? t.titulo : id;
  }).join(' + ');
}

// SDD 6.3 — resolução do slot de estudo, passo a passo.
function resolveSlotEstudo(bloco, moduloId, inventario, progresso) {
  let modulo = moduloPorId(inventario, moduloId);

  if (!modulo || !modulo.conteudo_escrito || !(modulo.topicos || []).length) {
    return { topicoIds: [], titulo: null, avisoNaoCabe: false, semConteudo: true };
  }

  let primeiro = primeiroTopicoPendente(modulo.topicos, progresso);

  // módulo esgotado (tudo "sei") -> busca circular pelos módulos da mesma
  // fase, a partir da posição do módulo atual (igual ao protótipo: dá a
  // volta em vez de parar no fim da lista).
  if (!primeiro) {
    const ordem = moduloOrder(inventario, modulo.fase);
    const idxAtual = ordem.findIndex(m => m.id === moduloId);
    const sequencia = ordem.slice(idxAtual + 1).concat(ordem);
    for (const candidato of sequencia) {
      if (candidato.id === moduloId) continue;
      if (!candidato.conteudo_escrito || !(candidato.topicos || []).length) continue;
      const proximo = primeiroTopicoPendente(candidato.topicos, progresso);
      if (proximo) { modulo = candidato; primeiro = proximo; break; }
    }
  }

  if (!primeiro) {
    return { topicoIds: [], titulo: null, avisoNaoCabe: false, moduloConcluido: true };
  }

  const blocoMin = blocoMinutos(bloco);
  const avisoNaoCabe = primeiro.minutos > blocoMin;
  const topicos = [primeiro];

  if (!avisoNaoCabe) {
    const sobra = blocoMin - primeiro.minutos;
    const idxPrimeiro = modulo.topicos.findIndex(t => t.id === primeiro.id);
    const segundo = modulo.topicos.slice(idxPrimeiro + 1).find(t => estadoTopico(progresso, t.id) !== 'sei');
    if (segundo && segundo.minutos <= sobra) topicos.push(segundo);
  }

  return {
    topicoIds: topicos.map(t => t.id),
    titulo: topicos.map(t => t.titulo).join(' + '),
    avisoNaoCabe,
  };
}

// ═══ PROGRESSO (revisão espaçada 3 → 10 → 30 → 30 dias) ═══
function marcarTopicoSei(progresso, topicoId, origem, hojeISO) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  if (origem === 'triagem') {
    progresso[topicoId] = { estado: 'sei', origem: 'triagem', em: hoje, revisarEm: null, revisoes: 0, validade: addDays(hoje, 120) };
  } else {
    progresso[topicoId] = { estado: 'sei', origem: 'desafio', em: hoje, revisarEm: addDays(hoje, 3), revisoes: 0, validade: null };
  }
}

const INTERVALOS_REVISAO_POS = [10, 30]; // após a 1ª revisão: 10 dias; a partir da 2ª: 30
function aplicarRevisaoConcluida(progresso, topicoId, hojeISO) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  const atual = progresso[topicoId] || { estado: 'sei', origem: 'desafio', revisoes: 0 };
  const revisoes = (atual.revisoes || 0) + 1;
  const intervalo = INTERVALOS_REVISAO_POS[Math.min(revisoes - 1, INTERVALOS_REVISAO_POS.length - 1)];
  progresso[topicoId] = { ...atual, estado: 'sei', em: hoje, revisoes, revisarEm: addDays(hoje, intervalo) };
}

// Tópicos que passaram para "sei" dentro de uma semana (qualquer origem,
// dentro ou fora de slot) — base do numerador da nota de estudos (6.2) e do
// resumo semanal (5.4).
function topicosFechadosNaSemana(inventario, progresso, segunda) {
  const fim = addDays(segunda, 6);
  const fechados = [];
  (inventario.modulos || []).forEach(modulo => (modulo.topicos || []).forEach(topico => {
    const p = progresso[topico.id];
    if (p && p.estado === 'sei' && p.em >= segunda && p.em <= fim) fechados.push(topico);
  }));
  return fechados;
}

function minutosFechadosNaSemana(inventario, progresso, segunda) {
  return topicosFechadosNaSemana(inventario, progresso, segunda).reduce((s, t) => s + t.minutos, 0);
}

function topicosVencidos(inventario, progresso, hojeISO) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  const vencidos = [];
  (inventario.modulos || []).forEach(modulo => (modulo.topicos || []).forEach(topico => {
    const p = progresso[topico.id];
    if (!p || p.estado !== 'sei') return;
    if (p.origem === 'desafio' && p.revisarEm && p.revisarEm <= hoje) vencidos.push({ topico, modulo, progresso: p });
    else if (p.origem === 'triagem' && p.validade && p.validade <= hoje) vencidos.push({ topico, modulo, progresso: p });
  }));
  return vencidos;
}

// ═══ PROJEÇÃO DE PRAZO DE MÓDULO (SDD 6.9) ═══
function minutosPendentesModulo(modulo, progresso) {
  return (modulo.topicos || [])
    .filter(t => estadoTopico(progresso, t.id) !== 'sei')
    .reduce((s, t) => s + t.minutos, 0);
}

// Projeta a data de conclusão do módulo a partir dos minutos pendentes e da
// capacidade semanal de estudo. Usa aderência real (SDD 6.9) quando há 4+
// semanas de histórico em v2:resumo; senão usa a capacidade nominal e marca
// a projeção como estimativa.
function projetarPrazoModulo(modulo, progresso, regrasList, tiposList, resumoList, hojeISO) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  const pendentes = minutosPendentesModulo(modulo, progresso);
  if (pendentes === 0) return { concluido: true };

  const nominal = capacidadeSemanalRoadmap(regrasList, tiposList);
  const adesao = aderenciaReal(resumoList);
  const capacidade = adesao != null ? nominal * adesao : nominal;

  if (capacidade <= 0) return { concluido: false, semCapacidade: true, minutosPendentes: pendentes };

  const semanas = pendentes / capacidade;
  const dataProjetada = addDays(hoje, Math.ceil(semanas * 7));
  return { concluido: false, minutosPendentes: pendentes, capacidadeSemanal: capacidade, dataProjetada, estimativa: adesao == null };
}

// ═══ TRIAGEM ═══
// respostasPorIndice[i] = id da alternativa escolhida para topico.triagem[i]
function avaliarTriagem(topico, respostasPorIndice) {
  const detalhes = (topico.triagem || []).map((pergunta, i) => {
    const escolhidaId = respostasPorIndice[i];
    return {
      pergunta: pergunta.pergunta,
      correta: escolhidaId === pergunta.correta,
      explicacao: pergunta.explicacao,
      corretaId: pergunta.correta,
      escolhidaId,
    };
  });
  return { passouTudo: detalhes.length > 0 && detalhes.every(d => d.correta), detalhes };
}

// Acertou tudo -> sei/triagem, reteste em 120 dias. Errou -> em_fila — não
// existe estado "esqueci" (o protótipo, que pesa mais que o SDD original
// nisso, trata todo erro de triagem, seja tópico novo ou reteste, da mesma
// forma).
function aplicarResultadoTriagem(progresso, topico, passouTudo, hojeISO) {
  const hoje = hojeISO || new Date().toISOString().slice(0, 10);
  if (passouTudo) {
    marcarTopicoSei(progresso, topico.id, 'triagem', hoje);
  } else {
    progresso[topico.id] = { estado: 'em_fila', origem: 'triagem', em: null };
  }
}
