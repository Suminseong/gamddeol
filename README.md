# 감떨 (gamddeol)

작가용 범용 창작 관리 플랫폼, 일명 **감평툴**의 저장소다.

소설 작가가 장기간 작품을 집필하면서 생기는 원고 관리, 설정 정리, 인물·사건 추적, 복선 관리, 시간선 검증을 한 곳에서 하고, 여기에 AI 원고 분석과 **가상 연재·독자 반응 시뮬레이터**를 결합하는 것이 목표다.

> AI가 원고를 대신 쓰거나 이어 쓰지 않는다. AI가 만든 결과는 항상 후보이며, 확정 데이터는 작가의 승인으로만 바뀐다.

## 현재 상태

- **단계:** 개인 검증용 알파. 2026-11-22 참깨빙수가 알파 구현과 GitHub Pages 배포를 승인했다.
- **알파 주소:** https://suminseong.github.io/gamddeol/
  - 브라우저에서 OpenAI API 키를 등록하고, 원고를 평문으로 넣어 감평 응답을 확인한다.
  - 쓰는 법, 전송 범위, 한계는 [docs/alpha/README.md](docs/alpha/README.md)를 본다.
- **본 제품:** 기술 스택과 MVP 범위(D01–D07)는 아직 승인되지 않았다. 알파 스택(Vite + React + TypeScript)은 알파에만 쓰는 선택이다.
- 진행 상황과 결정 대기 목록은 [docs/decisions.md](docs/decisions.md)를 본다.

## 개발

Node 22(`.nvmrc`)가 필요하다. 실제 키나 원고 없이 빌드·테스트가 돈다.

```sh
npm ci
npm run dev:mock   # 네트워크 없는 모의 모드
npm run check      # 타입 검사 · 테스트 · 빌드(배포 파일 검사) · E2E
```

명령 전체와 배포 흐름은 [docs/alpha/README.md](docs/alpha/README.md#명령)에 있다.

## 역할

| 역할 | 담당 | 하는 일 |
|---|---|---|
| 사업 책임자·최종 승인 | 사용자 (참깨빙수) | 비전과 우선순위, 기능 채택과 출시의 최종 결정 |
| 프로젝트 총괄·검증 | GPT | 요구사항·개발 과제 정리, 설계와 결과물 검토, 결함 관리 |
| 설계·개발 | Claude | 기술 타당성 검토, 데이터·API 설계, 구현과 테스트 |
| 디자인·UX·텍스트 | Gemini | UI, 사용자 흐름, 접근성, UX 라이팅 |

배포, 데이터 삭제, 권한 변경처럼 되돌리기 어려운 작업은 사용자의 명시적 승인을 거친다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/alpha/README.md](docs/alpha/README.md) | 개인 검증용 알파: 쓰는 법, 전송 범위, 구조, 명령, 배포 |
| [docs/overview.md](docs/overview.md) | 사업계획서 초안 v0.1 요약 |
| [docs/decisions.md](docs/decisions.md) | 착수 전 결정 대기 목록과 기술 검토에서 나온 미결 질문 |
| [docs/reviews/tech-review-claude-v0.1.md](docs/reviews/tech-review-claude-v0.1.md) | 개발 담당 기술 검토 의견서 v0.1 (사본) |
| [docs/reviews/t01-t08-claude-response-v0.1.md](docs/reviews/t01-t08-claude-response-v0.1.md) | GPT 쟁점 T01–T08에 대한 개발 담당 답변 v0.1 (검토 대기) |
| [docs/design/](docs/design/README.md) | 디자인 시스템 v0.2 토큰 원본 보관 (사양서 원본은 Gemini의 Google Docs) |

## 원본 자료 위치

- **노션 프로젝트 허브 (GPT 운영, 기획·결정의 원본):** https://app.notion.com/p/41fcd7a62697815dad08c59d402ade61
- 이 저장소의 `docs/`는 개발에 필요한 내용의 사본·요약이다. 노션 내용과 다르면 노션이 우선한다.

## 라이선스

[MIT](LICENSE)
