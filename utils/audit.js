const pool = require('../db');

async function logAction(userId, action, description) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, description)
       VALUES ($1, $2, $3)`,
      [userId, action, description]
    );
  } catch (error) {
    console.log('Erro ao registrar auditoria:', error.message);
  }
}

module.exports = { logAction };