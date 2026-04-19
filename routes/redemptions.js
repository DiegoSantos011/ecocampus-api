const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// LISTAR MEUS RESGATES
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM redemptions
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar resgates.',
      error: error.message,
    });
  }
});

// LISTAR TODOS OS RESGATES (SÓ ADMIN)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM redemptions ORDER BY created_at DESC'
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar resgates.',
      error: error.message,
    });
  }
});

// RESGATAR RECOMPENSA
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const { rewardId } = req.body;

    if (!rewardId) {
      return res.status(400).json({
        message: 'Informe a recompensa.',
      });
    }

    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, nome, points FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    const rewardResult = await client.query(
      'SELECT * FROM rewards WHERE id = $1',
      [rewardId]
    );

    if (rewardResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Recompensa não encontrada.',
      });
    }

    const user = userResult.rows[0];
    const reward = rewardResult.rows[0];

    if (reward.stock <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Essa recompensa está sem estoque.',
      });
    }

    if ((user.points || 0) < reward.cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Você não possui pontos suficientes.',
      });
    }

    await client.query(
      'UPDATE users SET points = points - $1 WHERE id = $2',
      [reward.cost, req.userId]
    );

    await client.query(
      'UPDATE rewards SET stock = stock - 1 WHERE id = $1',
      [rewardId]
    );

    const redemptionResult = await client.query(
      `INSERT INTO redemptions
        (reward_id, reward_name, user_id, user_name, cost, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        reward.id,
        reward.name,
        user.id,
        user.nome,
        reward.cost,
        'Solicitado',
      ]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Resgate solicitado com sucesso.',
      redemption: redemptionResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({
      message: 'Erro ao resgatar recompensa.',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// ATUALIZAR STATUS DO RESGATE (SÓ ADMIN)
router.patch('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        message: 'Informe o status.',
      });
    }

    const result = await pool.query(
      `UPDATE redemptions
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Resgate não encontrado.',
      });
    }

    res.json({
      message: 'Status do resgate atualizado com sucesso.',
      redemption: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao atualizar resgate.',
      error: error.message,
    });
  }
});

module.exports = router;