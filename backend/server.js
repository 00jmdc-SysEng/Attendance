// ================= CORE =================
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const ExcelJS = require('exceljs');

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// ================= SUPABASE REST API CONFIGURATION =================
// This uses Supabase's REST API instead of direct PostgreSQL connection
// ✅ Works on ALL networks (no DNS/firewall issues)
// ✅ Works on IPv4 AND IPv6
// ✅ Perfect for Vercel deployment
// ✅ More secure (no direct database access)

const SUPABASE_URL = 'https://iyd2lrjfufiyptbsbnxg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZDJscmpmdWZpeXB0YnNibnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNTQ0MTIsImV4cCI6MjA1NDczMDQxMn0.p9M7vGrLwwvXGNaXqsxHZgCwJpE3lIQnNx0F5TXLR3I';

// Helper function to make Supabase REST API calls
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

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

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

// Test connection on startup
(async () => {
  try {
    // Test by fetching server time from Supabase
    const result = await supabaseQuery('rpc/get_server_time', {
      method: 'POST'
    });
    console.log('✅ Connected to Supabase via REST API');
    console.log('📊 Server time:', new Date().toISOString());
  } catch (err) {
    console.log('⚠️  Note: Database connection will be tested on first request');
  }
})();

// ================= UTIL: SERVER TIME =================
function getServerNow() {
  // Use JavaScript time since we don't have direct DB access
  return new Date();
}

// ================= UTIL: SAFE JSON =================
function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

// ================= SERVER TIME ENDPOINT =================
app.get('/api/server-time', (req, res) => {
  try {
    const serverTime = getServerNow(); // Returns Date object immediately
    safeJson(res, 200, { serverTime: serverTime.toISOString() });
  } catch (err) {
    console.error('Server time error:', err);
    safeJson(res, 500, { error: 'Failed to get server time' });
  }
});

// ================= EMPLOYEE REGISTER =================
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return safeJson(res, 400, { error: 'Missing fields' });

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

    safeJson(res, 201, { success: true });
  } catch (err) {
    console.error('Register error:', err);
    safeJson(res, 400, { error: 'Email already exists' });
  }
});

// ================= EMPLOYEE LOGIN =================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return safeJson(res, 400, { error: 'Missing fields' });

    const users = await supabaseQuery(`users?email=eq.${email}&is_admin=eq.false&select=*`);

    if (!users || users.length === 0)
      return safeJson(res, 401, { error: 'Invalid credentials' });

    const user = users[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return safeJson(res, 401, { error: 'Invalid credentials' });

    safeJson(res, 200, {
      user: { id: user.id, name: user.full_name }
    });
  } catch (err) {
    console.error('Login error:', err);
    safeJson(res, 500, { error: 'Login failed' });
  }
});

// ================= AUTH SYNC =================
app.post('/api/auth/sync', async (req, res) => {
  try {
    const { accessToken } = req.body;
    if (!accessToken)
      return safeJson(res, 400, { error: 'Missing access token' });

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

    safeJson(res, 200, {
      user: {
        id: dbUser.id,
        name: dbUser.full_name,
        email: dbUser.email
      }
    });
  } catch (err) {
    console.error('Auth sync error:', err);
    safeJson(res, 401, { error: 'Authentication failed' });
  }
});

// ================= ADMIN LOGIN =================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return safeJson(res, 400, { error: 'Missing fields' });

    const admins = await supabaseQuery(`users?email=eq.${email}&is_admin=eq.true&select=*`);

    if (!admins || admins.length === 0)
      return safeJson(res, 401, { error: 'Invalid admin credentials' });

    const admin = admins[0];
    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok)
      return safeJson(res, 401, { error: 'Invalid admin credentials' });

    safeJson(res, 200, {
      admin: { id: admin.id, name: admin.full_name, email: admin.email }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    safeJson(res, 500, { error: 'Login failed' });
  }
});

