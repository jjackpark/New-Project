# RULES.md

Setup Manager 저장소에서 지켜야 하는 구체적인 규칙 모음이다. 대부분은 `.claude/settings.json`에 등록된 훅(`scripts/hooks/*.js`)이 실제로 강제하므로, "규칙을 지키는 법"이 아니라 "훅이 왜 이렇게 동작하는지"를 이해하는 문서로 읽는다. 배경/제품 맥락은 [CLAUDE.md](CLAUDE.md)와 [SPEC.md](SPEC.md)를 본다.

## 1. 브랜치

- 작업은 항상 `dev` 브랜치에서 한다. `main`에 직접 커밋하지 않는다.
- 세션 시작 시 `session-branch-check.js`(SessionStart 훅)가 현재 브랜치를 알려주고, `main`이면 `dev`로 전환하라고 경고한다. 경고가 뜨면 다른 작업 전에 먼저 `git checkout dev`부터 한다.

## 2. backlog.json은 CLI로만

- `backlog.json`을 Read / Edit / Write / Grep 하거나 Bash로 직접 열람·수정하는 모든 시도는 `guard-backlog.js`(PreToolUse 훅)가 차단한다. git 명령(`git diff`, `git show` 등)과 `backlog-cli.js`/`gen-task-docs.ps1` 자체 실행만 예외로 허용된다.
- 조회: `node scripts/backlog-cli.js list|show <id>|stats|validate`
- 수정: `node scripts/backlog-cli.js update <id> --status ... | status <id> <새상태>`
- 추가: `node scripts/backlog-cli.js add --title "..." [--phase ...] [--deps a,b] [--tags x,y]`
- 상태값은 `status_definitions`에 등록된 것만 허용된다: `todo, in_progress, review, blocked_decision, on_hold, done, cancelled`. phase는 `0-foundation, 1-core-data, 2-core-input, 3-visualization, 4-extension, 5-advanced, 6-qa` 중 하나다.
- 태스크를 시작하면 `status <id> in_progress`로 표시하고, 실제로 끝났을 때만(아래 3번 조건 충족 시) `done`으로 바꾼다.
- `add`/`update`/`status`는 순환 의존성이 생기면 자동으로 실패한다. 정기적으로 `validate`로 ID 중복/깨진 dependency/문서 누락을 점검한다.

## 3. done 처리는 자동 커밋 + 자동 push를 유발한다

`backlog-commit.js`(PostToolUse, Bash 훅)가 매 Bash 호출 뒤 `backlog.json`이 `HEAD` 대비 바뀌었는지 확인하고, 다음과 같이 **사용자 확인 없이** 동작한다:

| 변경 종류 | 동작 |
|---|---|
| 필드만 수정(제목/설명/의존성 등, 상태 불변) | `chore(backlog): update task fields via CLI` 커밋 |
| 상태 변경(‑> `done` 제외) | `chore(backlog): status update - ...` 커밋 |
| 상태가 `done`으로 전환 | 완료 내용 + 작업 노트를 담은 `feat(task): ... 완료 처리` 커밋 **+ `git push`(원격/브랜치 없으면 `-u origin <branch>`까지 자동 실행)** |

이 저장소의 일반 정책(위험하거나 되돌리기 어려운 작업은 실행 전 확인)과 달리, **이 자동 push만은 훅이 명시적으로 수행하도록 만들어진 예외**다. 따라서:

- 검증(리뷰/테스트/빌드 통과)되지 않은 작업을 성급하게 `done`으로 바꾸지 않는다 — 바꾸는 순간 원격에 올라간다.
- `backlog.json`이나 `tasks/*.md`를 이 흐름 밖에서 수동으로 `git add`/`git commit` 하지 않는다 — 훅이 이미 처리한다. 실제 소스 코드 변경은 평소대로 사용자 확인 후 커밋/푸시한다(자동 push 대상이 아니다).

## 4. 태스크 문서(`tasks/T0NN.md`)

- CLI의 `add`/`update`/`status`는 매번 `metaBlock`(제목~설명)을 `backlog.json` 기준으로 재생성하고, 기존 파일에서 `## 참고` 이후 내용은 그대로 보존한다.
- 따라서 **결정사항/이슈/리뷰 코멘트는 반드시 `## 작업 노트` 절 아래에 적는다.** 그 위(제목, phase/priority/status, 설명)를 손으로 고쳐도 다음 CLI 호출에서 덮어써진다 — 값을 바꾸려면 `backlog-cli.js update`를 써야 한다.
- 전체 태스크 문서를 백로그 기준으로 일괄 재생성하려면 `scripts/gen-task-docs.ps1`을 쓴다(이 경우도 `## 참고` 이후는 보존되지 않으니 주의 — 대량 초기화 용도).

## 5. 코드 품질 게이트

