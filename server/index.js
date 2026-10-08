// Create .env + build the frontend if needed, BEFORE reading .env
require('./utils/bootstrap').bootstrap();
require('dotenv').config();

// Make "today" and daily buckets consistent between JS and MongoDB.
if (!process.env.TZ) process.env.TZ = 'Asia/Kolkata';

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const saleRoutes = require('./routes/sales');
const dashboardRoutes = require('./routes/dashboard');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 8) {
  console.error('JWT_SECRET is missing (or too short). Copy server/.env.example to server/.env and set it.');
  process.exit(1);
}

const app = express();

// Auth uses a Bearer token (not cookies), so an open CORS policy is safe and
// avoids "works on localhost, breaks on my phone / LAN IP" problems.
const allowed = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(allowed.length ? { origin: allowed } : undefined));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Unknown /api routes -> JSON 404 (must come before the SPA fallback)
app.use('/api', notFound);

// Serve the built frontend from the same port if it exists.
const clientDist = path.join(__dirname, '..', 'client', 'dist');
const indexHtml = path.join(clientDist, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(indexHtml));
  console.log('Serving built frontend from client/dist on this same port');
} else {
  console.log('client/dist is missing and the automatic build failed - see the errors above.');
  // Friendly page instead of a bare "Cannot GET /"
  app.get(/^(?!\/api).*/, (req, res) =>
    res
      .status(503)
      .type('html')
      .send(
        '<h2>Smart QR Billing - frontend not built</h2>' +
          '<p>The API is running, but <code>client/dist</code> does not exist.</p>' +
          '<p>Run this in the project folder, then refresh:</p>' +
          '<pre>cd client\nnpm install\nnpm run build</pre>'
      )
  );
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`Server listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
