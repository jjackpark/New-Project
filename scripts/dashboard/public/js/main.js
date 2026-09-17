import { fetchBacklog } from "./api.js";
import { renderKpis, renderPhaseProgress, renderStatusChips } from "./render-overview.js";
import { renderPhaseNav, renderTaskTable, renderDetail } from "./render-tasks.js";
import { formatClock } from "./utils.js";

const POLL_MS = 4000;

const els = {
  phaseNav: document.getElementById("phaseNav"),
  kpiRow: document.getElementById("kpiRow"),
  phaseProgress: document.getElementById("phaseProgress"),
  statusChips: document.getElementById("statusChips"),
  taskTableBody: document.getElementById("taskTableBody"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailContent: document.getElementById("detailContent"),
  updatedAt: document.getElementById("updatedAt"),
  liveDot: document.getElementById("liveDot"),
  liveText: document.getElementById("liveText"),
  searchInput: document.getElementById("searchInput"),
};

const state = {
  phase: "all",
  activeStatuses: null, // null = 전체 선택
  search: "",
  selectedId: null,
  data: null,
};

function visibleTasks() {
  if (!state.data) return [];
  let tasks = state.data.tasks;
  if (state.phase !== "all") tasks = tasks.filter((t) => t.phase === state.phase);
  if (state.activeStatuses) tasks = tasks.filter((t) => state.activeStatuses.has(t.status));
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    tasks = tasks.filter((t) => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
  }
  return tasks;
}

function selectTask(id) {
  state.selectedId = id;
  renderAll();
}

function selectPhase(phase) {
  state.phase = phase;
  renderAll();
}

function toggleStatus(status) {
  if (!state.activeStatuses) state.activeStatuses = new Set(state.data.statusOrder);
  if (state.activeStatuses.has(status)) state.activeStatuses.delete(status);
  else state.activeStatuses.add(status);
  if (state.activeStatuses.size === state.data.statusOrder.length) state.activeStatuses = null;
  renderAll();
}

function renderAll() {
  const data = state.data;
  if (!data) return;

  renderPhaseNav(els.phaseNav, data, state.phase, selectPhase);
  renderKpis(els.kpiRow, data);
  renderPhaseProgress(els.phaseProgress, data);
  renderStatusChips(els.statusChips, data, state.activeStatuses || new Set(data.statusOrder), toggleStatus);

  const tasks = visibleTasks();
  renderTaskTable(els.taskTableBody, tasks, state.selectedId, selectTask);

  const selected = data.tasks.find((t) => t.id === state.selectedId) || null;
  renderDetail(els.detailEmpty, els.detailContent, selected, selectTask);

  els.updatedAt.textContent = `마지막 갱신 ${formatClock(data.generatedAt)}`;
}

async function poll() {
  try {
    state.data = await fetchBacklog();
    els.liveDot.classList.remove("dot-off");
    els.liveText.textContent = "실시간 연결됨";
    renderAll();
  } catch {
    els.liveDot.classList.add("dot-off");
    els.liveText.textContent = "서버 연결 끊김 — 재시도 중";
  }
}

els.searchInput.addEventListener("input", (e) => {
  state.search = e.target.value;
  renderAll();
});

poll();
setInterval(poll, POLL_MS);
