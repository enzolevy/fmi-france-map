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

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
const assignmentsFile = path.join(DATA_DIR, 'assignments.json');
const assigneesFile = path.join(DATA_DIR, 'assignees.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, filePath);
}

let assignmentsData = {};
let assigneesData = {};

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
  ensureDir(DATA_DIR);
  if (!fs.existsSync(assignmentsFile)) {
    writeJsonAtomic(assignmentsFile, {});
  }
  if (!fs.existsSync(assigneesFile)) {
    writeJsonAtomic(assigneesFile, {}); // store as map { [id]: assignee }
  }
  assignmentsData = JSON.parse(fs.readFileSync(assignmentsFile));
  assigneesData = JSON.parse(fs.readFileSync(assigneesFile));
  if (Array.isArray(assigneesData)) {
    const byId = {};
    for (const item of assigneesData) {
      if (item && item.id) byId[String(item.id)] = item;
    }
    assigneesData = byId;
    writeJsonAtomic(assigneesFile, assigneesData);
  }
}

function isValidHexColor(input) {
  return typeof input === 'string' && /^#[0-9A-Fa-f]{6}$/.test(input);
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
  const { id: maybeId, name, color, _delete } = req.body || {};

  // Fallback: allow delete via POST if DELETE is blocked by proxy/hosting
  if (_delete && maybeId) {
    const id = String(maybeId);
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE assignments SET assignee_id = NULL WHERE assignee_id = $1', [id]);
        await client.query('DELETE FROM assignees WHERE id = $1', [id]);
        await client.query('COMMIT');
        return res.json({ success: true });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        return res.status(500).json({ error: 'Database error' });
      } finally {
        client.release();
      }
    } else {
      if (!assigneesData[id]) {
        return res.status(404).json({ error: 'Assignee not found' });
      }
      delete assigneesData[id];
      for (const [code, aid] of Object.entries(assignmentsData)) {
        if (aid === id) delete assignmentsData[code];
      }
      writeJsonAtomic(assigneesFile, assigneesData);
      writeJsonAtomic(assignmentsFile, assignmentsData);
      return res.json({ success: true });
    }
  }

  if (!name || !color) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const id = maybeId || `ca_${Date.now()}`;
  if (pool) {
    await pool.query(
      'INSERT INTO assignees (id,name,color) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color',
      [id, name, color]
    );
    const { rows } = await pool.query('SELECT * FROM assignees WHERE id = $1', [id]);
    return res.json(rows[0]);
  } else {
    assigneesData[id] = { id, name, color };
    writeJsonAtomic(assigneesFile, assigneesData);
    return res.json(assigneesData[id]);
  }
});

app.patch('/api/assignees/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const { name, color } = req.body || {};

  // Require at least one field to update
  if (typeof name === 'undefined' && typeof color === 'undefined') {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  // Validate inputs if provided
  if (typeof name !== 'undefined') {
    const trimmed = String(name).trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: 'Invalid name' });
    }
  }
  if (typeof color !== 'undefined') {
    if (!isValidHexColor(String(color))) {
      return res.status(400).json({ error: 'Invalid color format. Expected #RRGGBB' });
    }
  }

  if (pool) {
    try {
      // Use COALESCE to keep existing values when a field is not provided
      const { rows } = await pool.query(
        'UPDATE assignees SET name = COALESCE($1, name), color = COALESCE($2, color) WHERE id = $3 RETURNING *',
        [typeof name === 'undefined' ? null : String(name), typeof color === 'undefined' ? null : String(color), String(id)]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Assignee not found' });
      }
      return res.json(rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    }
  } else {
    // File mode
    const existing = assigneesData[String(id)];
    if (!existing) {
      return res.status(404).json({ error: 'Assignee not found' });
    }
    if (typeof name !== 'undefined') existing.name = String(name).trim();
    if (typeof color !== 'undefined') existing.color = String(color);

    assigneesData[String(id)] = existing;
    try {
      writeJsonAtomic(assigneesFile, assigneesData);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'File write error' });
    }
    return res.json(existing);
  }
});

app.delete('/api/assignees/:id', async (req,res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE assignments SET assignee_id = NULL WHERE assignee_id = $1', [id]);
      await client.query('DELETE FROM assignees WHERE id = $1', [id]);
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      client.release();
    }
  } else {
    // file mode
    delete assigneesData[id];
    for (const [code, aid] of Object.entries(assignmentsData)) {
      if (aid === id) delete assignmentsData[code];
    }
    writeJsonAtomic(assigneesFile, assigneesData);
    writeJsonAtomic(assignmentsFile, assignmentsData);
    return res.json({ success: true });
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
  const payload = req.body || {};
  const updates = payload.assignments ? payload.assignments : payload; // accept both shapes
  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [code, assignee_id] of Object.entries(updates)) {
        if (assignee_id === null || typeof assignee_id === 'undefined') {
          await client.query('DELETE FROM assignments WHERE code = $1', [code]);
        } else {
          await client.query(
            'INSERT INTO assignments (code, assignee_id) VALUES ($1,$2) ON CONFLICT (code) DO UPDATE SET assignee_id = $2',
            [code, assignee_id]
          );
        }
      }
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ error: 'Database error' });
    } finally {
      client.release();
    }
  } else {
    for (const [code, assignee_id] of Object.entries(updates)) {
      if (assignee_id === null || typeof assignee_id === 'undefined') {
        delete assignmentsData[code];
      } else {
        assignmentsData[code] = assignee_id;
      }
    }
    writeJsonAtomic(assignmentsFile, assignmentsData);
    return res.json({ success: true });
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
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Assignees file: ${assigneesFile}`);
  console.log(`Assignments file: ${assignmentsFile}`);
});
