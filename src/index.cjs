'use strict';

const LoggerFactory = require('./core/LoggerFactory');
const { createMorganMiddleware } = require('./middleware/morgan');

module.exports = { LoggerFactory, morganMiddleware: createMorganMiddleware };
