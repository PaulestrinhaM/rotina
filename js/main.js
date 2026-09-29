// ═══ VIEW SWITCH ═══
let currentView = "tracker";
let previousViewBeforeConfig = "tracker";

function switchView(view, btn) {
  currentView = view;
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .querySelectorAll(".bnav-btn")
    .forEach((b) => b.classList.remove("active"));
  document.getElementById("view-" + view).classList.add("active");
  btn.classList.add("active");
  if (view === "tracker") renderTracker(activeDay);
  if (view === "history") renderHistorico();
  if (view === "studies") renderEstudos();
  if (view === "refs") renderBooks();
  if (view === "vagas") renderVagas();
}

function openConfig() {
  previousViewBeforeConfig = currentView;
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document.getElementById("view-config").classList.add("active");
  renderConfig();
}

function closeConfig() {
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  document
    .getElementById("view-" + previousViewBeforeConfig)
    .classList.add("active");
}

// ═══ INIT ═══
(async () => {
  // Antes de tudo: loadAll() já pode disparar a camada de login (401), então
  // o botão/Enter dela precisam estar prontos primeiro.
  setupAuthListeners();
  await loadAll();
  await loadBooks();
  await loadJournal();
  await fecharSemanasPendentes();
  setupConfigListeners();
  setupEstudosListeners();
  setupVagasListeners();
  document.getElementById("gearBtn").addEventListener("click", openConfig);
  renderTracker();
})();
