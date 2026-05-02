const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');

const usersRoutes = require('./routes/users');
const occurrencesRoutes = require('./routes/occurrences');
const rewardsRoutes = require('./routes/rewards');
const redemptionsRoutes = require('./routes/redemptions');
const rankingRoutes = require('./routes/ranking');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/users', usersRoutes);
app.use('/occurrences', occurrencesRoutes);
app.use('/rewards', rewardsRoutes);
app.use('/redemptions', redemptionsRoutes);
app.use('/ranking', rankingRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/audit', auditRoutes);

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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('Servidor rodando na porta ' + PORT);
});