# Datetime

절대 시각, 한국 업무 시각, 달력 날짜를 구분하기 위한 엄격한 날짜/시간 유틸리티입니다.

## 설치 및 불러오기

CommonJS:

```js
const {
  now,
  parseInstant,
  parseSeoulDateTime,
  toUtcIso,
  formatSeoulDateTime,
  formatSeoulDate,
} = require('@theSportsDev/utils/datetime');
```

ESM:

```js
import datetime, {
  parseInstant,
  toUtcIso,
} from '@theSportsDev/utils/datetime';
```

## 기본 원칙

- DB의 instant 컬럼에는 문자열 대신 JavaScript `Date`를 전달합니다.
- HTTP, RabbitMQ 등 서비스 경계에서는 UTC ISO 8601을 사용합니다.
- `YYYY-MM-DD HH:mm:ss`는 명시적인 서울 업무 시각 또는 표시 용도로만 사용합니다.
- `YYYY-MM-DD` 달력 날짜는 instant와 구분하고 임의로 timezone 변환하지 않습니다.
- nullable 값은 이 모듈을 호출하기 전에 처리합니다.

이 모듈은 `process.env.TZ`와 Dayjs 전역 기본 timezone을 변경하지 않습니다.

## API

### 상수

```js
SEOUL_TIME_ZONE // 'Asia/Seoul'
DATE_FORMAT // 'YYYY-MM-DD'
DATETIME_FORMAT // 'YYYY-MM-DD HH:mm:ss'
```

### `now()`

현재 절대 시각을 새로운 `Date` 인스턴스로 반환합니다.

```js
await Model.create({ sent_at: now() });
```

### `parseInstant(value)`

timezone offset이 포함된 외부 시각을 `Date`로 변환합니다.

허용 형식:

```text
2026-08-05T06:00:00Z
2026-08-05T06:00:00.123Z
2026-08-05T15:00:00+09:00
2026-08-04T22:00:00-08:00
```

지원 연도는 `1970`부터 `9999`까지입니다. offset 없는 문자열, date-only, 앞뒤 공백, 범위 밖 연도, 잘못된 달력 날짜와 `24:00:00`은 거부합니다.

```js
const reserveAt = parseInstant(req.body.reserveAt);
```

### `parseSeoulDateTime(value)`

정확한 `YYYY-MM-DD HH:mm:ss` 문자열을 `Asia/Seoul`의 업무 시각으로 해석해 `Date`로 반환합니다. 지원 연도는 `1970`부터 `9999`까지이며, 레거시 CMS나 예약 입력 경계에서만 사용합니다.

```js
const reserveAt = parseSeoulDateTime('2026-08-05 15:00:00');
reserveAt.toISOString(); // '2026-08-05T06:00:00.000Z'
```

자동 trim이나 잘못된 날짜 보정은 하지 않습니다.

### `toUtcIso(value)`

유효한 `Date`를 밀리초가 포함된 UTC ISO 8601 문자열로 변환합니다.

```js
toUtcIso(new Date('2026-08-05T06:00:00Z'));
// '2026-08-05T06:00:00.000Z'
```

### `formatSeoulDateTime(value)`

유효한 `Date`를 서울 표시 시각으로 변환합니다.

```js
formatSeoulDateTime(new Date('2026-08-05T06:00:00Z'));
// '2026-08-05 15:00:00'
```

반환 문자열을 DB instant 저장이나 서비스 간 timestamp로 사용하지 않습니다.

### `formatSeoulDate(value)`

유효한 `Date`에 해당하는 서울 달력 날짜를 반환합니다.

```js
formatSeoulDate(new Date('2026-08-05T15:00:00Z'));
// '2026-08-06'
```

## 오류

- 함수가 요구하는 타입이 아니면 `TypeError`를 발생시킵니다.
- 형식, 달력 날짜, offset 또는 `Date`가 유효하지 않으면 `RangeError`를 발생시킵니다.
- 잘못된 입력을 현재 시각이나 유사한 날짜로 자동 보정하지 않습니다.

```js
try {
  const reserveAt = parseInstant(req.body.reserveAt);
  // reserveAt 사용
} catch (error) {
  if (error instanceof TypeError || error instanceof RangeError) {
    // API 경계에서 400 응답 등 서비스 계약으로 변환
  }
  throw error;
}
```
