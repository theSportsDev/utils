'use strict';

const BaseLogger = require('../core/BaseLogger');

describe('BaseLogger', () => {
  let logger;

  beforeEach(() => {
    logger = new BaseLogger();
  });

  // ─── 추상 메서드: 미구현 시 에러 ────────────────────────────────────────────

  describe('추상 메서드 — 구현하지 않으면 에러를 던진다', () => {
    const abstractMethods = [
      ['init',    () => logger.init({})],
      ['child',   () => logger.child({})],
      ['error',   () => logger.error('msg')],
      ['warn',    () => logger.warn('msg')],
      ['info',    () => logger.info('msg')],
      ['http',    () => logger.http('msg')],
      ['debug',   () => logger.debug('msg')],
      ['verbose', () => logger.verbose('msg')],
    ];

    test.each(abstractMethods)('%s()', (_name, call) => {
      expect(call).toThrow(`${_name}() must be implemented`);
    });
  });

  // ─── Best practice: 서브클래스 구현 ─────────────────────────────────────────

  describe('서브클래스가 올바르게 구현하면', () => {
    let ConcreteLogger;

    beforeEach(() => {
      ConcreteLogger = class extends BaseLogger {
        init(config)          { this.config = config; }
        child(context)        { const c = new ConcreteLogger(); c._ctx = context; return c; }
        error(message, meta)  { return { level: 'error', message, meta }; }
        warn(message, meta)   { return { level: 'warn',  message, meta }; }
        info(message, meta)   { return { level: 'info',  message, meta }; }
        http(message, meta)   { return { level: 'http',  message, meta }; }
        debug(message, meta)  { return { level: 'debug', message, meta }; }
        verbose(message, meta){ return { level: 'verbose', message, meta }; }
      };
    });

    test('instanceof BaseLogger를 만족한다', () => {
      expect(new ConcreteLogger()).toBeInstanceOf(BaseLogger);
    });

    test('init()이 에러 없이 실행된다', () => {
      const concrete = new ConcreteLogger();
      expect(() => concrete.init({ level: 'info' })).not.toThrow();
    });

    test.each([
      ['error',   'error'],
      ['warn',    'warn'],
      ['info',    'info'],
      ['http',    'http'],
      ['debug',   'debug'],
      ['verbose', 'verbose'],
    ])('%s()이 올바른 level을 반환한다', (method, expectedLevel) => {
      const concrete = new ConcreteLogger();
      const result = concrete[method]('hello', { requestId: '123' });
      expect(result.level).toBe(expectedLevel);
      expect(result.message).toBe('hello');
      expect(result.meta).toEqual({ requestId: '123' });
    });

    test('child()가 BaseLogger 인스턴스를 반환한다', () => {
      const concrete = new ConcreteLogger();
      const child = concrete.child({ service: 'api' });
      expect(child).toBeInstanceOf(BaseLogger);
    });

    test('child()가 전달한 context를 보존한다', () => {
      const concrete = new ConcreteLogger();
      const child = concrete.child({ service: 'api', version: '1' });
      expect(child._ctx).toEqual({ service: 'api', version: '1' });
    });

    test('meta 없이 호출해도 에러가 발생하지 않는다', () => {
      const concrete = new ConcreteLogger();
      expect(() => concrete.info('message only')).not.toThrow();
    });
  });
});
