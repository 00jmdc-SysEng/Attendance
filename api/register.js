const bcrypt = require('bcryptjs');

// Inline the helpers to avoid import issues
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iyd2lrjfufiyptbsbnxg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZDJscmpmdWZpeXB0YnNibnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNTQ0MTIsImV4cCI6MjA1NDczMDQxMn0.p9M7vGrLwwvXGNaXqsxHZgCwJpE3lIQnNx0F5TXLR3I';

async function supabaseQuery(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Supabase API error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const hash = await bcrypt.hash(password, 10);
    
    await supabaseQuery('users', {
      method: 'POST',
      body: JSON.stringify({
        full_name: name,
        email: email,
        password_hash: hash,
        is_admin: false
      })
    });

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(400).json({ error: 'Email already exists or registration failed' });
  }
};