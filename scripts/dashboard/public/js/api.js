export async function fetchBacklog() {
  const res = await fetch("/api/backlog", { cache: "no-store" });
  if (!res.ok) throw new Error(`API 오류: ${res.status}`);
  return res.json();
}
