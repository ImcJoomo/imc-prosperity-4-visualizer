import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createDerivedCacheApi } from './derived-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 4173);
const BASE_PATH = `/${(process.env.BASE_PATH || 'imc-prosperity-4-visualizer').replace(/^\/+|\/+$/g, '')}`;
const DIST_DIR = process.env.DIST_DIR
  ? path.resolve(__dirname, process.env.DIST_DIR)
  : path.join(__dirname, '..', 'dist');
const PERF_BASE_PATH = `/${(process.env.PERF_BASE_PATH || 'imc-prosperity-4-visualizer-perf').replace(/^\/+|\/+$/g, '')}`;
const PERF_DIST_DIR = process.env.PERF_DIST_DIR
  ? path.resolve(__dirname, process.env.PERF_DIST_DIR)
  : path.join(__dirname, '..', 'dist-perf');
const AUTH_USER = process.env.BASIC_AUTH_USER;
const AUTH_PASSWORD = process.env.BASIC_AUTH_PASSWORD;

// Logs storage directory
const LOGS_DIR = path.join(__dirname, 'logs');
const DERIVED_DIR = path.join(__dirname, 'derived-cache');
const derivedCacheApi = createDerivedCacheApi({ logsDir: LOGS_DIR, derivedDir: DERIVED_DIR });

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

if (!AUTH_USER || !AUTH_PASSWORD) {
  console.error('Missing BASIC_AUTH_USER or BASIC_AUTH_PASSWORD environment variables');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

function unauthorized(res) {
  res.set('WWW-Authenticate', 'Basic realm="IMC Prosperity 4 Visualizer"');
  return res.status(401).send('Authentication required');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function basicAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Basic ')) {
    return unauthorized(res);
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const separatorIndex = decoded.indexOf(':');

  if (separatorIndex === -1) {
    return unauthorized(res);
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  if (!safeEqual(username, AUTH_USER) || !safeEqual(password, AUTH_PASSWORD)) {
    return unauthorized(res);
  }

  return next();
}

app.use(basicAuth);

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGS_DIR);
  },
  filename: (req, file, cb) => {
    // Use custom name if provided, otherwise use original filename with timestamp
    const customName = req.body.name || req.query.name;
    if (customName) {
      cb(null, `${customName}.json`);
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const originalName = path.parse(file.originalname).name;
      cb(null, `${originalName}_${timestamp}.json`);
    }
  },
});

const upload = multer({ storage });

// API: Upload log file
app.post('/api/logs/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const logName = path.parse(req.file.filename).name;
  derivedCacheApi.warmParsedCache(logName);
  res.json({
    success: true,
    name: logName,
    filename: req.file.filename,
    path: `/api/logs/${logName}`,
  });
});

// API: Save log data directly (JSON body)
app.post('/api/logs/save', (req, res) => {
  const { name, data } = req.body;

  if (!name || !data) {
    return res.status(400).json({ error: 'Name and data are required' });
  }

  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = path.join(LOGS_DIR, `${sanitizedName}.json`);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    derivedCacheApi.warmParsedCache(sanitizedName);
    res.json({
      success: true,
      name: sanitizedName,
      path: `/api/logs/${sanitizedName}`,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save log' });
  }
});

// API: List all saved logs
app.get('/api/logs', (req, res) => {
  try {
    const files = fs.readdirSync(LOGS_DIR);
    const logs = files
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const filePath = path.join(LOGS_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          name: path.parse(f).name,
          filename: f,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list logs' });
  }
});

// API: Get specific log by name
app.get('/api/logs/:name', (req, res) => {
  const { name } = req.params;
  const filePath = path.join(LOGS_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log not found' });
  }

  try {
    const data = fs.readFileSync(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: 'Failed to read log' });
  }
});

app.get('/api/logs/:name/parsed', (req, res) => {
  try {
    const { name } = req.params;
    const parsed = derivedCacheApi.ensureParsedCache(name);
    if (!parsed) {
      return res.status(404).json({ error: 'Log not found' });
    }
    res.json(parsed);
  } catch (err) {
    console.error(`Failed to serve parsed log ${req.params.name}:`, err);
    res.status(500).json({ error: 'Failed to build parsed log cache' });
  }
});

app.get('/api/logs/:name/charts/:chartType', (req, res) => {
  try {
    const { name, chartType } = req.params;
    const chartData = derivedCacheApi.getChartData(name, chartType, req.query);
    if (!chartData) {
      return res.status(404).json({ error: 'Chart data not found' });
    }
    res.json(chartData);
  } catch (err) {
    console.error(`Failed to serve ${req.params.chartType} chart for ${req.params.name}:`, err);
    res.status(500).json({ error: 'Failed to build chart data' });
  }
});

// API: Delete log
app.delete('/api/logs/:name', (req, res) => {
  const { name } = req.params;
  const filePath = path.join(LOGS_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log not found' });
  }

  try {
    fs.unlinkSync(filePath);
    derivedCacheApi.deleteParsedCache(name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

const frontendApps = [
  {
    label: 'main',
    basePath: BASE_PATH,
    distDir: DIST_DIR,
  },
  {
    label: 'perf',
    basePath: PERF_BASE_PATH,
    distDir: PERF_DIST_DIR,
  },
].filter(appConfig => {
  const indexFile = path.join(appConfig.distDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    return true;
  }

  if (appConfig.label === 'main') {
    console.error(`Built frontend not found at ${indexFile}`);
    console.error('Run `npm run build` in the repository root before starting the server.');
    process.exit(1);
  }

  console.warn(`Skipping ${appConfig.label} frontend, build not found at ${indexFile}`);
  return false;
});

for (const frontendApp of frontendApps) {
  const indexFile = path.join(frontendApp.distDir, 'index.html');
  app.use(frontendApp.basePath, express.static(frontendApp.distDir, { index: false }));

  app.get([frontendApp.basePath, `${frontendApp.basePath}/*`], (req, res) => {
    res.sendFile(indexFile);
  });
}

app.listen(PORT, () => {
  console.log(`Visualizer server running at http://localhost:${PORT}${BASE_PATH}/`);
  for (const frontendApp of frontendApps) {
    console.log(`Frontend (${frontendApp.label}): http://localhost:${PORT}${frontendApp.basePath}/`);
  }
  console.log(`Logs directory: ${LOGS_DIR}`);
});
