# How to contribute

이 문서는 `@theSportsDev/utils`에 기여하는 방법을 안내합니다.

Util 코드는 전사 공용 코드를 지향하므로 **속도보다 안정성**이 중요합니다. 이에 필요한 가이드를 제시합니다.

---

## 1. 개발 환경 설정

### 저장소 클론

```bash
git clone https://github.com/theSportsDev/utils.git
cd utils
```

### 의존성 설치

```bash
npm install
```

### 테스트 실행

```bash
npm test
```

모든 테스트가 통과하면 개발 환경이 정상적으로 설정된 것입니다.

## 2. 개발 및 테스트

### 코드 작성

- 새 기능을 추가할 경우 반드시 `test/` 디렉토리에 테스트 파일(`*.spec.js`)을 함께 작성해 주세요.
- 기존 기능을 수정할 경우 관련 테스트도 함께 업데이트해 주세요.

### 테스트 확인

PR을 올리기 전에 로컬에서 테스트가 모두 통과하는지 확인합니다.

```bash
npm test
```

---

## 3. 커밋 메시지 규칙

어떤 유틸을 수정했는지와 작업 유형을 tag로 prefix로 시작하여, 어떤 작업을 하셨는지 명확하게 작성해주세요.

### 예시

```
[Logger] feat: DateUtil 추가
```

### 태그 종류

| 태그       | 용도                     |
| ---------- | ------------------------ |
| `feat`     | 새 기능 추가             |
| `fix`      | 버그 수정                |
| `refactor` | 기능 변경 없는 코드 개선 |
| `test`     | 테스트 추가 또는 수정    |
| `docs`     | 문서 수정                |
| `chore`    | 빌드, 설정 등 기타 작업  |

---

## 4. Pull Request 생성

### GitHub에서 PR 열기

1. [저장소 페이지](https://github.com/theSportsDev/utils)에 접속합니다.
2. 상단에 나타나는 **"Compare & pull request"** 버튼을 클릭합니다.  
   (버튼이 보이지 않으면 **"Pull requests" 탭 → "New pull request"**를 클릭하세요.)
3. `base: main` ← `compare: 작업한 브랜치` 로 설정되어 있는지 확인합니다.

### PR 내용 작성

PR 제목과 본문을 아래 형식에 맞게 작성해 주세요.

**제목**

```
Feat. DateUtil 모듈 추가
```

**본문 (템플릿)**

```markdown
## 변경 내용

- 어떤 기능을 추가/수정/삭제했는지 설명합니다.

## 변경 이유

- 왜 이 변경이 필요한지 설명합니다.

## 테스트

- [ ] `npm test` 통과 확인
- [ ] 신규 기능에 대한 테스트 작성

## 참고 사항

- 리뷰어가 알아야 할 추가 정보가 있다면 적어주세요.
```

### 버전 변경이 필요한 경우

버전을 올리지 않고 머지하면 CI가 자동으로 **patch 버전을 bump**합니다.

**minor / major** 변경이 필요한 경우에만 작업 브랜치에서 미리 버전을 올린 뒤 커밋해 주세요.

```bash
npm version minor   # 기능 추가 (0.1.0 → 0.2.0)
npm version major   # Breaking change (0.1.0 → 1.0.0)
```

---

## 5. 코드 리뷰

### 리뷰어 지정

PR을 생성한 후 오른쪽 **"Reviewers"** 항목에서 리뷰어를 지정해 주세요.

협업하는 동료가 있다면 그 분을 또는 [모영진](https://github.com/youngjinmo)에게 리뷰를 요청해주세요.

### 리뷰 반영

리뷰어가 코멘트를 남기면 코드에 대해 논의하고, 수정이 필요할 경우 수정을 하거나 맥락이 필요한경우 주석이라도 추가해주세요.

이슈가 해소되면 코멘트를 Resolve 처리해주세요.

최초 PR 생성 시점에서 코드 변경이 발생했을 경우, 새로운 커밋을 생성하는 대신 기존 커밋을 Rebase해서 수정해주세요.

### Approve 조건

- 모든 CI 체크(테스트)가 통과해야 합니다.
- 최소 **1명의 Approve**가 있어야 머지할 수 있습니다.

---

## 6. 머지 및 배포

### 머지 방법

Approve를 받은 뒤 **"Merge pull request"** 버튼을 클릭합니다.  
기본 머지 전략은 **Rebase and merge**입니다. Rebase and merge는 커밋 로그를 선형적으로 관리함으로써 로그를 직관적으로 보기 좋습니다.

### 자동 배포

`main` 브랜치에 머지되면 GitHub Actions가 자동으로 실행됩니다.

```
PR 머지 → main push → GitHub Actions
  → package.json version 변경 여부 확인
  → 변경 없으면 자동으로 patch bump 후 push ([skip ci] 태그)
  → npm publish (GitHub Packages)
  → Slack 채널(#npm-publish-notify)에 배포 알림
```

배포 결과는 저장소의 **Actions 탭**에서 확인할 수 있습니다.

---

## 문의

궁금한 사항은 Slack의 팀 채널이나 GitHub Issues를 통해 남겨주세요.
