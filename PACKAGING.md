# PACKAGING.md

T007(exe 패키징 파이프라인 PoC)의 산출물이다. ARCHITECTURE.md에서 결정한 "Node SEA 단일 exe" 방식이 실제로 동작하는지 개발 PC에서 검증했다. 초안(v1) 계획은 opus 적대적 리뷰에서 치명적 결함 6건을 지적받아, 아래는 그 지적을 반영해 다시 실행한 결과(v2)다.

## 검증 환경

- Node.js v24.18.0, Windows 11 (build 26200), x64
- `node.exe` 원본: 92,534,088 bytes, SHA256 `9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52d`, Authenticode `Valid` (OpenJS Foundation)
- `postject@1.0.0-alpha.6` (버전 고정), `esbuild@0.28.2`
- 소스는 저장소 밖 스크래치 위치에서 작성: `src/db.js`(SQLite), `src/assets.js`(node:sea 래퍼), `src/index.js`(엔트리, 서버가 자가종료하지 않고 계속 대기) — esbuild로 `dist/bundle.js` 하나로 번들 후 SEA 처리(ARCHITECTURE §2가 실제로 요구하는 파이프라인).

## PASS 기준별 결과

| 기준 | 결과 | 근거 |
|---|---|---|
| P1: 외부 검증(자기 자신이 아닌 별도 요청)으로 DB값+바이너리 해시 일치 | **PASS** | `curl`로 `GET /` → DB에 기록된 hit가 응답에 포함(`1:req:/@...`), `GET /logo.png` 응답 SHA256(`c414cd0e...`)이 원본 자산 파일과 완전 일치 |
| P2: postject 후 서명 손상 확인 | **PASS(수정)** | 주입 전 `Get-AuthenticodeSignature` = `Valid`. 주입 직후 postject 자체가 `warning: signature seems corrupted` 출력, 재확인 시 `NotSigned`. **리뷰 예측과 다른 점**: "무효화된 서명이 남는다(Invalid/HashMismatch)"가 아니라 postject가 서명 블록 자체를 제거해 **완전히 무서명 상태**가 됐다(`signtool remove` 시도 시 "already not signed" 에러로 재확인). 실무 영향은 동일(서명 없이 배포) — ARCHITECTURE §9의 "코드서명 안 함" 전제와 일치하므로 별도 조치 불필요, 다만 문서 문구는 "서명이 깨진 채 남는다"가 아니라 "무서명이 된다"로 정정. |
| P3: 음성 대조군(미주입 node.exe)이 반드시 FAIL | **PASS** | 동일 포트 시도 시 `curl` 연결 자체가 성사되지 않음(timeout) — 자기인증 결함이 아님을 확인 |
| P4: 강제종료 후 재기동 시 영속성 | **PASS** | `taskkill /F`로 강제종료 → 재기동 → 이전 hit(id 1, 2)가 그대로 남아있고 새 hit(id 3)가 이어서 기록됨. 실제 목표 유형 경로(`%LOCALAPPDATA%` 상당 경로)에서 확인 |
| P5: WAL 모드 확인 | **PASS** | `poc.db-wal`(16.5KB), `poc.db-shm`(32KB) 생성 확인, 강제종료 후에도 손상 없이 재오픈 |
| P6: 콜드 스타트/크기 측정 | **PASS(측정 완료)** | 콜드 스타트 3회: 335ms / 313ms / 318ms(폴링 오버헤드 포함, 실제로는 더 짧을 가능성). exe 크기 92,664,832 bytes(≈88.4MiB, 원본 node.exe 대비 +128KB). zip 압축 시 34,559,964 bytes(≈33MiB, 원본 대비 37%) — **여전히 일반 메일 첨부 한도(20~25MB)를 초과** |
| P7: NODE_OPTIONS 영향 확인 | **PASS(확인됨)** | `NODE_OPTIONS=--max-old-space-size=64` 설정 시 `v8.getHeapStatistics().heap_size_limit`이 4288MB → 256MB로 실제 변화 — **SEA exe도 NODE_OPTIONS 환경변수를 읽는다**(더블클릭 배포에서도 배치파일/시스템 환경변수로 V8 튜닝 가능하다는 뜻) |

## 추가로 확인된 사실 (원래 계획엔 없었으나 리뷰 반영 중 발견)

