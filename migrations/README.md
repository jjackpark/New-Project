# migrations/

T003(DB 스키마)에서 채울 자리다. 한 파일에 다 넣지 말고 테이블/변경 단위로 나눠서 여기 둔다 — `.sql`도 RULES.md §5의 300줄 제한 대상 확장자라 큰 스키마 파일은 Write/Edit 자체가 막힌다.

마이그레이션 파일은 SEA 패키징 시 일반 정적 자산과 동일하게 `sea-config.json`의 `assets`에 등록해야 한다(파일시스템 상대경로로 읽으면 exe 안에서 깨진다 — ARCHITECTURE.md §3, PACKAGING.md 참고). `scripts/package-exe.js`는 `web/`뿐 아니라 이 폴더도 자동으로 자산 맵에 포함시킨다.

적용 방식은 `PRAGMA user_version` 기반 순차 적용으로 한다(ARCHITECTURE.md §4).
