// ═══ CATÁLOGO DE TIPOS (semente inicial, seção 5.1 do SDD) ═══
const DEFAULT_TIPOS = [
  { id:'academia',     nome:'Academia',             icone:'🏋️', pesoPadrao:9, blocosPadrao:[{de:'07:00',ate:'08:00'}],               conteudo:'fixo' },
  { id:'pos',          nome:'Pós-graduação',        icone:'🎓', pesoPadrao:9, blocosPadrao:[{de:'09:30',ate:'11:30'}],               conteudo:'fixo' },
  { id:'estudo',       nome:'Estudo',               icone:'📚', pesoPadrao:8, blocosPadrao:[{de:'09:30',ate:'11:00'}],               conteudo:'roadmap' },
  { id:'vagas',        nome:'Busca de vagas',       icone:'🔍', pesoPadrao:7, blocosPadrao:[{de:'11:45',ate:'12:30'}],               conteudo:'fixo' },
  { id:'projeto',      nome:'Projeto de portfólio', icone:'🚀', pesoPadrao:8, blocosPadrao:[{de:'14:00',ate:'16:00'}],               conteudo:'fixo' },
  { id:'leitura',      nome:'Leitura',              icone:'📖', pesoPadrao:4, blocosPadrao:[{de:'22:00',ate:'22:30'}],               conteudo:'livro' },
  { id:'psicologa',    nome:'Psicóloga',            icone:'🧠', pesoPadrao:7, blocosPadrao:[{de:'19:00',ate:'20:00'}],               conteudo:'fixo' },
  { id:'visita-pais',  nome:'Visita aos pais',      icone:'🏡', pesoPadrao:6, blocosPadrao:[{de:'10:00',ate:'18:00'}],               conteudo:'fixo' },
  { id:'almoco',       nome:'Almoço',               icone:'🍽️', pesoPadrao:3, blocosPadrao:[{de:'12:30',ate:'13:30'}],               conteudo:'fixo' },
  { id:'faxina',       nome:'Faxina',               icone:'🧹', pesoPadrao:5, blocosPadrao:[{de:'09:00',ate:'10:30'}],               conteudo:'fixo' },
  { id:'marmita',      nome:'Marmita da semana',    icone:'🍱', pesoPadrao:5, blocosPadrao:[{de:'10:00',ate:'12:00'}],               conteudo:'fixo' },
  { id:'gaita',        nome:'Gaita',                icone:'🎵', pesoPadrao:4, blocosPadrao:[{de:'19:30',ate:'20:00'}],               conteudo:'fixo' },
  { id:'trabalho',     nome:'Trabalho',             icone:'💼', pesoPadrao:6, blocosPadrao:[{de:'09:00',ate:'12:00'},{de:'13:30',ate:'18:00'}], conteudo:'fixo' },
  { id:'livre',        nome:'Outro',                icone:'📌', pesoPadrao:4, blocosPadrao:[],                                       conteudo:'fixo' },
];

const DEFAULT_CONFIG = { moduloFoco: null, metaVagasSemana: 5, diasParadaVaga: 7, prazosModulo: {} };

function defaultSemana() {
  return { pausadas: [], puladas: [], checks: {}, alocacoes: {}, pesos: {}, atualizadoEm: null };
}

// ═══ STATE ═══
let tipos = [], regras = [], config = {}, semana = {};
let inventario = { fases: [], modulos: [] }, progresso = {};
let resumo = [];
let vagas = [];
const conteudoCache = {};

// ═══ STORAGE ADAPTER ═══
// O browser chama /api/store — o worker faz o proxy para o KV.
// A URL real do KV nunca aparece no cliente.
const WORKER_URL = '/api/store';

