const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/chat', async (req, res) => {
  const { messages, system } = req.body;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ERROR: No API key');
    return res.status(500).json({ error: 'API key not configured' });
  }
  try {
    console.log('Calling Anthropic...');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 1000, system, messages })
    });
    const data = await response.json();
    console.log('Response:', JSON.stringify(data).slice(0, 200));
    res.json(data);
  } catch (err) {
    console.log('ERROR:', err.message);
    res.status(500).json({ error: 'Request failed' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log('Companion running on port ' + PORT));
