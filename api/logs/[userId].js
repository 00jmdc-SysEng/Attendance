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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    const result = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&order=created_at.desc&select=*`
    );

    const logs = result.map(row => {
      const log = { ...row };
      
      if (row.clock_in) {
        log.date = row.clock_in.split('T')[0];
      }
      
      if (row.location && typeof row.location === 'string') {
        try {
          log.location = JSON.parse(row.location);
        } catch (e) {
          // Already an object or null
        }
      }
      
      return log;
    });

    return res.status(200).json({ logs });
  } catch (err) {
    console.error('Error fetching logs:', err);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
};