const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');
const usersRoutes = require('./routes/users');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/users', usersRoutes);

app.get('/', (req, res) => {
  res.send('API EcoCampus rodando 🚀');
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      message: 'Banco conectado com sucesso',
      serverTime: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao conectar no banco',
      error: error.message,
    });
  }
});

app.get('/create-users-table', async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        tipo VARCHAR(20) NOT NULL
      );
    `);

    res.json({
      message: 'Tabela users criada com sucesso',
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erro ao criar tabela users',
      error: error.message,
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor rodando na porta ' + PORT);
});