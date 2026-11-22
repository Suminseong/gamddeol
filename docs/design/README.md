# 디자인 시스템

디자인·UX·텍스트 담당은 Gemini다.

- **원본:** 디자인 사양서의 원본은 Gemini가 관리하는 **Google Docs**다. 이 폴더는 개발 참고용 사본이며, 내용이 다르면 Google Docs가 우선한다.
- **상태:** 프레임워크가 아직 승인되지 않아(D01–D07 대기) 토큰을 코드에 통합하지 않았다. `tokens/`의 파일은 받은 원본 그대로 보관한다. 수정은 Gemini 사양 갱신을 거쳐 새 버전으로 교체한다.

## 파일

| 파일 | 내용 |
|---|---|
| [tokens/design-tokens.css](tokens/design-tokens.css) | `:root`·`[data-theme="dark"]` CSS 변수, 선택적 뉴모피즘 클래스(`.neu-kpi-card`, `.neu-cta-button`), 열람 영역(`.flat-reader-surface`, `.flat-reader-column`) |
| [tokens/design-tokens.ts](tokens/design-tokens.ts) | `ThemeMode`, `EpistemicStatus`, `PersonaId`, `DESIGN_TOKENS`, `READER_LAYOUT_TOKENS`, `PERSONA_BADGE_TOKENS` |

## v0.2 변경 요약 (2026-11-22, Gemini)

- **정보 출처·확정 상태 토큰 `EpistemicStatus` 6단계 신설** (사업계획서 6.2절 사실과 추론의 구분). 설정집과 원고 하이라이트를 출처별로 구별하도록 라이트·다크 컬러를 확장했다.
  - `canon` 확정 설정 / `manuscript_fact` 원고 사실 / `character_claim` 인물 발언(거짓 진술 가능) / `ai_candidate` AI 추출 미확정 후보 / `conflict_warning` 충돌 검토 후보 / `deprecated` 폐기·의도된 예외
- **바로 쓸 수 있는 토큰 패키지:**
  - `design-tokens.css`: 테마 변수, 선택적 뉴모피즘 클래스, 열람 영역(최대 폭 700px, 줄간격 1.8, `word-break: keep-all`)
  - `design-tokens.ts`: 테마·상태·독자 페르소나 8종 배지 컬러·열람 레이아웃 상수와 타입
- **4대 컴포넌트 상태와 반응형 기준** (사양서 본문에 수록, 토큰 파일에는 없음): 비동기 분석 큐(Loading), 초기 빈 상태(Empty), AI 미연결·장애 시 폴백(AI-Disabled Fallback), 대량 등록 부분 실패 복구(Error). 반응형 전환 기준 1200px / 768px.
