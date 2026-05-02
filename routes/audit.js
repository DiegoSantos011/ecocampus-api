const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        audit_logs.id,
        audit_logs.user_id,
        users.nome AS user_name,
        audit_logs.action,
        audit_logs.description,
        audit_logs.created_at
       FROM audit_logs
       LEFT JOIN users ON users.id = audit_logs.user_id
       ORDER BY audit_logs.created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar logs de auditoria.',
      error: error.message,
    });
  }
});

module.exports = router;