# Generates tasks/{id}.md stub docs from backlog.json.
$root = Split-Path -Parent $PSScriptRoot
$backlog = Get-Content -Raw -Encoding UTF8 (Join-Path $root "backlog.json") | ConvertFrom-Json
$tasksDir = Join-Path $root "tasks"
if (-not (Test-Path $tasksDir)) { New-Item -ItemType Directory -Path $tasksDir | Out-Null }

foreach ($t in $backlog.tasks) {
    $depsLine = if ($t.dependencies.Count -gt 0) { ($t.dependencies -join ", ") } else { "없음" }
    $tagsLine = if ($t.tags.Count -gt 0) { ($t.tags -join ", ") } else { "-" }

    $content = @"
# $($t.id) - $($t.title)

- **phase**: $($t.phase)
- **priority**: $($t.priority)
- **status**: $($t.status)
- **estimated_minutes**: $($t.estimated_minutes)
- **dependencies**: $depsLine
- **tags**: $tagsLine

## 설명

$($t.description)

## 참고

- 원본 스펙: SPEC.md
- 관련 작업 목록: backlog.json (id: $($t.id))

## 작업 노트

_(진행하면서 결정사항, 이슈, 리뷰 코멘트를 이 아래에 기록)_
"@

    $path = Join-Path $root $t.doc
    Set-Content -Path $path -Value $content -Encoding UTF8
}

"Generated $($backlog.tasks.Count) task docs."

