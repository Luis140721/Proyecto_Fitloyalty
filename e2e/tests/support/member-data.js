const { randomUUID } = require('node:crypto');

function createMemberData(testInfo) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  const name = `Miembro E2E ${suffix}`;

  return {
    name,
    document: `E2E${Date.now().toString().slice(-8)}${testInfo.repeatEachIndex}${suffix.slice(0, 4)}`,
    planTotal: 60000,
    planPaid: 60000,
  };
}

module.exports = { createMemberData };
