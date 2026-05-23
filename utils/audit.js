const pool = require('../db');

async function logAudit(data = {}) {
  try {
    const {
      userId = null,
      action = 'ACTION',
      entity = null,
      entityId = null,
      description = null,
    } = data;

    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity, entity_id, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, action, entity, entityId, description]
    );
  } catch (error) {
    console.log('Auditoria ignorada:', error.message);
  }
}

module.exports = logAudit;
module.exports.logAudit = logAudit;
module.exports.logAction = logAudit;