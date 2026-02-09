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
    const { userId, leaveType, reason } = req.body;

    if (!userId || !leaveType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const validLeaveTypes = ['sick', 'vacation', 'emergency', 'official'];
    if (!validLeaveTypes.includes(leaveType)) {
      return res.status(400).json({ error: 'Invalid leave type' });
    }

    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const clockedInCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&clock_in=gte.${today}T00:00:00&clock_in=lt.${today}T23:59:59&clock_in=not.is.null`
    );
    
    if (clockedInCheck && clockedInCheck.length > 0) {
      return res.status(400).json({ error: 'Cannot file leave - already clocked in today' });
    }

    const leaveCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&leave_type=not.is.null`
    );
    
    if (leaveCheck && leaveCheck.length > 0) {
      return res.status(400).json({ error: 'Leave already filed for today' });
    }

    const result = await supabaseQuery('attendance_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        leave_type: leaveType,
        leave_reason: reason || null,
        created_at: now.toISOString()
      })
    });

    return res.status(201).json({ success: true, id: result[0].id });
  } catch (err) {
    console.error('File leave error:', err);
    return res.status(500).json({ error: 'Failed to file leave: ' + err.message });
  }
};