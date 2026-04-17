# @theSportsDev/utils

Platformn 사내 공통 유틸리티 라이브러리.

기여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고해 주세요.

## 설치

패키지를 설치하기 전에 아래 레지스트리 설정이 필요합니다.

**1) 프로젝트 루트 `.npmrc`에 레지스트리 추가**

```
@theSportsDev:registry=https://npm.pkg.github.com
```

**2) GitHub Personal Access Token 설정** (`read:packages` 권한 필요)

```bash
# ~/.npmrc 에 추가 (전역 설정 — 커밋하지 마세요)
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc
```

**3) 설치**

```bash
npm install @theSportsDev/utils
```

---

## 모듈 목록

| 모듈 | 설명 | 문서 |
|------|------|------|
| Logger | Morgan + Winston 기반 로거. 싱글턴으로 동작하며 앱 전체에서 동일한 인스턴스를 공유합니다. | [logger/README.md](./logger/README.md) |

---

## 배포

main 브랜치에 머지되면 GitHub Actions가 자동으로 GitHub Packages에 배포합니다.

### 배포 절차

**1) PR을 열고 main에 머지한다**

머지 시 GitHub Actions가 자동으로 실행됩니다.

```
PR 머지 → main push → GitHub Actions
  → package.json version 변경 여부 확인
  → 변경 없으면 자동으로 patch bump 후 push ([skip ci] 태그)
  → npm publish (GitHub Packages)
  → Slack 채널(#npm-publish-notify)에 알림
```

> patch 이외의 버전 변경(minor, major)이 필요하면 작업 브랜치에서 미리 `npm version minor` 또는 `npm version major`를 실행해 주세요.

### 로컬에서 수동 배포 (긴급 시)

```bash
npm publish
```

> 로컬 배포 시 `~/.npmrc`에 `write:packages` 권한을 가진 GitHub Token이 설정되어 있어야 합니다.
