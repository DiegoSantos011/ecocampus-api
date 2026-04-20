const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'ecocampus/occurrences',
        resource_type: 'image',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// CRIAR OCORRÊNCIA
router.post(
  '/',
  authMiddleware,
  upload.single('image'),
  async (req, res) => {
    try {
      const { category, location, description, points } = req.body;

      if (!category || !location || !description) {
        return res.status(400).json({
          message: 'Informe categoria, local e descrição.',
        });
      }

      const userResult = await pool.query(
        'SELECT id, nome FROM users WHERE id = $1',
        [req.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Usuário não encontrado.',
        });
      }

      const user = userResult.rows[0];

      let imageUrl = '';

      if (req.file && req.file.buffer) {
        const uploadedImage = await uploadBufferToCloudinary(req.file.buffer);
        imageUrl = uploadedImage.secure_url;
      }

      const result = await pool.query(
        `INSERT INTO occurrences
          (user_id, user_name, category, location, description, image_uri, points, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          user.id,
          user.nome,
          category,
          location,
          description,
          imageUrl,
          Number(points) || 0,
          'Pendente',
        ]
      );

      res.json({
        message: 'Ocorrência registrada com sucesso.',
        occurrence: result.rows[0],
      });
    } catch (error) {
      console.log('ERRO AO CRIAR OCORRÊNCIA:', error);

      res.status(500).json({
        message: 'Erro ao criar ocorrência.',
        error: error.message,
      });
    }
  }
);

// EDITAR MINHA OCORRÊNCIA PENDENTE
router.put(
  '/:id',
  authMiddleware,
  upload.single('image'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { category, location, description, points } = req.body;

      const occurrenceResult = await pool.query(
        'SELECT * FROM occurrences WHERE id = $1 AND user_id = $2',
        [id, req.userId]
      );

      if (occurrenceResult.rows.length === 0) {
        return res.status(404).json({
          message: 'Ocorrência não encontrada.',
        });
      }

      const occurrence = occurrenceResult.rows[0];

      if (occurrence.status !== 'Pendente') {
        return res.status(400).json({
          message: 'Só é possível editar ocorrências pendentes.',
        });
      }

      let imageUrl = occurrence.image_uri || '';

      if (req.file && req.file.buffer) {
        const uploadedImage = await uploadBufferToCloudinary(req.file.buffer);
        imageUrl = uploadedImage.secure_url;
      }

      const updatedResult = await pool.query(
        `UPDATE occurrences
         SET
           category = $1,
           location = $2,
           description = $3,
           image_uri = $4,
           points = $5
         WHERE id = $6
         RETURNING *`,
        [
          category || occurrence.category,
          location || occurrence.location,
          description || occurrence.description,
          imageUrl,
          Number(points) || occurrence.points || 0,
          id,
        ]
      );

      res.json({
        message: 'Ocorrência atualizada com sucesso.',
        occurrence: updatedResult.rows[0],
      });
    } catch (error) {
      console.log('ERRO AO EDITAR OCORRÊNCIA:', error);

      res.status(500).json({
        message: 'Erro ao editar ocorrência.',
        error: error.message,
      });
    }
  }
);

// LISTAR MINHAS OCORRÊNCIAS
router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM occurrences
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar ocorrências do usuário.',
      error: error.message,
    });
  }
});

// LISTAR OCORRÊNCIAS PENDENTES (SÓ ADMIN)
router.get('/pending', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM occurrences
       WHERE status = 'Pendente'
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar ocorrências pendentes.',
      error: error.message,
    });
  }
});

// LISTAR TODAS AS OCORRÊNCIAS (SÓ ADMIN)
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM occurrences
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar ocorrências.',
      error: error.message,
    });
  }
});

// APROVAR OCORRÊNCIA (SÓ ADMIN, COM PONTUAÇÃO DEFINIDA PELO ADMIN)
router.patch('/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { points } = req.body;

    if (points === undefined || points === null || Number(points) < 0) {
      return res.status(400).json({
        message: 'Informe uma pontuação válida.',
      });
    }

    await client.query('BEGIN');

    const occurrenceResult = await client.query(
      'SELECT * FROM occurrences WHERE id = $1',
      [id]
    );

    if (occurrenceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Ocorrência não encontrada.',
      });
    }

    const occurrence = occurrenceResult.rows[0];

    if (occurrence.status !== 'Pendente') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'A ocorrência já foi validada.',
      });
    }

    const approvedPoints = Number(points);

    const updatedOccurrence = await client.query(
      `UPDATE occurrences
       SET status = 'Aprovada',
           validated_at = CURRENT_TIMESTAMP,
           points = $2
       WHERE id = $1
       RETURNING *`,
      [id, approvedPoints]
    );

    await client.query(
      `UPDATE users
       SET points = COALESCE(points, 0) + $1
       WHERE id = $2`,
      [approvedPoints, occurrence.user_id]
    );

    await client.query('COMMIT');

    res.json({
      message: 'Ocorrência aprovada com sucesso.',
      occurrence: updatedOccurrence.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    res.status(500).json({
      message: 'Erro ao aprovar ocorrência.',
      error: error.message,
    });
  } finally {
    client.release();
  }
});

// REJEITAR OCORRÊNCIA (SÓ ADMIN)
router.patch('/:id/reject', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const occurrenceResult = await pool.query(
      'SELECT * FROM occurrences WHERE id = $1',
      [id]
    );

    if (occurrenceResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Ocorrência não encontrada.',
      });
    }

    const occurrence = occurrenceResult.rows[0];

    if (occurrence.status !== 'Pendente') {
      return res.status(400).json({
        message: 'A ocorrência já foi validada.',
      });
    }

    const updatedOccurrence = await pool.query(
      `UPDATE occurrences
       SET status = 'Rejeitada', validated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    res.json({
      message: 'Ocorrência rejeitada com sucesso.',
      occurrence: updatedOccurrence.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao rejeitar ocorrência.',
      error: error.message,
    });
  }
});

module.exports = router;