// Em qualquer 401, espera o login (camada que abre sozinha, ver js/auth.js)
// e tenta de novo — é o único lugar do app que precisa saber disso.
const store = {
  async get(key) {
    while (true) {
      try {
        const r = await fetch(`${WORKER_URL}?key=${encodeURIComponent(key)}`);
        if (r.status === 401) { await aguardarLogin(); continue; }
        if (!r.ok) return localStorage.getItem(key);
        const json = await r.json();
        return json.value || null;
      } catch {
        return localStorage.getItem(key);
      }
    }
  },

  async set(key, value) {
    while (true) {
      try {
        const r = await fetch(`${WORKER_URL}?key=${encodeURIComponent(key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: value,
        });
        if (r.status === 401) { await aguardarLogin(); continue; }
      } catch {}
      break;
    }
    // Fallback local
    try { localStorage.setItem(key, value); } catch {}
  },

  async del(key) {
    while (true) {
      try {
        const r = await fetch(`${WORKER_URL}?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
        if (r.status === 401) { await aguardarLogin(); continue; }
      } catch {}
      break;
    }
    try { localStorage.removeItem(key); } catch {}
  },

  async listKeys(prefix) {
    while (true) {
      try {
        const r = await fetch(`/api/keys?prefix=${encodeURIComponent(prefix || '')}`);
        if (r.status === 401) { await aguardarLogin(); continue; }
        if (!r.ok) return [];
        const json = await r.json();
        return json.keys || [];
      } catch {
        return [];
      }
    }
  },
};

// ═══ LOAD / SEED ═══
async function loadOrSeed(key, defaultValue) {
  try {
    const raw = await store.get(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  const seeded = clone(defaultValue);
  await store.set(key, JSON.stringify(seeded));
  return seeded;
}

// Como loadOrSeed, mas a semente vem de um arquivo estático do repositório
// (servido pelo ASSETS do worker), não de uma constante no JS.
async function loadOrSeedFromFile(key, filePath, fallback) {
  try {
    const raw = await store.get(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  let seeded = fallback;
  try {
    const r = await fetch(filePath);
    if (r.ok) seeded = await r.json();
  } catch {}
  await store.set(key, JSON.stringify(seeded));
  return seeded;
}

async function loadAll() {
  tipos      = await loadOrSeed('v2:tipos', DEFAULT_TIPOS);
  regras     = await loadOrSeed('v2:regras', []);
  config     = await loadOrSeed('v2:config', DEFAULT_CONFIG);
  semana     = await loadOrSeed('v2:semana:' + getMondayKey(), defaultSemana());
  inventario = await loadOrSeedFromFile('v2:inventario', '/SDD/inventario.json', { fases: [], modulos: [] });
  progresso  = await loadOrSeed('v2:progresso', {});
  resumo     = await loadOrSeed('v2:resumo', []);
  vagas      = await loadOrSeed('v2:vagas', []);
  conteudoCache['1.1'] = await loadOrSeedFromFile('v2:conteudo:1.1', '/SDD/conteudo-1.1.json', null);
}

async function saveTipos()      { await store.set('v2:tipos', JSON.stringify(tipos)); }
async function saveRegras()     { await store.set('v2:regras', JSON.stringify(regras)); }
async function saveConfig()     { await store.set('v2:config', JSON.stringify(config)); }
async function saveInventario() { await store.set('v2:inventario', JSON.stringify(inventario)); }
async function saveProgresso()  { await store.set('v2:progresso', JSON.stringify(progresso)); }
async function saveResumo()     { await store.set('v2:resumo', JSON.stringify(resumo)); }
async function saveVagas()      { await store.set('v2:vagas', JSON.stringify(vagas)); }

// ═══ RESUMO SEMANAL (SDD 5.4) — sem tela, insumo da projeção (passo 7) ═══
// "Escrito ao final de cada semana, ou na primeira abertura da semana
// seguinte." Como o app não tem job de fundo, isso roda no boot: qualquer
// v2:semana:<segunda> anterior à semana corrente que ainda não tenha uma
// linha em v2:resumo ganha uma, calculada com as regras/tipos atuais.
async function fecharSemanasPendentes() {
  const hojeMonday = getMondayKey();
  const semanaKeys = await store.listKeys('v2:semana:');
  const jaResumidas = new Set(resumo.map(r => r.semana));
  const pendentes = semanaKeys
    .map(k => k.slice('v2:semana:'.length))
    .filter(mon => mon < hojeMonday && !jaResumidas.has(mon))
    .sort();

  for (const mon of pendentes) {
    let semanaAntiga;
    try {
      const raw = await store.get('v2:semana:' + mon);
      semanaAntiga = raw ? JSON.parse(raw) : null;
    } catch { semanaAntiga = null; }
    if (!semanaAntiga) continue;

    const contexto = { books, inventario, progresso, config };
    const ocorrencias = expandOcorrenciasSemana(regras, tipos, semanaAntiga, mon, contexto);
    const disciplina = calcDisciplina(ocorrencias);
    const minutosFeitos = minutosFechadosNaSemana(inventario, progresso, mon);
    const estudosCalc = calcEstudos(ocorrencias, minutosFeitos);
    const minutosPlanejados = ocorrencias
      .filter(o => o.conteudo === 'roadmap')
      .reduce((s, o) => s + blocoMinutos(o.bloco), 0);

    resumo.push({
      semana: mon,
      disciplina: disciplina.score10,
      estudos: estudosCalc ? estudosCalc.score10 : null,
      minutosEstudoFeitos: minutosFeitos,
      minutosEstudoPlanejados: minutosPlanejados,
      topicosFechados: topicosFechadosNaSemana(inventario, progresso, mon).length,
    });
  }

  if (pendentes.length) await saveResumo();
}

async function saveSemana() {
  semana.atualizadoEm = new Date().toISOString();
  await store.set('v2:semana:' + getMondayKey(), JSON.stringify(semana));
}

function tipoPorId(id) {
  return tipos.find(t => t.id === id) || null;
}

// Conteúdo é particionado por módulo (seção 3.4 do SDD) — carrega sob
// demanda em vez de tudo no boot.
async function getConteudoModulo(moduloId) {
  if (conteudoCache[moduloId] !== undefined) return conteudoCache[moduloId];
  try {
    const raw = await store.get('v2:conteudo:' + moduloId);
    conteudoCache[moduloId] = raw ? JSON.parse(raw) : null;
  } catch {
    conteudoCache[moduloId] = null;
  }
  return conteudoCache[moduloId];
}

async function saveConteudoModulo(moduloId, conteudo) {
  conteudoCache[moduloId] = conteudo;
  await store.set('v2:conteudo:' + moduloId, JSON.stringify(conteudo));
}
