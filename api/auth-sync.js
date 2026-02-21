const { enableCORS } = require('./helpers');

// We need to define this here because the helper one points to /rest/v1/
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iyd2lrjfufiyptbsbnxg.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZDJscmpmdWZpeXB0YnNibnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNTQ0MTIsImV4cCI6MjA1NDczMDQxMn0.p9M7vGrLwwvXGNaXqsxHZgCwJpE3lIQnNx0F5TXLR3I';

async function verifySupabaseToken(token) {
  const url = `${SUPABASE_URL}/auth/v1/user`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Invalid token');
  }

  return await response.json();
}

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
  enableCORS(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing access token' });
    }

    // Verify token with Supabase Auth
    const user = await verifySupabaseToken(accessToken);
    const email = user.email;
    const name = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0];

    // Check if user exists in our custom table
    const users = await supabaseQuery(`users?email=eq.${email}&select=*`);

    let dbUser;

    if (!users || users.length === 0) {
      // Create new user
      const result = await supabaseQuery('users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: name,
          email: email,
          password_hash: 'SUPABASE_AUTH',
          is_admin: false
        })
      });
      dbUser = result[0];
    } else {
      dbUser = users[0];
    }

    return res.status(200).json({
      user: {
        id: dbUser.id,
        name: dbUser.full_name,
        email: dbUser.email
      }
    });

  } catch (err) {
    console.error('Auth sync error:', err);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};
