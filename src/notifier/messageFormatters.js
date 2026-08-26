'use strict';

const { sanitizeSlackMarkup } = require('./messageSafety');

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${fieldName} must be a non-empty string`);
  }

  return sanitizeSlackMarkup(value.trim());
}

function requireSuccess(success) {
  if (typeof success !== 'boolean') {
    throw new TypeError('success must be a boolean');
  }
}

function formatScriptResultMessage({ targetService, taskName, success } = {}) {
  const service = requireString(targetService, 'targetService');
  const task = requireString(taskName, 'taskName');
  requireSuccess(success);

  return success
    ? `${service} ${task} 완료`
    : `:rotating_light: *${service} ${task} 실패*`;
}

function formatDeploymentResultMessage({ environment, targetService, serviceType, success } = {}) {
  const deploymentEnvironment = requireString(environment, 'environment');
  const service = requireString(targetService, 'targetService');
  const normalizedServiceType = requireString(serviceType, 'serviceType').toUpperCase();
  requireSuccess(success);

  if (!['WEB', 'API'].includes(normalizedServiceType)) {
    throw new TypeError('serviceType must be WEB or API');
  }

  return success
    ? `*[${deploymentEnvironment}]* ${service} ${normalizedServiceType} 서버 배포되었습니다.`
    : `:rotating_light: *[${deploymentEnvironment}] ${service} ${normalizedServiceType} 서버 배포 실패*`;
}

module.exports = {
  formatScriptResultMessage,
  formatDeploymentResultMessage,
};
