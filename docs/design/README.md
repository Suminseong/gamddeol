# 디자인 시스템

디자인·UX·텍스트 담당은 Gemini다.

- **원본:** 디자인 사양서의 원본은 Gemini가 관리하는 **Google Docs**다. 이 폴더는 개발 참고용 사본이며, 내용이 다르면 Google Docs가 우선한다.
- **상태:** `tokens/`의 파일은 받은 원본 그대로 보관한다. 수정은 Gemini 사양 갱신을 거쳐 새 버전으로 교체한다.
  - 개인 검증용 알파([../alpha/README.md](../alpha/README.md))가 `design-tokens.css`를 그대로 불러와 CSS 변수와 `.neu-cta-button`, `.flat-reader-surface`, `.flat-reader-column`을 쓴다. 반응형 기준은 1200px / 768px을 따른다.
  - 알파 화면 문구는 개발 담당이 쓴 초안이다. UX 라이팅 검토가 필요하다.
  - 알파는 컨트롤 경계(입력·원고·선택·보조 버튼)에만 앱 범위 변수 `--app-control-border`(라이트 `#8A8579`, 다크 `#737882`, Gemini 권장값)를 `src/app/app.css`에 따로 둔다. 원본 `--color-border-strong`이 면 위에서 3:1에 못 미치기 때문이다. `tokens/` 파일은 바꾸지 않았고, 원본에 정식 토큰이 생기면 그것으로 바꾼다. 근거와 실측 값은 [../alpha/README.md](../alpha/README.md)의 "컨트롤 경계색".
  - 본 제품 프레임워크는 아직 승인되지 않았다(D01–D07 대기).

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
