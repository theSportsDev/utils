'use strict';

/**
 * Logger 사용 가이드 — 스펙 문서 역할을 하는 테스트 파일
 *
 * 이 파일을 읽으면 Logger를 어떻게 생성하고, 어떤 방식으로 로그를 남기며,
 * 파일에 어떻게 저장되는지 전체 사용법을 파악할 수 있습니다.
 *
 * 기본 사용 예시:
 *   // config/logger.js
 *   const { LoggerFactory } = require('@theSportsDev/utils');
 *   module.exports = LoggerFactory.create({ logDir: process.env.LOG_PATH });
 *
 *   // 다른 모듈
 *   const logger = require('./config/logger');
 *   logger.info('서버가 시작되었습니다', { port: 3000 });
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { LoggerFactory } = require('../../src/index.cjs');

/** 파일이 생성될 때까지 최대 timeout ms 대기 */
function waitForFile(filePath, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (fs.existsSync(filePath)) return resolve();
      if (Date.now() - start > timeout) return reject(new Error(`File not created within ${timeout}ms: ${filePath}`));
      setTimeout(check, 20);
    })();
  });
}

describe('Logger 사용 가이드', () => {

  // ── 1. 생성 ─────────────────────────────────────────────────────────────────

  describe('생성 (LoggerFactory.create)', () => {
    test('enableFile: false면 logDir 없이도 생성할 수 있다', () => {
      expect(() => LoggerFactory.create({ enableFile: false })).not.toThrow();
    });

    test('create()는 호출마다 독립적인 인스턴스를 반환한다', () => {
      const a = LoggerFactory.create({ enableFile: false });
      const b = LoggerFactory.create({ enableFile: false });
      expect(a).not.toBe(b);
    });

    test('create()로 반환된 인스턴스는 즉시 사용할 수 있다', () => {
      const logger = LoggerFactory.create({ enableFile: false });
      expect(() => logger.info('생성 직후 사용 테스트')).not.toThrow();
    });

    test('logDir 없이 enableFile: true(기본값)로 생성하면 파일 저장이 비활성화되고 콘솔 경고가 출력된다', () => {
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      const logger = LoggerFactory.create(); // enableFile 기본값 true, logDir 없음
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('logDir is required'));
      expect(() => logger.info('경고 후에도 동작해야 함')).not.toThrow();

      errorSpy.mockRestore();
    });
  });

  // ── 2. 로그 레벨 ───────────────────────────────────────────────────────────

  describe('로그 레벨', () => {
    let logger;
    let spy;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
      spy = {};
      ['info', 'warn', 'error', 'debug', 'verbose', 'http'].forEach(level => {
        spy[level] = jest.spyOn(logger._instance, level).mockImplementation(() => { });
      });
    });

    test('logger.info()  — 일반 정보 로그', () => {
      logger.info('서버가 시작되었습니다', { port: 3000 });
      expect(spy.info).toHaveBeenCalledWith('서버가 시작되었습니다', { port: 3000 });
    });

    test('logger.warn()  — 경고 로그', () => {
      logger.warn('메모리 사용량이 높습니다', { usage: '85%' });
      expect(spy.warn).toHaveBeenCalledWith('메모리 사용량이 높습니다', { usage: '85%' });
    });

    test('logger.error() — 에러 로그', () => {
      logger.error('데이터베이스 연결 실패', { host: 'db.internal' });
      expect(spy.error).toHaveBeenCalledWith('데이터베이스 연결 실패', { host: 'db.internal' });
    });

    test('logger.debug() — 디버그 로그', () => {
      logger.debug('쿼리 실행', { sql: 'SELECT * FROM users' });
      expect(spy.debug).toHaveBeenCalledWith('쿼리 실행', { sql: 'SELECT * FROM users' });
    });

    test('logger.verbose() — 상세 로그', () => {
      logger.verbose('요청 파라미터 덤프', { params: { id: 1 } });
      expect(spy.verbose).toHaveBeenCalledWith('요청 파라미터 덤프', { params: { id: 1 } });
    });

    test('logger.http() — HTTP 접근 로그 (morgan 연동용)', () => {
      logger.http('GET /health 200 5ms');
      expect(spy.http).toHaveBeenCalledWith('GET /health 200 5ms', {});
    });
  });

  // ── 3. 입력 형식 ───────────────────────────────────────────────────────────

  describe('입력 형식', () => {
    let logger;
    let infoSpy;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
      infoSpy = jest.spyOn(logger._instance, 'info').mockImplementation(() => { });
    });

    test('문자열 메시지만 전달', () => {
      logger.info('단순 문자열 메시지');
      expect(infoSpy).toHaveBeenCalledWith('단순 문자열 메시지', {});
    });

    test('문자열 메시지 + 메타 객체 전달', () => {
      logger.info('사용자 로그인', { userId: 42, ip: '127.0.0.1' });
      expect(infoSpy).toHaveBeenCalledWith('사용자 로그인', { userId: 42, ip: '127.0.0.1' });
    });

    test('Error 객체 전달 — message와 stack이 자동 추출된다', () => {
      const err = new Error('DB 타임아웃');
      logger.info(err);
      expect(infoSpy).toHaveBeenCalledWith(
        'DB 타임아웃',
        expect.objectContaining({ stack: expect.stringContaining('DB 타임아웃') }),
      );
    });

    test('Error 객체 + 추가 메타 전달 — stack과 메타가 병합된다', () => {
      const err = new Error('파일 없음');
      logger.info(err, { path: '/var/log/app.log' });
      expect(infoSpy).toHaveBeenCalledWith(
        '파일 없음',
        expect.objectContaining({ stack: expect.any(String), path: '/var/log/app.log' }),
      );
    });

    test('message 필드를 가진 객체 전달 — message가 분리되고 나머지는 메타로 처리된다', () => {
      logger.info({ message: '구조화 로그', requestId: 'req-001', duration: 120 });
      expect(infoSpy).toHaveBeenCalledWith(
        '구조화 로그',
        { requestId: 'req-001', duration: 120 },
      );
    });

    test('message 필드 없는 순수 구조화 객체 전달 — 빈 문자열 메시지 + 전체 메타', () => {
      logger.info({ event: 'user.signup', userId: 7 });
      expect(infoSpy).toHaveBeenCalledWith('', { event: 'user.signup', userId: 7 });
    });
  });

  // ── 4. child 로거 ──────────────────────────────────────────────────────────

  describe('child 로거 — 컨텍스트 바인딩', () => {
    let logger;

    beforeEach(() => {
      logger = LoggerFactory.create({ enableFile: false });
    });

    test('child()로 모듈·요청 단위 컨텍스트를 바인딩한 로거를 만들 수 있다', () => {
      const authLogger = logger.child({ module: 'auth' });

      expect(typeof authLogger.info).toBe('function');
      expect(typeof authLogger.warn).toBe('function');
      expect(typeof authLogger.error).toBe('function');
      expect(typeof authLogger.debug).toBe('function');
      expect(typeof authLogger.verbose).toBe('function');
      expect(typeof authLogger.http).toBe('function');
      expect(typeof authLogger.child).toBe('function');
    });

    test('child 로거의 로그 메서드가 예외를 던지지 않는다', () => {
      const child = logger.child({ module: 'payment' });

      expect(() => {
        child.info('결제 처리 시작', { orderId: 'ord-001' });
        child.warn('잔액 부족 경고');
        child.error('결제 실패', { reason: 'insufficient_funds' });
        child.debug('결제 상세 로그');
        child.verbose('결제 내부 상태');
        child.http('POST /pay 200 130ms');
      }).not.toThrow();
    });

    test('child()를 중첩해서 컨텍스트를 계층적으로 쌓을 수 있다', () => {
      const moduleLogger = logger.child({ module: 'order' });
      const requestLogger = moduleLogger.child({ requestId: 'req-xyz' });

      expect(() => requestLogger.info('주문 생성 완료', { orderId: 42 })).not.toThrow();
    });
  });

  // ── 5. 파일 저장 ───────────────────────────────────────────────────────────

  describe('파일 저장', () => {
    let tmpDir;
    let logger;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
      logger = LoggerFactory.create({ enableFile: true, logDir: tmpDir, env: 'test', format: 'json' });
    });

    afterEach(async () => {
      // 파일 스트림이 디렉토리 삭제 전에 완전히 닫히도록 종료 대기
      await new Promise(resolve => logger._instance.end(resolve));
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('enableFile: true 이면 combined 로그 파일이 생성된다', async () => {
      logger.info('파일 저장 확인', { requestId: 'test-001' });

      const today = new Date().toISOString().slice(0, 10);
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog);
      expect(fs.existsSync(combinedLog)).toBe(true);
    });

    test('파일 내용은 JSON 포맷이며 message·level·timestamp 필드를 포함한다', async () => {
      logger.info('JSON 포맷 검증', { userId: 99 });

      const today = new Date().toISOString().slice(0, 10);
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog);
      const parsed = JSON.parse(fs.readFileSync(combinedLog, 'utf-8').trim());

      expect(parsed.message).toBe('JSON 포맷 검증');
      expect(parsed.userId).toBe(99);
      expect(parsed.level).toBe('info');
      expect(parsed.timestamp).toBeDefined();
    });

    test('error 레벨 로그는 combined 파일과 error 전용 파일 양쪽에 기록된다', async () => {
      logger.error('심각한 오류 발생', { code: 500 });

      const today = new Date().toISOString().slice(0, 10);
      const logDir = path.join(tmpDir, 'test');
      const errorLog = path.join(logDir, `${today}-error.log`);
      const combinedLog = path.join(logDir, `${today}-combined.log`);

      await Promise.all([waitForFile(errorLog), waitForFile(combinedLog)]);

      const parsed = JSON.parse(fs.readFileSync(errorLog, 'utf-8').trim());
      expect(parsed.level).toBe('error');
      expect(parsed.message).toBe('심각한 오류 발생');
    });

    test('info 레벨 로그는 error 전용 파일에 기록되지 않는다', async () => {
      logger.info('일반 정보 로그');

      const today = new Date().toISOString().slice(0, 10);
      const combinedLog = path.join(tmpDir, 'test', `${today}-combined.log`);
      await waitForFile(combinedLog); // combined에 기록됨을 확인한 뒤

      // 파일이 생성되더라도 error 레벨 항목은 없어야 한다
      const errorLog = path.join(tmpDir, 'test', `${today}-error.log`);
      const errorContent = fs.existsSync(errorLog) ? fs.readFileSync(errorLog, 'utf-8').trim() : '';
      expect(errorContent).toBe('');
    });

    test('enableFile: false 이면 로그 디렉토리 자체가 생성되지 않는다', () => {
      const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-nofile-'));
      try {
        const consoleOnlyLogger = LoggerFactory.create({ enableFile: false, logDir: isolatedDir, env: 'test' });
        consoleOnlyLogger.info('파일 없음 확인');
        expect(fs.existsSync(path.join(isolatedDir, 'test'))).toBe(false);
      } finally {
        fs.rmSync(isolatedDir, { recursive: true, force: true });
      }
    });
  });
});
