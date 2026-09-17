export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

const STATUS_BADGE_CLASS = {
  todo: "badge-gray",
  in_progress: "badge-blue",
  review: "badge-amber",
  blocked_decision: "badge-red",
  on_hold: "badge-gray",
  done: "badge-green",
  cancelled: "badge-strike",
};

export function statusBadgeClass(status) {
  return STATUS_BADGE_CLASS[status] || "badge-gray";
}

export function formatMinutes(min) {
  if (!min) return "-";
  if (min < 60) return `${min}분`;
  return `${(min / 60).toFixed(1)}시간`;
}

export function formatClock(iso) {
  try {
    return new Date(iso).toLocaleTimeString("ko-KR", { hour12: false });
  } catch {
    return "-";
  }
}

// **굵게** 정도만 지원하는 인라인 렌더링. escapeHtml을 먼저 적용한 뒤
// 태그를 끼워 넣으므로 사용자 입력이 그대로 HTML로 해석되지 않는다.
function renderInline(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

// tasks/<id>.md는 '#'/'##' 헤더와 '- ' 목록 정도만 쓰는 단순한 문서라
// 전용 마크다운 파서 없이 줄 단위로만 가볍게 렌더링한다.
export function renderDocMarkdown(md) {
  if (!md) return '<p class="muted">문서 없음</p>';
  const lines = md.split("\n");
  const html = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) {
      closeList();
      html.push(`<h4>${renderInline(line.replace(/^##\s+/, ""))}</h4>`);
    } else if (/^#\s+/.test(line)) {
      closeList();
      html.push(`<h3>${renderInline(line.replace(/^#\s+/, ""))}</h3>`);
    } else if (/^-\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^-\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      closeList();
      html.push('<div class="doc-gap"></div>');
    } else {
      closeList();
      html.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeList();
  return html.join("\n");
}
