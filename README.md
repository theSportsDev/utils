# @theSportsDev/utils

PlatformN 사내 공통 유틸리티 라이브러리.

기여 방법과 배포 절차는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고해 주세요.

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

| 모듈     | 설명                                                                                      | 문서                                       |
| -------- | ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| Logger   | Morgan + Winston 기반 로거. 싱글턴으로 동작하며 앱 전체에서 동일한 인스턴스를 공유합니다. | [logger/README.md](./src/logger/README.md) |
| Notifier | Slack 에러·작업·배포 알림 발송기. `ErrorNotifier`와 `SlackNotifier`를 제공합니다.         | [notifier/README.md](./src/notifier/README.md) |
| Datetime | 절대 시각, 서울 업무 시각, UTC ISO 출력을 구분하는 엄격한 날짜/시간 유틸리티입니다.      | [datetime/README.md](./src/datetime/README.md) |
