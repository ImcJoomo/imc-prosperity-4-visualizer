import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 4174;

// Logs storage directory
const LOGS_DIR = path.join(__dirname, 'logs');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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

// API: Delete log
app.delete('/api/logs/:name', (req, res) => {
  const { name } = req.params;
  const filePath = path.join(LOGS_DIR, `${name}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Log not found' });
  }

  try {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete log' });
  }
});

app.listen(PORT, () => {
  console.log(`Log server running at http://localhost:${PORT}`);
  console.log(`Logs directory: ${LOGS_DIR}`);
});
