const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');
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

// CRIAR OCORRÊNCIA COM IMAGEM REAL
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
      res.status(500).json({
        message: 'Erro ao criar ocorrência.',
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

// LISTAR TODAS AS OCORRÊNCIAS
router.get('/', authMiddleware, async (req, res) => {
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

// APROVAR OCORRÊNCIA E SOMAR PONTOS NO USUÁRIO
router.patch('/:id/approve', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

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

    const updatedOccurrence = await client.query(
      `UPDATE occurrences
       SET status = 'Aprovada', validated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await client.query(
      `UPDATE users
       SET points = COALESCE(points, 0) + $1
       WHERE id = $2`,
      [occurrence.points || 0, occurrence.user_id]
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

// REJEITAR OCORRÊNCIA
router.patch('/:id/reject', authMiddleware, async (req, res) => {
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