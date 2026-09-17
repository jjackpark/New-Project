import { escapeHtml, formatMinutes } from "./utils.js";

export function renderKpis(container, data) {
  const { stats, tasks } = data;
  const done = stats.byStatus.done || 0;
  const inProgress = stats.byStatus.in_progress || 0;
  const blocked = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled" && t.unmetDeps.length > 0
  ).length;

  const cards = [
    { label: "전체 작업", value: `${stats.total}건`, tone: "" },
    { label: "진행중", value: `${inProgress}건`, tone: "blue" },
    { label: "완료", value: `${done}건`, tone: "green" },
    { label: "시작 가능", value: `${stats.readyIds.length}건`, tone: "green" },
    { label: "블록됨", value: `${blocked}건`, tone: "red" },
    { label: "남은 예상 시간", value: formatMinutes(stats.remainingMinutes), tone: "" },
  ];

  container.innerHTML = cards
    .map(
      (c) => `
        <div class="kpi-card">
          <span class="kpi-label">${escapeHtml(c.label)}</span>
          <span class="kpi-value ${c.tone ? "tone-" + c.tone : ""}">${escapeHtml(c.value)}</span>
        </div>
      `
    )
    .join("");
}

export function renderPhaseProgress(container, data) {
  const { phaseOrder, phaseLabels, stats, tasks } = data;
  container.innerHTML = phaseOrder
    .map((phase) => {
      const total = stats.byPhase[phase] || 0;
      const done = tasks.filter((t) => t.phase === phase && t.status === "done").length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      return `
        <div class="phase-row">
          <div class="phase-row-head">
            <span>${escapeHtml(phaseLabels[phase] || phase)}</span>
            <span class="muted">${done}/${total} (${pct}%)</span>
          </div>
          <div class="phase-bar"><div class="phase-bar-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join("");
}

export function renderStatusChips(container, data, activeStatuses, onToggle) {
  const { statusOrder, statusLabels, stats } = data;
  container.innerHTML = statusOrder
    .map((s) => {
      const active = activeStatuses.has(s);
      return `<button type="button" class="chip ${active ? "chip-active" : ""}" data-status="${s}">
        ${escapeHtml(statusLabels[s] || s)} <span class="chip-count">${stats.byStatus[s] || 0}</span>
      </button>`;
    })
    .join("");
  container.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => onToggle(btn.dataset.status));
  });
}
