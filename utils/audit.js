const pool = require('../db');

async function logAudit({ userId, action, entity, entityId, description }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs 
        (user_id, action, entity, entity_id, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId || null,
        action || 'ACTION',
        entity || null,
        entityId || null,
        description || null,
      ]
    );
  } catch (error) {
    console.log('Auditoria ignorada:', error.message);
  }
}

module.exports = { logAudit };