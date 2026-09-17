import { escapeHtml, statusBadgeClass, formatMinutes, renderDocMarkdown } from "./utils.js";

export function renderPhaseNav(container, data, activePhase, onSelect) {
  const { phaseOrder, phaseLabels, stats } = data;
  const items = [{ key: "all", label: "전체", count: data.tasks.length }].concat(
    phaseOrder.map((p) => ({ key: p, label: phaseLabels[p] || p, count: stats.byPhase[p] || 0 }))
  );
  container.innerHTML = items
    .map(
      (it) => `<button type="button" class="phase-nav-item ${it.key === activePhase ? "active" : ""}" data-phase="${it.key}">
        <span>${escapeHtml(it.label)}</span><span class="count">${it.count}</span>
      </button>`
    )
    .join("");
  container.querySelectorAll(".phase-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => onSelect(btn.dataset.phase));
  });
}

export function renderTaskTable(tbody, tasks, selectedId, onSelect) {
  if (tasks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">조건에 맞는 작업이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = tasks
    .map(
      (t) => `
      <tr class="${t.id === selectedId ? "row-selected" : ""}" data-id="${t.id}">
        <td class="mono">${t.id}</td>
        <td><span class="badge ${statusBadgeClass(t.status)}">${escapeHtml(t.statusLabel)}</span></td>
        <td>${escapeHtml(t.phaseLabel)}</td>
        <td>${escapeHtml(String(t.priority ?? "-"))}</td>
        <td class="title-cell" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</td>
        <td>${formatMinutes(t.estimated_minutes)}</td>
        <td>${t.dependencies.length ? t.dependencies.join(", ") : "-"}</td>
      </tr>
    `
    )
    .join("");
  tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
    tr.addEventListener("click", () => onSelect(tr.dataset.id));
  });
}

function depChips(ids, emptyText) {
  return ids.length
    ? ids.map((id) => `<button type="button" class="link-chip" data-jump="${id}">${id}</button>`).join(" ")
    : `<span class="muted">${emptyText}</span>`;
}

export function renderDetail(emptyEl, contentEl, task, onJump) {
  if (!task) {
    emptyEl.hidden = false;
    contentEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  contentEl.hidden = false;

  contentEl.innerHTML = `
    <div class="detail-head">
      <span class="mono">${task.id}</span>
      <span class="badge ${statusBadgeClass(task.status)}">${escapeHtml(task.statusLabel)}</span>
    </div>
    <h3>${escapeHtml(task.title)}</h3>
    <div class="detail-meta">
      <span>${escapeHtml(task.phaseLabel)}</span>
      <span>우선순위 ${escapeHtml(String(task.priority ?? "-"))}</span>
      <span>${formatMinutes(task.estimated_minutes)}</span>
    </div>
    <div class="detail-block">
      <h4>의존성</h4>
      ${depChips(task.dependencies, "없음")}
      ${task.unmetDeps.length ? `<div class="warn-line">미완료: ${task.unmetDeps.join(", ")}</div>` : ""}
    </div>
    <div class="detail-block">
      <h4>이 작업에 의존하는 작업</h4>
      ${depChips(task.dependents, "없음")}
    </div>
    <div class="detail-block">
      <h4>연결 문서</h4>
      <div class="doc-path mono">${escapeHtml(task.doc)}</div>
      <div class="doc-view">${renderDocMarkdown(task.docContent)}</div>
    </div>
  `;
  contentEl.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => onJump(btn.dataset.jump));
  });
}
