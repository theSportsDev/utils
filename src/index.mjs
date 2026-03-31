/**
 * ESM 진입점.
 * CJS 싱글톤을 재export하여 ESM 소비자도 동일한 로거 인스턴스를 공유합니다.
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { logger, morganMiddleware } = require('./index.cjs');

export { logger, morganMiddleware };
export default { logger, morganMiddleware };
