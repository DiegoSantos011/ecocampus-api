function adminMiddleware(req, res, next) {
  if (req.userTipo !== 'admin') {
    return res.status(403).json({
      message: 'Acesso negado. Apenas administradores podem acessar esta rota.',
    });
  }

  next();
}

module.exports = adminMiddleware;