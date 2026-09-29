// ═══ CONSTANTS ═══
const DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
const DAYS_SHORT = ['SEG','TER','QUA','QUI','SEX','SAB','DOM'];
const ICONS = ['💼','🎓','📖','🏋️','🎵','🧠','🍱','🧹','👕','📌','⭐','🔥','💡','🎯','✅','🚀','💪','🧘','🏃','🚴','🎸','🎹','🎤','📝','💻','📱','☕','🍎','💊','🛌','🧃','🌅','🌙','⏰','📅','🗓️','📊','📈','💰','🤝','🏆','🎮','📚','✏️','🔬','🌿','🐾','❤️','🧡','💛','💚','💙','💜'];
const MINS = ['00','05','10','15','20','25','30','35','40','45','50','55'];
const HOURS = Array.from({length:24},(_,i)=>String(i).padStart(2,'0'));

// ═══ PURE HELPERS ═══
const clone = o => JSON.parse(JSON.stringify(o));

const todayIdx = () => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; };

function getMondayKey(offset = 0) {
  const n = new Date();
  n.setDate(n.getDate() - ((n.getDay() + 6) % 7) + offset * 7);
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2,'0');
  const d = String(n.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function weekLabel(mon) {
  const m = new Date(mon + 'T12:00:00'), s = new Date(m);
  s.setDate(m.getDate() + 6);
  const f = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  return f(m) + ' – ' + f(s);
}

// ═══ DATAS (regras/ocorrências) ═══
function addDays(dataISO, n) {
  const d = new Date(dataISO + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function diaSemanaFromDate(dataISO) {
  const d = new Date(dataISO + 'T12:00:00');
  const idx = (d.getDay() + 6) % 7; // 0 = Segunda
  return DAYS[idx];
}

// Dias inteiros entre duas datas ISO (positivo se dataISO for antes de hojeISO)
function diffDias(dataISO, hojeISO) {
  return Math.round((new Date(hojeISO + 'T12:00:00') - new Date(dataISO + 'T12:00:00')) / 86400000);
}

function gradeOf(score10) {
  if (score10 >= 9) return { label:'S', cls:'gs', color:'var(--green)' };
  if (score10 >= 7) return { label:'A', cls:'ga', color:'var(--accent)' };
  if (score10 >= 5) return { label:'B', cls:'gb', color:'var(--blue)' };
  return { label:'C', cls:'gc', color:'var(--danger)' };
}

function sortByTime(tasks) {
  return [...tasks].sort((a,b) => {
    const ta = parseTimeRange(a.time), tb = parseTimeRange(b.time);
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return ta.start - tb.start;
  });
}

function parseTimeRange(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})[–\-](\d{1,2}):(\d{2})/);
  if (!m) return null;
  return { start: parseInt(m[1])*60 + parseInt(m[2]), end: parseInt(m[3])*60 + parseInt(m[4]) };
}

function getConflictIds(tasks) {
  const conflicts = new Set();
  for (let i = 0; i < tasks.length; i++) {
    const a = parseTimeRange(tasks[i].time);
    if (!a || a.start >= a.end) continue;
    for (let j = i+1; j < tasks.length; j++) {
      const b = parseTimeRange(tasks[j].time);
      if (!b || b.start >= b.end) continue;
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(tasks[i].id);
        conflicts.add(tasks[j].id);
      }
    }
  }
  return conflicts;
}

// Sanitiza strings antes de inserir no innerHTML
function sanitize(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

// ═══ DOWNLOAD ═══
function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ═══ TOAST ═══
let toastTmr;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTmr);
  toastTmr = setTimeout(() => t.classList.remove('show'), 2400);
}
