/// <reference types="vite/client" />

/** `vite --mode mock`일 때만 true. 배포 빌드에서는 false로 고정되어 모의 전송 코드가 빠진다. */
declare const __GAMDDEOL_MOCK__: boolean;

/** 빌드 식별자 (GitHub Actions에서는 커밋 SHA, 로컬은 "local"). */
declare const __GAMDDEOL_BUILD_ID__: string;
