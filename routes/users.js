const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');

// CADASTRO
router.post('/register', async (req, res) => {
  try {
    const { nome, email, senha, tipo } = req.body;

    if (!nome || !email || !senha || !tipo) {
      return res.status(400).json({
        message: 'Preencha todos os campos',
      });
    }

    // verifica email
    const emailExiste = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (emailExiste.rows.length > 0) {
      return res.status(400).json({
        message: 'Email já cadastrado',
      });
    }

    // 🔐 criptografar senha
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const result = await pool.query(
      'INSERT INTO users (nome, email, senha, tipo) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, tipo',
      [nome, email, senhaCriptografada, tipo]
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

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: 'Usuário não encontrado',
      });
    }

    const user = result.rows[0];

    // 🔐 comparar senha
    const senhaValida = await bcrypt.compare(senha, user.senha);

    if (!senhaValida) {
      return res.status(401).json({
        message: 'Senha incorreta',
      });
    }

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        tipo: user.tipo
      }
    });

  } catch (error) {
    res.status(500).json({
      message: 'Erro ao fazer login',
      error: error.message,
    });
  }
});

// LISTAR
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, tipo FROM users ORDER BY id ASC'
    );

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({
      message: 'Erro ao listar usuários',
      error: error.message,
    });
  }
});

module.exports = router;