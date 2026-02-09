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
    const { userId, mode, photo, location } = req.body;

    if (!userId || !mode) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Check if leave filed today
    const leaveCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&leave_type=not.is.null`
    );
    
    if (leaveCheck && leaveCheck.length > 0) {
      return res.status(400).json({ error: 'Leave already filed today' });
    }

    // Check if already clocked in today
    const existingCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&clock_in=gte.${today}T00:00:00&clock_in=lt.${today}T23:59:59`
    );
    
    if (existingCheck && existingCheck.length > 0) {
      return res.status(400).json({ error: 'Already clocked in today' });
    }

    const newRecord = await supabaseQuery('attendance_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        mode: mode,
        clock_in: now.toISOString(),
        photo: photo || null,
        location: location || null,
        created_at: now.toISOString()
      })
    });

    return res.status(201).json({ success: true, id: newRecord[0].id });
  } catch (err) {
    console.error('Clock-in error:', err);
    return res.status(500).json({ error: 'Clock-in failed: ' + err.message });
  }
};