// ================= ADMIN: GET EMPLOYEES =================
app.get('/api/admin/employees', async (req, res) => {
  try {
    // Get all non-admin users
    const users = await supabaseQuery('users?is_admin=eq.false&select=id,full_name,email,created_at&order=full_name');
    
    // Get attendance counts for each user
    const employeesWithStats = await Promise.all(users.map(async (user) => {
      const attendance = await supabaseQuery(`attendance_logs?user_id=eq.${user.id}&select=clock_in,leave_type,created_at`);
      
      const totalDays = new Set(
        attendance
          .filter(a => a.clock_in)
          .map(a => a.clock_in.split('T')[0])
      ).size;
      
      const totalLeaves = new Set(
        attendance
          .filter(a => a.leave_type)
          .map(a => a.created_at.split('T')[0])
      ).size;
      
      return {
        ...user,
        total_days: totalDays,
        total_leaves: totalLeaves
      };
    }));

    safeJson(res, 200, { employees: employeesWithStats });
  } catch (err) {
    console.error('Error fetching employees:', err);
    safeJson(res, 500, { error: 'Failed to fetch employees' });
  }
});

// ================= ADMIN: OVERVIEW =================
app.get('/api/admin/overview', async (req, res) => {
  try {
    const users = await supabaseQuery('users?is_admin=eq.false&select=id');
    const totalEmployees = users.length;

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's attendance
    const attendance = await supabaseQuery(
      `attendance_logs?created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&select=user_id,mode,clock_in,clock_out,leave_type`
    );
    
    // Get user names
    const userIds = [...new Set(attendance.map(a => a.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0].full_name;
      }
    });
    
    const todayAttendance = attendance.map(a => ({
      ...a,
      full_name: userMap[a.user_id] || 'Unknown'
    }));

    const presentToday = todayAttendance.filter(a => a.mode === 'onsite' && !a.leave_type).length;
    const wfhToday = todayAttendance.filter(a => a.mode === 'wfh' && !a.leave_type).length;
    const onLeaveToday = todayAttendance.filter(a => a.leave_type).length;

    safeJson(res, 200, {
      totalEmployees,
      presentToday,
      wfhToday,
      onLeaveToday,
      todayAttendance
    });
  } catch (err) {
    console.error('Error fetching overview:', err);
    safeJson(res, 500, { error: 'Failed to fetch overview' });
  }
});

// ================= ADMIN: ATTENDANCE LOGS =================
app.get('/api/admin/attendance-logs', async (req, res) => {
  try {
    const { employeeId, dateFrom, dateTo, mode } = req.query;

    let query = 'attendance_logs?clock_in=not.is.null';
    
    if (employeeId && employeeId !== 'all') {
      query += `&user_id=eq.${employeeId}`;
    }
    
    if (dateFrom) {
      query += `&clock_in=gte.${dateFrom}T00:00:00`;
    }
    
    if (dateTo) {
      query += `&clock_in=lte.${dateTo}T23:59:59`;
    }
    
    if (mode && mode !== 'all') {
      query += `&mode=eq.${mode}`;
    }
    
    query += '&order=clock_in.desc&limit=500&select=*';
    
    const logs = await supabaseQuery(query);
    
    // Get user names
    const userIds = [...new Set(logs.map(l => l.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0].full_name;
      }
    });
    
    const logsWithNames = logs.map(log => ({
      ...log,
      full_name: userMap[log.user_id] || 'Unknown',
      date: log.clock_in ? log.clock_in.split('T')[0] : null
    }));

    safeJson(res, 200, { logs: logsWithNames });
  } catch (err) {
    console.error('Error fetching attendance logs:', err);
    safeJson(res, 500, { error: 'Failed to fetch logs' });
  }
});