- **파일 길이 상한 300줄** (`code-length-check.js`, Write|Edit 훅). 대상 확장자: js/jsx/ts/tsx/mjs/cjs/py/go/java/kt/cs/rb/php/c/h/cpp/hpp/rs/swift/vue/svelte/css/scss/sql/sh/ps1 (`tasks/T*.md`는 제외). 255줄(85%)부터 경고, 300줄 초과 시 해당 Write/Edit 자체가 `block`되어 더 작은 단위로 다시 작성해야 한다. 처음부터 책임을 분리해서 짧게 쓴다.
- **lint 게이트** (`lint-check.js`, Write|Edit 훅): `package.json`에 `scripts.lint`가 있으면 매 Write/Edit 후 `npm run lint`를 자동 실행하고 실패 시 block한다. 지금은 `package.json`이 없어 no-op이다 — 기술 스택(T001) 확정 후 `lint` 스크립트를 추가하면 즉시 활성화된다.
- **build 게이트** (`build-check.js`, Stop 훅): `package.json`에 `scripts.build`가 있으면 턴이 끝날 때 `npm run build`를 자동 실행하고 실패하면 턴 종료 자체를 막는다(계속 고치도록 강제). 마찬가지로 지금은 no-op이다.
- 별도 CI 설정 없이 위 두 게이트는 `package.json`에 스크립트만 추가하면 바로 작동하므로, T001/T002에서 lint·build 스크립트 이름을 `lint`/`build`로 맞춘다.

## 6. 전용 Subagent (`.claude/agents/`)

이 저장소에는 두 개의 전용 subagent가 정의되어 있다. 둘 다 `backlog.json`을 직접 건드리지 않는다 — 시도해도 `guard-backlog.js`가 차단한다. 상태 전환(`in_progress`/`done` 등)은 항상 메인 에이전트가 `backlog-cli.js`로 수행하며, subagent에게 위임하지 않는다.

### 6.1 `backlog-briefer` (haiku)

- **언제**: 백로그 태스크를 `in_progress`로 바꾸고 실제 구현을 시작하기 **직전**에 태스크 ID를 넘겨 호출한다. `tasks/<ID>.md`에 이미 `### 쉬운 설명`/`### 관련 파일`이 최신 상태로 있으면 생략해도 된다.
- **하는 일**: 태스크를 쉬운 말로 설명하고, 관련 기존 파일/문서를 찾아 `tasks/<ID>.md`의 `## 작업 노트` 아래에 정리한다.
- **하지 않는 일**: 코드 작성, 상태 변경, `backlog.json`/메타 블록 수정.
- 모델은 haiku로 고정한다 — 가볍고 빠른 조사/요약 용도이므로 다른 모델로 바꾸지 않는다.

### 6.2 `adversarial-reviewer` (opus)

- **언제**: 태스크 작업 중 파일을 하나 이상 생성/수정했다면, 그 상태를 `review` 또는 `done`으로 바꾸기 **전에** 반드시 호출한다.
- **하는 일**: 방금 만든/고친 파일에 대해 일부러 적대적으로 결함을 찾아 치명적/중요/사소 등급으로 보고한다. 근거 없는 트집은 걸지 않지만, 좋은 점을 굳이 칭찬하지도 않는다.
- **하지 않는 일**: 파일 수정. 비평만 하고 조치는 호출한 쪽(메인 에이전트)이 판단한다.
- **치명적/중요 등급 지적은 조치하거나, 조치하지 않는 이유를 `tasks/<ID>.md`의 `## 작업 노트`에 남긴 뒤에만** 상태를 `done`으로 바꾼다. `done` 전환은 §3에 따라 자동 커밋+push를 유발하므로, 리뷰를 건너뛰고 넘기지 않는다.
- 모델은 opus로 고정한다 — 깊이 있는 비평이 목적이므로 다른 모델로 바꾸지 않는다.

## 7. 제품 규칙 (SPEC.md 요약 — 구현 시 임의로 벗어나지 않는다)

- 상태(enum) 필드는 자유 텍스트 금지, SPEC.md §5.5의 허용값만 드롭다운으로 노출한다.
- 일보의 업체별 인원수는 프로젝트에 등록된 업체 목록을 자동으로 행으로 뿌려주고 인원수만 입력하게 한다(업체 선택 UI, "행 추가" 버튼 불필요) — 새 업체 등록 시 다음 일보부터 자동으로 행이 늘어난다. 이 데이터는 주간보고서 집계에서 제외한다.
- Qual과 런평가(사전평가/시스템평가/MFQ)는 같은 화면의 하위 메뉴로 묶는다 — 별도 최상위 탭을 만들지 않는다.
- 알람(설비가 자동/수동 발생)과 이슈(사람이 판단해 등록)는 역할이 다르므로 같은 리스트로 합치지 않는다.
- 텍스트 짤림 방지는 항상 "글자수 제한 → 자동 축소 → 말줄임+툴팁" 순서로 3단계 모두 적용한다. 하나만 적용하고 끝내지 않는다.
- 비목표(제작관리, 투자관리, 실제 이메일 발송, 푸시 알림, 모바일 반응형, SSO/AD)에 해당하는 기능은 요청받지 않는 한 추가하지 않는다.