- **MOTW(다운로드 표시) 붙은 exe는 비대화형 실행이 Windows에 의해 취소된다**: `Zone.Identifier=3` 스트림을 붙인 사본을 `Start-Process`로 실행 시도 → `"작업이 사용자에 의해 취소되었습니다"` 에러로 즉시 차단됨(사람이 다이얼로그를 본 것은 아니지만, 비대화형 컨텍스트에서 자동 취소된 것 자체가 SmartScreen/ShellExecute 차단이 실제로 작동함을 보여주는 증거). **결론**: 메일 첨부·브라우저 다운로드·인트라넷으로 분류 안 된 네트워크 공유로 exe를 옮기면 사용자가 "추가 정보 → 실행" 클릭이 필요하거나 관리자가 사전에 `Unblock-File`/그룹 정책으로 조치해야 한다. exe를 서버 PC까지 어떻게 옮길지(USB, 인트라넷 공유 등)를 T002/배포 문서에서 반드시 정해야 한다.
- 서버 프로세스는 `console.error`로 진단 로그(한글 포함)를 정상 출력(`한글 인코딩 확인용 로그입니다` — 깨짐 없음), `isSea()=true`, `getAssetKeys()`로 임베드된 자산 목록(`["index.html","logo.png"]`) 런타임 열거 가능 확인 — 빌드타임 매니페스트 없이도 자산 목록 열거가 가능함을 확인.
- SEA 안에서 `__dirname`은 exe가 위치한 폴더를 가리키고(`C:\Temp\smtest`), `process.execPath`는 exe 자신을 가리킴 — 둘 다 데이터/자산 경로 로직에서 신뢰하면 안 됨(ARCHITECTURE §3의 "파일시스템 상대경로 참조 금지" 결정과 일치, 재확인됨).

## 이 세션 환경에서 검증하지 못한 것 (명시적으로 열어둠 — 실패나 미실행이 아니라 환경 한계)

| 항목 | 상태 | 사유 |
|---|---|---|
| 실제 "서버 PC"에서 더블클릭 실행 | **미검증** | 이 세션엔 개발 PC 하나뿐, 별도 서버 PC가 없음 |
| 다른 PC에서 `http://<서버IP>:<port>` 접속(방화벽 인바운드 통과) | **미검증** | 위와 동일 — 두 번째 머신 필요 |
| 사내 백신/EDR의 실제 탐지·격리 반응 | **미검증** | 관리자 권한이 없어 Defender 제외 목록도 조회 불가(직접 확인함). 사내 표준 백신 제품이 무엇인지도 이 세션에서는 알 수 없음 |
| SmartScreen 대화상자 육안 확인 | **부분 검증** | 비대화형 취소는 확인했으나(위 참고), 실제 "Windows가 PC를 보호했습니다" 화면과 "추가 정보" 클릭 플로우는 사람이 직접 봐야 함 |
| better-sqlite3와의 정식 대조 실험 | **범위 제외로 결정** | ARCHITECTURE §10이 T007에 위임했으나, 시간 제약으로 이번 스파이크에서는 node:sqlite만 검증하고 better-sqlite3 대조는 하지 않기로 결정. node:sqlite 자체는 위 표대로 전부 정상 동작해 채택 근거는 유지됨 |
| 아이콘/버전 리소스 교체(rcedit 등) | **생략** | PoC 정확성에 필수 아님, T002 이후 필요 시 별도 처리 |
| `lint`/`build` npm 스크립트 실제 추가 | **미실행** | 이건 T002의 범위. 현재 `package.json`이 없어 RULES.md §5의 lint/build 훅은 여전히 no-op |

## T002에 대한 구체 권고

1. `esbuild --bundle --platform=node --format=cjs --external:node:sqlite --external:node:sea`를 빌드 스크립트로 채택(이번 스파이크에서 실제로 성공 확인).
2. `postject@1.0.0-alpha.6`을 정확히 버전 고정한 devDependency로 추가(`npx --yes` 아님, 정식 devDependency + 로컬 실행).
3. exe 전달 채널을 지금 정해야 한다 — 메일/브라우저 다운로드는 MOTW로 비대화형 실행이 막힌다(위 실측). USB 또는 인트라넷 공유 + `Unblock-File` 절차를 배포 문서에 넣는다.
4. 데이터 경로는 `%LOCALAPPDATA%`(사용자별) vs `C:\ProgramData`(머신 공용) 중 하나를 T002 착수 시 확정한다 — 이번 스파이크는 전자로 검증했다.
5. `NODE_OPTIONS`는 SEA exe에서도 유효하므로, 필요 시 배치파일이나 시스템 환경변수로 V8 튜닝 여지를 남겨둔다.

## 리뷰 반영 로그

opus 리뷰(치명적 6건, 중요 13건, 사소 9건) 중 이번 v2 스파이크로 **직접 실증한 항목**: C2(수정된 결론 포함), C3, C4(서버 상주형으로 수정, 다만 타PC 접속은 미검증), C5, C6, I2(일부: 콜드스타트, useCodeCache는 미시도), I5, I6, I7(부분: 텍스트+바이너리는 확인, 대규모 자산은 미시도), I9, I12(부분: LOCALAPPDATA 경로만 확인, ProgramData 비교는 미시도), S2, S3, S5, S7(외부 검증 스크립트로 대체), S9(이 문서 자체가 사전 기준 고정 증거). **의도적으로 범위 제외**: I1(better-sqlite3 대조), I11(리소스 교체). **이 세션 환경으로는 검증 불가**: C1, I3, I4(육안 확인), I8 — 위 표 참고.
