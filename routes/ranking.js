const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nome, email, tipo, points
       FROM users
       ORDER BY points DESC, nome ASC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar ranking.',
      error: error.message,
    });
  }
});

module.exports = router;