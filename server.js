const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const databaseUrl = process.env.DATABASE_URL;

let assignmentsData = {};
let assigneesData = {};
const assignmentsFile = path.join(__dirname, 'data', 'assignments.json');
const assigneesFile = path.join(__dirname, 'data', 'assignees.json');

let pool;
if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  const initSQL = `
    CREATE TABLE IF NOT EXISTS assignees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assignments (
      code TEXT PRIMARY KEY,
      assignee_id TEXT REFERENCES assignees(id)
    );
  `;
  pool.query(initSQL).catch(err => console.error('Error initializing tables', err));
} else {
  if (fs.existsSync(assignmentsFile)) {
    assignmentsData = JSON.parse(fs.readFileSync(assignmentsFile));
  }
  if (fs.existsSync(assigneesFile)) {
    assigneesData = JSON.parse(fs.readFileSync(assigneesFile));
  }
}

app.get('/api/health', (req,res) => {
  res.json({ ok: true });
});

app.get('/api/assignees', async (req,res) => {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM assignees');
    res.json(rows);
  } else {
    res.json(Object.values(assigneesData));
  }
});

app.post('/api/assignees', async (req,res) => {
  const { id, name, color } = req.body;
  if (!id || !name || !color) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  if (pool) {
    await pool.query('INSERT INTO assignees (id,name,color) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color', [id, name, color]);
    const { rows } = await pool.query('SELECT * FROM assignees');
    res.json(rows);
  } else {
    assigneesData[id] = { id, name, color };
    fs.writeFileSync(assigneesFile, JSON.stringify(assigneesData, null, 2));
    res.json(Object.values(assigneesData));
  }
});

app.get('/api/assignments', async (req,res) => {
  if (pool) {
    const { rows } = await pool.query('SELECT * FROM assignments');
    const result = {};
    rows.forEach(row => {
      result[row.code] = row.assignee_id;
    });
    res.json(result);
  } else {
    res.json(assignmentsData);
  }
});

app.post('/api/assignments', async (req,res) => {
  const updates = req.body;
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [code, assignee_id] of Object.entries(updates)) {
        await client.query('INSERT INTO assignments (code, assignee_id) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET assignee_id = $2', [code, assignee_id]);
      }
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'Database error' });
    } finally {
      client.release();
    }
  } else {
    assignmentsData = { ...assignmentsData, ...updates };
    fs.writeFileSync(assignmentsFile, JSON.stringify(assignmentsData, null, 2));
    res.json({ success: true });
  }
});

// Serve static build
const buildPath = path.join(__dirname, 'dist');
if (fs.existsSync(buildPath)) {
  app.use(express.static(buildPath));
  app.get('*', (req,res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
