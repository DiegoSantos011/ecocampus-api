const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// LISTAR RECOMPENSAS
router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM rewards ORDER BY id DESC'
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar recompensas',
      error: error.message,
    });
  }
});

// CRIAR RECOMPENSA (ADMIN)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, cost, description, stock } = req.body;

    const result = await pool.query(
      `INSERT INTO rewards (name, cost, description, stock)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, cost, description, stock]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao criar recompensa',
      error: error.message,
    });
  }
});

module.exports = router;