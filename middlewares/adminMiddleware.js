function adminMiddleware(req, res, next) {
  if (req.userTipo !== 'admin') {
    return res.status(403).json({
      message: 'Apenas admin pode acessar',
    });
  }

  next();
}

module.exports = adminMiddleware;