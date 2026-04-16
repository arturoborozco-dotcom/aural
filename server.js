const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      profile JSONB DEFAULT '{}',
      onboarded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      mode TEXT,
      title TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      session_id TEXT,
      user_id TEXT,
      role TEXT,
      content TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS memories (
      id SERIAL PRIMARY KEY,
      user_id TEXT,
      content TEXT,
      mode TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('DB ready');
}

app.get('/api/user/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (r.rows.length === 0) {
      await pool.query('INSERT INTO users (id) VALUES ($1)', [id]);
      r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    }
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;
    const { profile } = req.body;
    await pool.query('UPDATE users SET profile = $1, onboarded = TRUE WHERE id = $2', [JSON.stringify(profile), id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get all sessions for user grouped by mode
app.get('/api/sessions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const r = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create new session
app.post('/api/sessions', async (req, res) => {
  try {
    const { sessionId, userId, mode, title } = req.body;
    await pool.query(
      'INSERT INTO sessions (id, user_id, mode, title) VALUES ($1, $2, $3, $4)',
      [sessionId, userId, mode, title]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update session title
app.patch('/api/sessions/:id', async (req, res) => {
  try {
    const { title } = req.body;
    await pool.query('UPDATE sessions SET title = $1, updated_at = NOW() WHERE id = $2', [title, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get messages for a session
app.get('/api/messages/:sessionId', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT role, content, created_at FROM messages WHERE session_id = $1 ORDER BY created_at ASC',
      [req.params.sessionId]
    );
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Save a message
app.post('/api/messages', async (req, res) => {
  try {
    const { sessionId, userId, role, content } = req.body;
    await pool.query(
      'INSERT INTO messages (session_id, user_id, role, content) VALUES ($1, $2, $3, $4)',
      [sessionId, userId, role, content]
    );
    await pool.query('UPDATE sessions SET updated_at = NOW() WHERE id = $1', [sessionId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chat', async (req, res) => {
  const { messages, system, userId, mode, sessionId } = req.body;
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'No API key' });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages })
    });
    const data = await response.json();
    if (userId && data.content?.[0]?.text) {
      const reply = data.content[0].text;
      const lastUser = messages[messages.length - 1]?.content || '';
      await pool.query('INSERT INTO memories (user_id, content, mode) VALUES ($1, $2, $3)',
        [userId, `Usuario: ${lastUser}\nRespuesta: ${reply}`.slice(0, 1000), mode]);
      const count = await pool.query('SELECT COUNT(*) FROM memories WHERE user_id = $1', [userId]);
      if (parseInt(count.rows[0].count) % 5 === 0) {
        const profileRes = await pool.query('SELECT profile FROM users WHERE id = $1', [userId]);
        const currentProfile = profileRes.rows[0]?.profile || {};
        const recentMems = await pool.query('SELECT content FROM memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [userId]);
        const memText = recentMems.rows.map(r => r.content).join('\n---\n');
        const insightRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: `Analiza estas conversaciones y extrae insights. Perfil actual: ${JSON.stringify(currentProfile)}. Conversaciones: ${memText}. Responde SOLO JSON: {"patrones":"...","fortalezas":"...","areas_de_trabajo":"...","estilo_comunicacion":"..."}` }] })
        });
        const insightData = await insightRes.json();
        try {
          const insights = JSON.parse(insightData.content[0].text);
          await pool.query('UPDATE users SET profile = $1 WHERE id = $2', [JSON.stringify({ ...currentProfile, insights }), userId]);
        } catch(e) {}
      }
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 8080;
initDB().then(() => app.listen(PORT, '0.0.0.0', () => console.log('Companion running on port ' + PORT)));
