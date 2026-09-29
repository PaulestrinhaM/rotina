// ═══ JOURNAL ═══
const MOODS = [
  { id: "otimo", label: "Ótimo", emoji: "🔥" },
  { id: "bem", label: "Bem", emoji: "😊" },
  { id: "neutro", label: "Neutro", emoji: "😐" },
  { id: "atucanado", label: "Atucanado", emoji: "😤" },
  { id: "cansado", label: "Cansado", emoji: "😮‍💨" },
  { id: "ansioso", label: "Ansioso", emoji: "😬" },
  { id: "triste", label: "Triste", emoji: "😔" },
  { id: "irritado", label: "Irritado", emoji: "😠" },
];

let journal = {}; // keyed by 'YYYY-MM-DD'
let journalAberto = false; // aberto/fechado do acordeão — precisa sobreviver a re-renders (ver toggleJournal/renderJournal)

async function loadJournal() {
  try {
    const r = await store.get("journal_data");
    journal = r ? JSON.parse(r) : {};
  } catch (e) {
    journal = {};
  }
}

async function saveJournal() {
  await store.set("journal_data", JSON.stringify(journal));
}

// Retorna a data real (YYYY-MM-DD) para um índice de dia da semana (0=Segunda)
function getDateForDayIdx(dayIdx) {
  const now = new Date();
  const currentDayIdx = (now.getDay() + 6) % 7;

  const diff = dayIdx - currentDayIdx;

  const d = new Date(now);
  d.setDate(now.getDate() + diff);

  // 🔥 CORREÇÃO REAL
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());

  return d.toISOString().split("T")[0];
}

function getJournalKey(dayName) {
  const idx = DAYS.indexOf(dayName);
  return getDateForDayIdx(idx);
}

async function setMood(dayName, moodId) {
  const key = getJournalKey(dayName);
  if (!journal[key]) journal[key] = {};
  journal[key].mood = moodId;
  await saveJournal();
  renderJournal(dayName);
}

async function saveJournalDescription(dayName, text) {
  const key = getJournalKey(dayName);
  if (!journal[key]) journal[key] = {};
  journal[key].description = text;
  await saveJournal();
}

function renderJournal(dayName) {
  const panel = document.getElementById("journalPanel");
  if (!panel) return;

  const key = getJournalKey(dayName);
  const entry = journal[key] || {};
  const idx = DAYS.indexOf(dayName);
  const dateStr = getDateForDayIdx(idx);
  const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString(
    "pt-BR",
    { day: "2-digit", month: "2-digit", weekday: "short" },
  );

  panel.innerHTML = `
    <div class="journal-section">
      <div class="journal-hdr" onclick="toggleJournal()">
        <div class="journal-hdr-left">
          <span class="journal-icon">${entry.mood ? MOODS.find((m) => m.id === entry.mood)?.emoji || "📓" : "📓"}</span>
          <span class="journal-title">Diário <span class="journal-date">${dateLabel}</span></span>
        </div>
        <span class="journal-chevron" id="journalChevron" style="${journalAberto ? 'transform:rotate(90deg)' : ''}">›</span>
      </div>
      <div class="journal-body${journalAberto ? ' open' : ''}" id="journalBody">
        <div class="mood-label">Como foi o dia?</div>
        <div class="mood-grid">
          ${MOODS.map(
            (m) => `
            <button
              class="mood-btn${entry.mood === m.id ? " active" : ""}"
              onclick="setMood('${dayName}','${m.id}')"
              title="${m.label}"
            >
              <span class="mood-emoji">${m.emoji}</span>
              <span class="mood-name">${m.label}</span>
            </button>
          `,
          ).join("")}
        </div>
        <div class="journal-desc-wrap">
          <textarea
            class="journal-desc"
            placeholder="Escreve algo sobre o dia..."
            rows="3"
            onblur="saveJournalDescription('${dayName}', this.value)"
          >${sanitize(entry.description || "")}</textarea>
        </div>
      </div>
    </div>
  `;
}

function toggleJournal() {
  const body = document.getElementById("journalBody");
  const chev = document.getElementById("journalChevron");
  if (!body) return;
  journalAberto = body.classList.toggle("open");
  chev.style.transform = journalAberto ? "rotate(90deg)" : "";
}

// Retorna emoji do humor para um dia (usado no histórico)
function getMoodEmoji(dayName, mondayKey) {
  // Para o histórico precisamos calcular a data de cada dia na semana do mondayKey
  const monday = new Date(mondayKey + "T12:00:00");
  const dayIdx = DAYS.indexOf(dayName);
  const d = new Date(monday);
  d.setDate(monday.getDate() + dayIdx);
  const dateKey = d.toISOString().split("T")[0];
  const entry = journal[dateKey];
  if (!entry || !entry.mood) return "";
  return MOODS.find((m) => m.id === entry.mood)?.emoji || "";
}
