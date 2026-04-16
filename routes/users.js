const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

// CADASTRO
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, tipo } = req.body;

    if (!nome || !email || !senha || !tipo) {
      return res.status(400).json({
        message: 'Preencha nome, email, senha e tipo.',
      });
    }

    const emailJaExiste = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (emailJaExiste.rows.length > 0) {
      return res.status(400).json({
        message: 'Este e-mail já está cadastrado.',
      });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const result = await pool.query(
      'INSERT INTO users (nome, email, senha, tipo) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, tipo',
      [nome, email, senhaHash, tipo]
    );

    res.json({
      message: 'Usuário criado com sucesso',
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao cadastrar usuário',
      error: error.message,
    });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({
        message: 'Informe email e senha.',
      });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Email ou senha inválidos',
      });
    }

    const user = result.rows[0];

    const senhaCorreta = await bcrypt.compare(senha, user.senha);

    if (!senhaCorreta) {
      return res.status(401).json({
        message: 'Email ou senha inválidos',
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        tipo: user.tipo,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1d',
      }
    );

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao fazer login',
      error: error.message,
    });
  }
});

// PERFIL DO USUÁRIO LOGADO
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, tipo FROM users WHERE id = $1',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Usuário não encontrado',
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar perfil',
      error: error.message,
    });
  }
});

// LISTAR USUÁRIOS
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, tipo FROM users ORDER BY id ASC'
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar usuários',
      error: error.message,
    });
  }

  router.delete('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, nome, email, tipo',
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    res.json({
      message: 'Conta excluída com sucesso.',
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao excluir conta.',
      error: error.message,
    });
  }
});
});

module.exports = router;