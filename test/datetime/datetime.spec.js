'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const {
  SEOUL_TIME_ZONE,
  DATE_FORMAT,
  DATETIME_FORMAT,
  now,
  parseInstant,
  parseSeoulDateTime,
  toUtcIso,
  formatSeoulDateTime,
  formatSeoulDate,
} = require('../../src/datetime/index.cjs');

const packageRoot = path.resolve(__dirname, '../..');

describe('datetime 공개 API', () => {
  describe('상수 및 모듈 내보내기', () => {
    test('상수는 서울 시간대와 고정 포맷을 제공한다', () => {
      expect(SEOUL_TIME_ZONE).toBe('Asia/Seoul');
      expect(DATE_FORMAT).toBe('YYYY-MM-DD');
      expect(DATETIME_FORMAT).toBe('YYYY-MM-DD HH:mm:ss');
    });

    test('CommonJS는 named export plain object를 제공한다', () => {
      const datetime = require('../../src/datetime/index.cjs');

      expect(Object.getPrototypeOf(datetime)).toBe(Object.prototype);
      expect(datetime.default).toBeUndefined();
      expect(datetime.now).toEqual(expect.any(Function));
      expect(datetime.parseInstant).toEqual(expect.any(Function));
    });

    test('ESM은 named와 default 내보내기를 모두 제공한다', () => {
      const script = [
        "import * as datetime from '@theSportsDev/utils/datetime';",
        "if (typeof datetime.now !== 'function' || datetime.default.now !== datetime.now || datetime.default.DATE_FORMAT !== 'YYYY-MM-DD') process.exit(1);",
      ].join('');

      expect(() =>
        execFileSync(process.execPath, ['--input-type=module', '-e', script], {
          cwd: packageRoot,
          encoding: 'utf8',
        })
      ).not.toThrow();
    });

    test('패키지 self-reference로 datetime 하위 경로를 불러올 수 있다', () => {
      const result = execFileSync(
        process.execPath,
        ['-e', "const d=require('@theSportsDev/utils/datetime'); process.stdout.write(d.DATE_FORMAT);"],
        { cwd: packageRoot, encoding: 'utf8' }
      );

      expect(result).toBe('YYYY-MM-DD');
    });
  });

  describe('parseInstant()', () => {
    test('Z와 ±HH:mm 오프셋 및 밀리초를 정확히 파싱한다', () => {
      expect(parseInstant('2024-02-29T12:34:56Z').toISOString()).toBe('2024-02-29T12:34:56.000Z');
      expect(parseInstant('2024-02-29T12:34:56.123Z').toISOString()).toBe('2024-02-29T12:34:56.123Z');
      expect(parseInstant('2024-02-29T21:34:56+09:00').toISOString()).toBe('2024-02-29T12:34:56.000Z');
      expect(parseInstant('2024-02-29T04:34:56-08:00').toISOString()).toBe('2024-02-29T12:34:56.000Z');
    });

    test('정확한 형식이 아니거나 존재하지 않는 날짜는 거절한다', () => {
      const invalid = [
        '2024-02-29 12:34:56Z',
        '2024-02-29',
        '2024-02-29T12:34:56',
        '2024-02-29T12:34:56+0900',
        '2024-02-29T12:34:56+09',
        '2024-02-29T12:34:56+15:00',
        '2024-02-29T12:34:56+09:60',
        '2024-02-29T12:34:56-00:60',
        '2023-02-29T12:34:56Z',
        '2024-04-31T12:34:56Z',
        '2024-02-29T24:00:00Z',
        ' 2024-02-29T12:34:56Z',
        '2024-02-29T12:34:56.1234Z',
      ];

      invalid.forEach((value) => expect(() => parseInstant(value)).toThrow(RangeError));
    });

    test('문자열이 아닌 입력은 TypeError다', () => {
      expect(() => parseInstant(new Date())).toThrow(TypeError);
      expect(() => parseInstant(null)).toThrow(TypeError);
    });

    test('지원 연도는 1970년부터 9999년까지다', () => {
      expect(parseInstant('1970-01-01T00:00:00Z')).toEqual(expect.any(Date));
      expect(parseInstant('9999-12-31T23:59:59.999Z')).toEqual(expect.any(Date));
      ['1969-12-31T23:59:59Z', '0001-01-01T00:00:00Z', '0100-01-01T00:00:00Z'].forEach((value) =>
        expect(() => parseInstant(value)).toThrow(RangeError)
      );
    });
  });

  describe('parseSeoulDateTime()', () => {
    test('서울 정오를 UTC instant로 변환한다', () => {
      expect(parseSeoulDateTime('2024-02-29 12:34:56').toISOString()).toBe('2024-02-29T03:34:56.000Z');
    });

    test('윤년·월말은 허용하고 24시와 보정 가능한 날짜는 거절한다', () => {
      expect(parseSeoulDateTime('2024-02-29 23:59:59')).toEqual(expect.any(Date));
      expect(parseSeoulDateTime('2024-04-30 23:59:59')).toEqual(expect.any(Date));
      ['2024-02-30 12:00:00', '2024-04-31 12:00:00', '2024-02-29 24:00:00', '2024-02-29T12:00:00', ' 2024-02-29 12:00:00'].forEach((value) =>
        expect(() => parseSeoulDateTime(value)).toThrow(RangeError)
      );
    });

    test('문자열이 아닌 입력은 TypeError다', () => {
      expect(() => parseSeoulDateTime(20240229)).toThrow(TypeError);
    });

    test('지원 연도는 1970년부터 9999년까지다', () => {
      expect(parseSeoulDateTime('1970-01-01 00:00:00')).toEqual(expect.any(Date));
      expect(parseSeoulDateTime('9999-12-31 23:59:59')).toEqual(expect.any(Date));
      ['1969-12-31 23:59:59', '0001-01-01 00:00:00', '0100-01-01 00:00:00'].forEach((value) =>
        expect(() => parseSeoulDateTime(value)).toThrow(RangeError)
      );
    });
  });

  describe('formatSeoulDateTime() 및 formatSeoulDate()', () => {
    test('UTC instant를 서울 날짜와 날짜시간으로 포맷한다', () => {
      const instant = new Date('2024-02-29T15:34:56.789Z');

      expect(formatSeoulDateTime(instant)).toBe('2024-03-01 00:34:56');
      expect(formatSeoulDate(instant)).toBe('2024-03-01');
    });

    test('UTC-서울 날짜 경계를 서울 날짜로 계산한다', () => {
      expect(formatSeoulDate(new Date('2024-01-01T14:59:59.999Z'))).toBe('2024-01-01');
      expect(formatSeoulDate(new Date('2024-01-01T15:00:00.000Z'))).toBe('2024-01-02');
    });

    test('비-Date와 Invalid Date는 각각 TypeError와 RangeError다', () => {
      [formatSeoulDateTime, formatSeoulDate].forEach((format) => {
        expect(() => format('2024-01-01')).toThrow(TypeError);
        expect(() => format(new Date('invalid'))).toThrow(RangeError);
      });
    });

    test('포맷 함수는 입력 Date를 변경하지 않는다', () => {
      const instant = new Date('2024-02-29T15:34:56.789Z');
      const before = instant.getTime();

      formatSeoulDateTime(instant);
      formatSeoulDate(instant);

      expect(instant.getTime()).toBe(before);
    });
  });

  describe('toUtcIso()', () => {
    test('유효한 Date를 밀리초 포함 UTC ISO 문자열로 변환한다', () => {
      expect(toUtcIso(new Date('2024-02-29T03:34:56.789Z'))).toBe('2024-02-29T03:34:56.789Z');
    });

    test('비-Date와 Invalid Date는 각각 TypeError와 RangeError다', () => {
      expect(() => toUtcIso('2024-01-01')).toThrow(TypeError);
      expect(() => toUtcIso(new Date('invalid'))).toThrow(RangeError);
    });

    test('변환해도 입력 Date를 변경하지 않는다', () => {
      const instant = new Date('2024-02-29T03:34:56.789Z');
      const before = instant.getTime();

      toUtcIso(instant);

      expect(instant.getTime()).toBe(before);
    });
  });

  describe('now()', () => {
    test('현재 시각을 Date 인스턴스로 반환한다', () => {
      const before = Date.now();
      const value = now();
      const after = Date.now();

      expect(value).toBeInstanceOf(Date);
      expect(value.getTime()).toBeGreaterThanOrEqual(before);
      expect(value.getTime()).toBeLessThanOrEqual(after);
    });

    test('호출마다 유효한 새 Date 인스턴스를 반환한다', () => {
      const first = now();
      const second = now();

      expect(first).not.toBe(second);
      expect(Number.isNaN(first.getTime())).toBe(false);
      expect(Number.isNaN(second.getTime())).toBe(false);
    });
  });

  describe('프로세스 시간대 결정성', () => {
    test('datetime API 호출 전후 process.env.TZ를 변경하지 않는다', () => {
      const originalTz = process.env.TZ;
      process.env.TZ = 'America/New_York';

      try {
        parseSeoulDateTime('2024-02-29 23:30:00');
        formatSeoulDateTime(new Date('2024-02-29T14:30:00.000Z'));
        formatSeoulDate(new Date('2024-02-29T14:30:00.000Z'));
        now();
        expect(process.env.TZ).toBe('America/New_York');
      } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      }
    });

    test('dayjs 전역 기본 시간대를 변경하지 않는다', () => {
      const dayjs = require('dayjs');
      dayjs.extend(require('dayjs/plugin/utc'));
      dayjs.extend(require('dayjs/plugin/timezone'));
      dayjs.tz.setDefault('America/New_York');

      try {
        const before = dayjs.tz('2024-02-29 12:00:00');
        parseSeoulDateTime('2024-02-29 23:30:00');
        formatSeoulDateTime(new Date('2024-02-29T14:30:00.000Z'));
        const after = dayjs.tz('2024-02-29 12:00:00');
        expect({ valueOf: after.valueOf(), formatted: after.format() }).toEqual({
          valueOf: before.valueOf(),
          formatted: before.format(),
        });
      } finally {
        dayjs.tz.setDefault();
      }
    });

    test('TZ가 달라도 서울 기준 파싱과 포맷 결과가 동일하다', () => {
      const script = [
        "const d=require('@theSportsDev/utils/datetime');",
        "const instant=d.parseSeoulDateTime('2024-02-29 23:30:00');",
        "process.stdout.write(JSON.stringify({iso:d.toUtcIso(instant), local:d.formatSeoulDateTime(instant), date:d.formatSeoulDate(instant)}));",
      ].join('');
      const outputs = ['UTC', 'Asia/Seoul', 'America/New_York'].map((tz) =>
        execFileSync(process.execPath, ['-e', script], {
          cwd: packageRoot,
          encoding: 'utf8',
          env: { ...process.env, TZ: tz },
        })
      );

      expect(new Set(outputs).size).toBe(1);
      expect(JSON.parse(outputs[0])).toEqual({
        iso: '2024-02-29T14:30:00.000Z',
        local: '2024-02-29 23:30:00',
        date: '2024-02-29',
      });
    });
  });
});
