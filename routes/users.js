const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middlewares/authMiddleware');

let logAudit = async () => {};

try {
  const auditModule = require('../utils/audit');

  if (typeof auditModule === 'function') {
    logAudit = auditModule;
  } else if (auditModule && typeof auditModule.logAudit === 'function') {
    logAudit = auditModule.logAudit;
  }
} catch (error) {
  console.log('Auditoria desativada em users:', error.message);
}

async function safeLogAudit(data) {
  try {
    await logAudit(data);
  } catch (error) {
    console.log('Auditoria ignorada:', error.message);
  }
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeDate(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return normalizeText(value);
  }

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

function getRecoveryQuestions(user) {
  const questions = [];

  if (user.birth_date) {
    questions.push({
      field: 'birth_date',
      question: 'Qual é a sua data de nascimento cadastrada? Use o formato DD/MM/AAAA.',
      answer: normalizeDate(user.birth_date),
    });
  }

  if (user.city) {
    questions.push({
      field: 'city',
      question: 'Qual é a cidade cadastrada no seu perfil?',
      answer: normalizeText(user.city),
    });
  }

  if (user.phone) {
    questions.push({
      field: 'phone',
      question: 'Qual é o telefone cadastrado no seu perfil?',
      answer: String(user.phone).replace(/\D/g, ''),
    });
  }

  if (user.cep) {
    questions.push({
      field: 'cep',
      question: 'Qual é o CEP cadastrado no seu perfil?',
      answer: String(user.cep).replace(/\D/g, ''),
    });
  }

  return questions;
}

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

    const createdUser = result.rows[0];

    await safeLogAudit({
      userId: createdUser.id,
      action: 'REGISTER',
      entity: 'users',
      entityId: createdUser.id,
      description: `Usuário ${createdUser.email} foi cadastrado.`,
    });

    res.json({
      message: 'Usuário criado com sucesso',
      user: createdUser,
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

    await safeLogAudit({
      userId: user.id,
      action: 'LOGIN',
      entity: 'users',
      entityId: user.id,
      description: `Usuário ${user.email} realizou login.`,
    });

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

// BUSCAR PERGUNTA DE RECUPERAÇÃO
router.post('/recovery-question', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: 'Informe o e-mail cadastrado.',
      });
    }

    const result = await pool.query(
      `SELECT id, email, birth_date, city, phone, cep
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    const user = result.rows[0];
    const questions = getRecoveryQuestions(user);

    if (questions.length === 0) {
      return res.status(400).json({
        message: 'Não há dados suficientes para recuperar a senha desta conta.',
      });
    }

    const selectedQuestion = questions[Math.floor(Math.random() * questions.length)];

    await safeLogAudit({
      userId: user.id,
      action: 'PASSWORD_RECOVERY_QUESTION',
      entity: 'users',
      entityId: user.id,
      description: `Sistema gerou pergunta de recuperação para ${user.email}.`,
    });

    res.json({
      message: 'Pergunta de recuperação gerada com sucesso.',
      email: user.email,
      question: selectedQuestion.question,
      field: selectedQuestion.field,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao gerar pergunta de recuperação.',
      error: error.message,
    });
  }
});

// REDEFINIR SENHA COM RESPOSTA
router.post('/reset-password-by-answer', async (req, res) => {
  try {
    const { email, field, answer, newPassword } = req.body;

    if (!email || !field || !answer || !newPassword) {
      return res.status(400).json({
        message: 'Informe e-mail, pergunta, resposta e nova senha.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'A nova senha deve ter pelo menos 6 caracteres.',
      });
    }

    const result = await pool.query(
      `SELECT id, email, birth_date, city, phone, cep
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Usuário não encontrado.',
      });
    }

    const user = result.rows[0];
    const questions = getRecoveryQuestions(user);
    const selectedQuestion = questions.find((item) => item.field === field);

    if (!selectedQuestion) {
      return res.status(400).json({
        message: 'Pergunta de recuperação inválida.',
      });
    }

    let normalizedAnswer = '';

    if (field === 'birth_date') {
      normalizedAnswer = normalizeDate(answer);
    } else if (field === 'phone' || field === 'cep') {
      normalizedAnswer = String(answer).replace(/\D/g, '');
    } else {
      normalizedAnswer = normalizeText(answer);
    }

    if (normalizedAnswer !== selectedQuestion.answer) {
      await safeLogAudit({
        userId: user.id,
        action: 'PASSWORD_RECOVERY_FAILED',
        entity: 'users',
        entityId: user.id,
        description: `Tentativa incorreta de recuperação de senha para ${user.email}.`,
      });

      return res.status(401).json({
        message: 'Resposta incorreta. Tente novamente.',
      });
    }

    const senhaHash = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE users SET senha = $1 WHERE id = $2',
      [senhaHash, user.id]
    );

    await safeLogAudit({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entity: 'users',
      entityId: user.id,
      description: `Usuário ${user.email} redefiniu a própria senha.`,
    });

    res.json({
      message: 'Senha redefinida com sucesso. Faça login novamente.',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao redefinir senha.',
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

    await safeLogAudit({
      userId: req.userId,
      action: 'UPDATE_PROFILE',
      entity: 'users',
      entityId: req.userId,
      description: 'Usuário atualizou o próprio perfil.',
    });

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
    await safeLogAudit({
      userId: req.userId,
      action: 'DELETE_ACCOUNT',
      entity: 'users',
      entityId: req.userId,
      description: 'Usuário solicitou exclusão da própria conta.',
    });

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
router.get('/', authMiddleware, async (req, res) => {
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