import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { LoggerFactory, logger, morganMiddleware } = require('./index.cjs');

export { LoggerFactory, logger, morganMiddleware };
export default { LoggerFactory, logger, morganMiddleware };
