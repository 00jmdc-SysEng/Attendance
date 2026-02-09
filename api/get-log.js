const SUPABASE_URL = 'https://iyd2lrjfufiyptbsbnxg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZDJscmpmdWZpeXB0YnNibnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNTQ0MTIsImV4cCI6MjA1NDczMDQxMn0.p9M7vGrLwwvXGNaXqsxHZgCwJpE3lIQnNx0F5TXLR3I';

async function supabaseQuery(endpoint) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };

  console.log('[SUPABASE] Fetching:', url);
  
  const response = await fetch(url, { headers });

  if (!response.ok) {
    const error = await response.text();
    console.error('[SUPABASE] Error:', error);
    throw new Error(`Supabase API error: ${response.status} - ${error}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Extract userId from query parameter (Vercel rewrite passes it this way)
    let userId = req.query.userId;
    
    console.log('[GET-LOG] Request details:', {
      url: req.url,
      query: req.query,
      userId: userId
    });

    if (!userId) {
      console.error('[GET-LOG] No userId provided');
      return res.status(400).json({ 
        error: 'Missing userId parameter',
        hint: 'Expected: /api/logs/123 or ?userId=123'
      });
    }

    // Fetch logs from Supabase
    console.log('[GET-LOG] Fetching logs for user:', userId);
    
    const data = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&order=created_at.desc&limit=100`
    );

    console.log('[GET-LOG] Retrieved', data?.length || 0, 'logs');

    // Format the response
    const logs = (data || []).map(row => {
      const log = {
        id: row.id,
        user_id: row.user_id,
        mode: row.mode,
        clock_in: row.clock_in,
        clock_out: row.clock_out,
        photo: row.photo,
        location: row.location,
        leave_type: row.leave_type,
        leave_reason: row.leave_reason,
        created_at: row.created_at,
        date: row.clock_in || row.created_at
      };
      
      // Parse location if it's a JSON string
      if (row.location && typeof row.location === 'string') {
        try {
          log.location = JSON.parse(row.location);
        } catch (e) {
          // Keep as is
        }
      }
      
      return log;
    });

    console.log('[GET-LOG] Sending response with', logs.length, 'logs');
    
    return res.status(200).json({ logs });

  } catch (error) {
    console.error('[GET-LOG] Error:', error.message);
    console.error('[GET-LOG] Stack:', error.stack);
    
    return res.status(500).json({ 
      error: 'Failed to fetch logs',
      message: error.message
    });
  }
};