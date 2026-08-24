import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LoggerFactory, logger, morganMiddleware, requestLoggerMiddleware } = require('./index.cjs');

export { LoggerFactory, logger, morganMiddleware, requestLoggerMiddleware };
export default { LoggerFactory, logger, morganMiddleware, requestLoggerMiddleware };
