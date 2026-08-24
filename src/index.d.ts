export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug';
export type LogFormat = 'json' | 'pretty';

/** LoggerFactory.create에 전달하는 설정입니다. */
export interface LoggerConfig {
  /** 권장. 로그를 발생시킨 서비스 이름입니다. */
  service?: string;
  /** 실행 환경입니다. 기본값은 NODE_ENV 또는 development입니다. */
  env?: string;
  /** 배포 버전입니다. 기본값은 APP_VERSION 또는 unknown입니다. */
  version?: string;
  /** 최소 로그 레벨입니다. */
  level?: LogLevel;
  /** 로그 출력 형식입니다. */
  format?: LogFormat;
  /** 매 로그에 포함할 요청 컨텍스트 제공 함수입니다. */
  contextProvider?: () => object;
  /** 파일 로그를 저장할 디렉터리입니다. */
  logDir?: string;
  /** 파일 로그 보관 기간 또는 개수입니다. 기본값은 30d입니다. */
  maxFiles?: string;
  /** 파일 로그 하나의 최대 크기입니다. 기본값은 20m입니다. */
  maxSize?: string;
  /** 파일 로그 사용 여부입니다. logDir를 설정하면 기본으로 활성화됩니다. */
  enableFile?: boolean;
}

export interface Logger {
  error(message: string, value?: string | number | boolean | null): void;
  warn(message: string, value?: string | number | boolean | null): void;
  info(message: string, value?: string | number | boolean | null): void;
  http(message: string, value?: string | number | boolean | null): void;
  verbose(message: string, value?: string | number | boolean | null): void;
  debug(message: string, value?: string | number | boolean | null): void;
  child(context: Record<string, string>): Logger;
  activeContext(): Record<string, string>;
}

export interface LoggerFactory {
  /**
   * 서비스 전용 Logger를 생성합니다.
   *
   * @param config 서비스 이름을 포함한 Logger 설정입니다.
   */
  create(config: LoggerConfig): Logger;
}

export const LoggerFactory: LoggerFactory;
export const logger: Logger;
export const morganMiddleware: (...args: unknown[]) => unknown;
export const requestLoggerMiddleware: (...args: unknown[]) => unknown;
export const ErrorNotifier: unknown;
