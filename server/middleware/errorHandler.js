function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  // Response already started (e.g. a PDF stream) - nothing more we can send
  if (res.headersSent) {
    return res.end();
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ message: messages.join(', ') });
  }

  // e.g. /api/products/not-a-valid-id
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path || 'value'}` });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({ message: `That ${field} is already in use` });
  }

  // malformed JSON body etc.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }

  const status = err.status || 500;
  res.status(status).json({ message: status === 500 ? 'Something went wrong on our end' : err.message });
}

module.exports = { notFound, errorHandler };
