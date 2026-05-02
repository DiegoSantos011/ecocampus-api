const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');
const { logAudit } = require('../utils/audit');

// CADASTRO
router.post('/register', async (req, res) => {
  try {
    const {
      nome,
      email,
      senha,
      tipo,
      cpf,
      cep,
      street,
      neighborhood,
      city,
      state,
      number,
      complement,
      phone,
      birthDate,
    } = req.body;

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
      `INSERT INTO users
        (nome, email, senha, tipo, cpf, cep, street, neighborhood, city, state, number, complement, phone, birth_date, points)
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, nome, email, tipo, cpf, cep, street, neighborhood, city, state, number, complement, phone, birth_date, points`,
      [
        nome,
        email,
        senhaHash,
        tipo,
        cpf || null,
        cep || null,
        street || null,
        neighborhood || null,
        city || null,
        state || null,
        number || null,
        complement || null,
        phone || null,
        birthDate || null,
        0,
      ]
    );

  await logAudit({
  userId: user.id,
  action: 'LOGIN',
  entity: 'users',
  entityId: user.id,
  description: `Usuário ${user.email} realizou login.`,
});

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
      `SELECT 
        id, nome, email, tipo, cpf, cep, street, neighborhood, city, state,
        number, complement, phone, birth_date, points
       FROM users
       WHERE id = $1`,
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

// ATUALIZAR PERFIL DO USUÁRIO LOGADO
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const {
      nome,
      email,
      cpf,
      cep,
      street,
      neighborhood,
      city,
      state,
      number,
      complement,
      phone,
      birthDate,
      currentPassword,
      newPassword,
    } = req.body;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    const user = userResult.rows[0];

    const finalNome = nome ?? user.nome;
    const finalEmail = email ?? user.email;
    const finalCpf = cpf ?? user.cpf;
    const finalCep = cep ?? user.cep;
    const finalStreet = street ?? user.street;
    const finalNeighborhood = neighborhood ?? user.neighborhood;
    const finalCity = city ?? user.city;
    const finalState = state ?? user.state;
    const finalNumber = number ?? user.number;
    const finalComplement = complement ?? user.complement;
    const finalPhone = phone ?? user.phone;
    const finalBirthDate = birthDate ?? user.birth_date;

    if (finalEmail !== user.email) {
      const emailJaExiste = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id <> $2',
        [finalEmail, req.userId]
      );

      if (emailJaExiste.rows.length > 0) {
        return res.status(400).json({
          message: 'Este e-mail já está sendo utilizado.',
        });
      }
    }

    let finalSenha = user.senha;

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({
          message: 'Informe a senha atual para alterar a senha.',
        });
      }

      const senhaCorreta = await bcrypt.compare(currentPassword, user.senha);

      if (!senhaCorreta) {
        return res.status(401).json({
          message: 'A senha atual está incorreta.',
        });
      }

      finalSenha = await bcrypt.hash(newPassword, 10);
    }

    const result = await pool.query(
      `UPDATE users SET
        nome = $1,
        email = $2,
        cpf = $3,
        cep = $4,
        street = $5,
        neighborhood = $6,
        city = $7,
        state = $8,
        number = $9,
        complement = $10,
        phone = $11,
        birth_date = $12,
        senha = $13
      WHERE id = $14
      RETURNING
        id, nome, email, tipo, cpf, cep, street, neighborhood, city, state,
        number, complement, phone, birth_date, points`,
      [
        finalNome,
        finalEmail,
        finalCpf,
        finalCep,
        finalStreet,
        finalNeighborhood,
        finalCity,
        finalState,
        finalNumber,
        finalComplement,
        finalPhone,
        finalBirthDate,
        finalSenha,
        req.userId,
      ]
    );

    res.json({
      message: 'Perfil atualizado com sucesso.',
      user: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao atualizar perfil.',
      error: error.message,
    });
  }
});

// EXCLUIR CONTA DO USUÁRIO LOGADO
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

// LISTAR USUÁRIOS
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, tipo, points FROM users ORDER BY id ASC'
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao buscar usuários',
      error: error.message,
    });
  }
});

module.exports = router;