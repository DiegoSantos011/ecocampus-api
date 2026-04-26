const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

router.get('/admin', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const occurrences = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'Pendente') AS pendentes,
        COUNT(*) FILTER (WHERE status = 'Aprovada') AS aprovadas,
        COUNT(*) FILTER (WHERE status = 'Rejeitada') AS rejeitadas
      FROM occurrences
    `);

    const users = await pool.query(`
      SELECT COUNT(*) AS total
      FROM users
      WHERE tipo <> 'admin'
    `);

    const redemptions = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'Solicitado') AS solicitados,
        COUNT(*) FILTER (WHERE status = 'Aprovado') AS aprovados,
        COUNT(*) FILTER (WHERE status = 'Rejeitado') AS rejeitados,
        COUNT(*) FILTER (WHERE status = 'Resgatado') AS resgatados
      FROM redemptions
    `);

    const rewards = await pool.query(`
      SELECT COUNT(*) AS total
      FROM rewards
    `);

    res.json({
      occurrences: occurrences.rows[0],
      users: users.rows[0],
      redemptions: redemptions.rows[0],
      rewards: rewards.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar dados do dashboard.',
      error: error.message,
    });
  }
});

module.exports = router;