// ================= ADMIN: LEAVES =================
app.get('/api/admin/leaves', async (req, res) => {
  try {
    const { employeeId, leaveType, period } = req.query;

    let query = 'attendance_logs?leave_type=not.is.null';
    
    if (employeeId && employeeId !== 'all') {
      query += `&user_id=eq.${employeeId}`;
    }
    
    if (leaveType && leaveType !== 'all') {
      query += `&leave_type=eq.${leaveType}`;
    }
    
    if (period) {
      const [year, month] = period.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query += `&created_at=gte.${startDate}T00:00:00&created_at=lte.${endDate}T23:59:59`;
    }
    
    query += '&order=created_at.desc&limit=500&select=*';
    
    const leaves = await supabaseQuery(query);
    
    // Get user names
    const userIds = [...new Set(leaves.map(l => l.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0].full_name;
      }
    });
    
    const leavesWithNames = leaves.map(leave => ({
      ...leave,
      full_name: userMap[leave.user_id] || 'Unknown'
    }));

    safeJson(res, 200, { leaves: leavesWithNames });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    safeJson(res, 500, { error: 'Failed to fetch leaves' });
  }
});

// ================= ADMIN: DTR REPORT =================
app.post('/api/admin/reports/dtr', async (req, res) => {
  try {
    const { employeeId, dateFrom, dateTo } = req.body;

    let query = 'attendance_logs?clock_in=not.is.null';
    
    if (employeeId && employeeId !== 'all') {
      query += `&user_id=eq.${employeeId}`;
    }
    
    if (dateFrom) {
      query += `&clock_in=gte.${dateFrom}T00:00:00`;
    }
    
    if (dateTo) {
      query += `&clock_in=lte.${dateTo}T23:59:59`;
    }
    
    query += '&order=clock_in.asc&select=*';
    
    const logs = await supabaseQuery(query);
    
    // Get user names and emails
    const userIds = [...new Set(logs.map(l => l.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name,email`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0];
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('DTR');

    worksheet.columns = [
      { header: 'Employee', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Mode', key: 'mode', width: 10 },
      { header: 'Clock In', key: 'clockIn', width: 20 },
      { header: 'Clock Out', key: 'clockOut', width: 20 },
      { header: 'Hours', key: 'hours', width: 10 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667EEA' }
    };

    logs.forEach(log => {
      const user = userMap[log.user_id] || { full_name: 'Unknown', email: '' };
      const clockIn = log.clock_in ? new Date(log.clock_in) : null;
      const clockOut = log.clock_out ? new Date(log.clock_out) : null;
      
      let hours = 0;
      if (clockIn && clockOut) {
        hours = ((clockOut - clockIn) / (1000 * 60 * 60)).toFixed(2);
      }

      worksheet.addRow({
        name: user.full_name,
        email: user.email,
        date: clockIn ? clockIn.toLocaleDateString() : '',
        mode: log.mode || '',
        clockIn: clockIn ? clockIn.toLocaleTimeString() : '',
        clockOut: clockOut ? clockOut.toLocaleTimeString() : '',
        hours: hours || ''
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=DTR_Report.xlsx');
    res.send(buffer);

  } catch (err) {
    console.error('Error generating DTR:', err);
    safeJson(res, 500, { error: 'Failed to generate report' });
  }
});

// ================= ADMIN: EXPORT ATTENDANCE LOGS =================
app.post('/api/admin/export/attendance', async (req, res) => {
  try {
    const { employeeId, dateFrom, dateTo, mode } = req.body;

    let query = 'attendance_logs?clock_in=not.is.null';
    
    if (employeeId && employeeId !== 'all') {
      query += `&user_id=eq.${employeeId}`;
    }
    
    if (dateFrom) {
      query += `&clock_in=gte.${dateFrom}T00:00:00`;
    }
    
    if (dateTo) {
      query += `&clock_in=lte.${dateTo}T23:59:59`;
    }
    
    if (mode && mode !== 'all') {
      query += `&mode=eq.${mode}`;
    }
    
    query += '&order=clock_in.desc&select=*';
    
    const logs = await supabaseQuery(query);
    
    // Get user data
    const userIds = [...new Set(logs.map(l => l.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name,email`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0];
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance Logs');

    worksheet.columns = [
      { header: 'Employee', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Mode', key: 'mode', width: 10 },
      { header: 'Clock In', key: 'clockIn', width: 20 },
      { header: 'Clock Out', key: 'clockOut', width: 20 },
      { header: 'Location', key: 'location', width: 30 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF764BA2' }
    };

    logs.forEach(log => {
      const user = userMap[log.user_id] || { full_name: 'Unknown', email: '' };
      const clockIn = log.clock_in ? new Date(log.clock_in) : null;
      const clockOut = log.clock_out ? new Date(log.clock_out) : null;

      worksheet.addRow({
        name: user.full_name,
        email: user.email,
        date: clockIn ? clockIn.toLocaleDateString() : '',
        mode: log.mode || '',
        clockIn: clockIn ? clockIn.toLocaleString() : '',
        clockOut: clockOut ? clockOut.toLocaleString() : 'Not clocked out',
        location: log.location || 'N/A'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Attendance_Export.xlsx');
    res.send(buffer);

  } catch (err) {
    console.error('Error exporting attendance:', err);
    safeJson(res, 500, { error: 'Failed to export' });
  }
});

// ================= ADMIN: EXPORT LEAVES =================
app.post('/api/admin/export/leaves', async (req, res) => {
  try {
    const { employeeId, leaveType, period } = req.body;

    let query = 'attendance_logs?leave_type=not.is.null';
    
    if (employeeId && employeeId !== 'all') {
      query += `&user_id=eq.${employeeId}`;
    }
    
    if (leaveType && leaveType !== 'all') {
      query += `&leave_type=eq.${leaveType}`;
    }
    
    if (period) {
      const [year, month] = period.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      query += `&created_at=gte.${startDate}T00:00:00&created_at=lte.${endDate}T23:59:59`;
    }
    
    query += '&order=created_at.desc&select=*';
    
    const leaves = await supabaseQuery(query);
    
    // Get user data
    const userIds = [...new Set(leaves.map(l => l.user_id))];
    const usersData = await Promise.all(
      userIds.map(id => supabaseQuery(`users?id=eq.${id}&select=id,full_name,email`))
    );
    
    const userMap = {};
    usersData.forEach(userData => {
      if (userData && userData[0]) {
        userMap[userData[0].id] = userData[0];
      }
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Leaves');

    worksheet.columns = [
      { header: 'Employee', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Leave Type', key: 'type', width: 15 },
      { header: 'Reason', key: 'reason', width: 40 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF764BA2' }
    };

    leaves.forEach(leave => {
      const user = userMap[leave.user_id] || { full_name: 'Unknown', email: '' };
      
      worksheet.addRow({
        name: user.full_name,
        email: user.email,
        date: new Date(leave.created_at).toLocaleDateString(),
        type: leave.leave_type,
        reason: leave.leave_reason || 'Not specified'
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=Leave_Export.xlsx');
    res.send(buffer);

  } catch (err) {
    console.error('Error exporting leaves:', err);
    safeJson(res, 500, { error: 'Failed to export' });
  }
});

// ================= CLOCK IN =================
app.post('/api/clock-in', async (req, res) => {
  try {
    const { userId, mode, photo, location } = req.body;

    if (!userId || !mode)
      return safeJson(res, 400, { error: 'Missing fields' });

    const now = getServerNow();
    const today = now.toISOString().split('T')[0];

    // Check if leave filed today
    const leaveCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&leave_type=not.is.null`
    );
    
    if (leaveCheck && leaveCheck.length > 0)
      return safeJson(res, 400, { error: 'Leave already filed today' });

    // Check if already clocked in today
    const existingCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&clock_in=gte.${today}T00:00:00&clock_in=lt.${today}T23:59:59`
    );
    
    if (existingCheck && existingCheck.length > 0)
      return safeJson(res, 400, { error: 'Already clocked in today' });

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

    safeJson(res, 201, { success: true, id: newRecord[0].id });
  } catch (err) {
    console.error('Clock-in error:', err);
    safeJson(res, 500, { error: 'Clock-in failed: ' + err.message });
  }
});

// ================= CLOCK OUT =================
app.post('/api/clock-out', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId)
      return safeJson(res, 400, { error: 'Missing userId' });

    const now = getServerNow();
    const today = now.toISOString().split('T')[0];

    // Find active clock-in
    const result = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&clock_out=is.null&clock_in=gte.${today}T00:00:00&clock_in=lt.${today}T23:59:59`
    );

    if (!result || result.length === 0)
      return safeJson(res, 400, { error: 'No active clock-in found' });

    await supabaseQuery(`attendance_logs?id=eq.${result[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        clock_out: now.toISOString()
      })
    });

    safeJson(res, 200, { success: true });
  } catch (err) {
    console.error('Clock-out error:', err);
    safeJson(res, 500, { error: 'Clock-out failed' });
  }
});

// ================= FILE LEAVE =================
app.post('/api/file-leave', async (req, res) => {
  try {
    const { userId, leaveType, reason } = req.body;

    if (!userId || !leaveType)
      return safeJson(res, 400, { error: 'Missing required fields' });

    const validLeaveTypes = ['sick', 'vacation', 'emergency', 'official'];
    if (!validLeaveTypes.includes(leaveType))
      return safeJson(res, 400, { error: 'Invalid leave type' });

    const now = getServerNow();
    const today = now.toISOString().split('T')[0];

    // Check if clocked in today
    const clockedInCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&clock_in=gte.${today}T00:00:00&clock_in=lt.${today}T23:59:59&clock_in=not.is.null`
    );
    
    if (clockedInCheck && clockedInCheck.length > 0)
      return safeJson(res, 400, { error: 'Cannot file leave - already clocked in today' });

    // Check if leave already filed
    const leaveCheck = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&created_at=gte.${today}T00:00:00&created_at=lt.${today}T23:59:59&leave_type=not.is.null`
    );
    
    if (leaveCheck && leaveCheck.length > 0)
      return safeJson(res, 400, { error: 'Leave already filed for today' });

    const result = await supabaseQuery('attendance_logs', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        leave_type: leaveType,
        leave_reason: reason || null,
        created_at: now.toISOString()
      })
    });

    safeJson(res, 201, { success: true, id: result[0].id });
  } catch (err) {
    console.error('File leave error:', err);
    safeJson(res, 500, { error: 'Failed to file leave: ' + err.message });
  }
});

// ================= LOGS =================
app.get('/api/logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&order=created_at.desc&select=*`
    );

    const logs = result.map(row => {
      const log = { ...row };
      
      // Add date field
      if (row.clock_in) {
        log.date = row.clock_in.split('T')[0];
      }
      
      // Parse location if it's a string
      if (row.location && typeof row.location === 'string') {
        try {
          log.location = JSON.parse(row.location);
        } catch (e) {
          // Already an object or null
        }
      }
      
      return log;
    });

    safeJson(res, 200, { logs });
  } catch (err) {
    console.error('Error fetching logs:', err);
    safeJson(res, 500, { error: 'Failed to fetch logs' });
  }
});

// ================= CALENDAR =================
app.get('/api/calendar/:userId/:year/:month', async (req, res) => {
  try {
    const { userId, year, month } = req.params;

    // Calculate date range
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const result = await supabaseQuery(
      `attendance_logs?user_id=eq.${userId}&created_at=gte.${startDate}T00:00:00&created_at=lte.${endDate}T23:59:59&select=*`
    );

    const calendar = {};
    result.forEach(r => {
      const date = r.clock_in ? r.clock_in.split('T')[0] : r.created_at.split('T')[0];
      
      let status = 'present';
      if (r.leave_type) status = `leave-${r.leave_type}`;
      else if (!r.clock_out && r.clock_in) status = 'incomplete';

      calendar[date] = {
        status,
        mode: r.mode,
        clock_in: r.clock_in,
        clock_out: r.clock_out
      };
    });

    res.json({ calendar });
  } catch (err) {
    console.error('Calendar error:', err);
    safeJson(res, 500, { error: 'Failed to fetch calendar' });
  }
});

// ================= ERROR HANDLERS =================
app.use((err, req, res, next) => {
  console.error('ERROR:', err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ================= START SERVER =================
app.listen(3000, () => {
  console.log('✅ Backend running on http://localhost:3000');
  console.log('📊 Admin endpoints: /api/admin/*');
  console.log('👤 Employee endpoints: /api/*');
  console.log('🌐 Using Supabase REST API (works on ALL networks!)');
  console.log('🚀 Vercel deployment ready!');
});