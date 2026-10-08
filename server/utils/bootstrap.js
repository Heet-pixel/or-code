// Runs before the server starts so that `npm start` "just works":
//   1. creates server/.env from .env.example if it doesn't exist
//   2. builds the React frontend (client/dist) if it hasn't been built yet
// Without step 2 the server only answers /api/* and the browser shows
// "Cannot GET /" at http://localhost:5000.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const serverDir = path.join(__dirname, '..');
const clientDir = path.join(serverDir, '..', 'client');
const distIndex = path.join(clientDir, 'dist', 'index.html');

function ensureEnv() {
  const envPath = path.join(serverDir, '.env');
  const examplePath = path.join(serverDir, '.env.example');
  if (fs.existsSync(envPath) || !fs.existsSync(examplePath)) return;

  const secret = crypto.randomBytes(32).toString('hex');
  const text = fs
    .readFileSync(examplePath, 'utf8')
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  fs.writeFileSync(envPath, text);
  console.log('Created server/.env (with a fresh JWT_SECRET). Edit MONGO_URI there if your MongoDB is not on 127.0.0.1:27017.');
}

function run(args, label) {
  console.log(`\n> ${label}`);
  // shell:true so "npm" resolves to npm.cmd on Windows
  const res = spawnSync('npm', args, { cwd: clientDir, stdio: 'inherit', shell: true });
  return res.status === 0;
}

function ensureClientBuild() {
  if (process.env.SKIP_CLIENT_BUILD === '1') return;
  if (fs.existsSync(distIndex)) return;
  if (!fs.existsSync(path.join(clientDir, 'package.json'))) return;

  console.log('client/dist not found - building the frontend once (this takes a minute)...');

  if (!fs.existsSync(path.join(clientDir, 'node_modules', 'vite'))) {
    if (!run(['install'], 'npm install (client)')) {
      console.error('Frontend install failed - see the error above.');
      return;
    }
  }
  if (!run(['run', 'build'], 'npm run build (client)')) {
    console.error('Frontend build failed - see the error above.');
    return;
  }
  console.log('Frontend built successfully.\n');
}

function bootstrap() {
  try {
    ensureEnv();
    ensureClientBuild();
  } catch (err) {
    console.error('Bootstrap step failed:', err.message);
  }
}

module.exports = { bootstrap, distIndex };
