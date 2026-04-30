'use strict';

const { LoggerFactory, logger } = require('./logger');
const { createMorganMiddleware } = require('./morgan');

module.exports = { LoggerFactory, logger, morganMiddleware: createMorganMiddleware };
