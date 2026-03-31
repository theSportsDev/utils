'use strict';

const { transports } = require('winston');

function createConsoleTransport(format) {
  return new transports.Console({ format });
}

module.exports = { createConsoleTransport };
