const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const { logAudit } = require('../utils/audit');

function generateRedemptionCode() {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ECO-${random}`;
}

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

// LISTAR MINHAS RECOMPENSAS ATIVAS
router.get('/active', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      `UPDATE redemptions
       SET status = 'Expirado'
       WHERE user_id = $1
       AND status = 'Aprovado'
       AND used_at IS NULL
       AND expires_at IS NOT NULL
       AND expires_at < CURRENT_TIMESTAMP`,
      [req.userId]
    );

    const result = await pool.query(
      `SELECT * FROM redemptions
       WHERE user_id = $1
       AND status = 'Aprovado'
       AND used_at IS NULL
       AND (expires_at IS NULL OR expires_at >= CURRENT_TIMESTAMP)
       ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar recompensas ativas.',
      error: error.message,
    });
  }
});

// LISTAR TODOS OS RESGATES — ADMIN
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM redemptions
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar resgates.',
      error: error.message,
    });
  }
});

// SOLICITAR RESGATE
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

    if (Number(reward.stock || 0) <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Essa recompensa está sem estoque.',
      });
    }

    if (Number(user.points || 0) < Number(reward.cost || 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Você não possui pontos suficientes.',
      });
    }

    await client.query(
      'UPDATE users SET points = COALESCE(points, 0) - $1 WHERE id = $2',
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

    await logAudit({
      userId: req.userId,
      action: 'REQUEST_REDEMPTION',
      entity: 'redemptions',
      entityId: redemptionResult.rows[0].id,
      description: `Usuário solicitou resgate da recompensa ${reward.name}.`,
    });

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

// ATUALIZAR STATUS DO RESGATE — ADMIN
router.patch('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        message: 'Informe o status.',
      });
    }

    let result;

    if (status === 'Aprovado') {
      const code = generateRedemptionCode();

      result = await pool.query(
        `UPDATE redemptions
         SET status = $1,
             code = COALESCE(code, $2),
             expires_at = COALESCE(expires_at, CURRENT_TIMESTAMP + INTERVAL '30 days')
         WHERE id = $3
         RETURNING *`,
        [status, code, id]
      );
    } else {
      result = await pool.query(
        `UPDATE redemptions
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Resgate não encontrado.',
      });
    }

    await logAudit({
      userId: req.userId,
      action: 'UPDATE_REDEMPTION_STATUS',
      entity: 'redemptions',
      entityId: Number(id),
      description: `Admin alterou status do resgate ${id} para ${status}.`,
    });

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

// USAR / RESGATAR RECOMPENSA
router.patch('/:id/use', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const redemptionResult = await pool.query(
      `SELECT * FROM redemptions
       WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );

    if (redemptionResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Recompensa não encontrada.',
      });
    }

    const redemption = redemptionResult.rows[0];

    if (redemption.status !== 'Aprovado') {
      return res.status(400).json({
        message: 'Esta recompensa não está disponível para uso.',
      });
    }

    if (redemption.used_at) {
      return res.status(400).json({
        message: 'Esta recompensa já foi utilizada.',
      });
    }

    if (redemption.expires_at && new Date(redemption.expires_at) < new Date()) {
      await pool.query(
        `UPDATE redemptions
         SET status = 'Expirado'
         WHERE id = $1 AND user_id = $2`,
        [id, req.userId]
      );

      return res.status(400).json({
        message: 'Esta recompensa expirou.',
      });
    }

    const result = await pool.query(
      `UPDATE redemptions
       SET status = 'Resgatado',
           used_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, req.userId]
    );

    await logAudit({
      userId: req.userId,
      action: 'USE_REWARD',
      entity: 'redemptions',
      entityId: Number(id),
      description: `Usuário utilizou a recompensa ${redemption.reward_name}.`,
    });

    res.json({
      message: 'Recompensa resgatada com sucesso.',
      redemption: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao utilizar recompensa.',
      error: error.message,
    });
  }
});

module.exports = router;