// ================= CORE =================
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const ExcelJS = require('exceljs');

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// ================= SUPABASE POSTGRESQL CONNECTION =================
// Your Supabase credentials
const pool = new Pool({
  host: 'db.iyd2lrjfufiyptbsbnxg.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'pyth0n12345*1122',
  ssl: {
    rejectUnauthorized: false
  }
});

// Test connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Connected to Supabase PostgreSQL');
    console.log('📊 Server time:', res.rows[0].now);
  }
});

// ================= UTIL: SERVER TIME =================
async function getServerNow() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0]?.now;
}

// ================= UTIL: SAFE JSON =================
function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

// ================= SERVER TIME ENDPOINT =================
app.get('/api/server-time', async (req, res) => {
  try {
    const serverTime = await getServerNow();
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
    
    await pool.query(
      'INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)',
      [name, email, hash]
    );

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

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND (is_admin = false OR is_admin IS NULL)',
      [email]
    );

    if (!result.rows.length)
      return safeJson(res, 401, { error: 'Invalid credentials' });

    const user = result.rows[0];
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

// ================= ADMIN LOGIN =================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return safeJson(res, 400, { error: 'Missing fields' });

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_admin = true',
      [email]
    );

    if (!result.rows.length)
      return safeJson(res, 401, { error: 'Invalid admin credentials' });

    const admin = result.rows[0];
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
    const result = await pool.query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.created_at,
        COUNT(DISTINCT CASE WHEN a.clock_in IS NOT NULL THEN DATE(a.clock_in) END) as total_days,
        COUNT(DISTINCT CASE WHEN a.leave_type IS NOT NULL THEN DATE(a.created_at) END) as total_leaves
      FROM users u
      LEFT JOIN attendance_logs a ON u.id = a.user_id
      WHERE u.is_admin = false OR u.is_admin IS NULL
      GROUP BY u.id, u.full_name, u.email, u.created_at
      ORDER BY u.full_name
    `);

    safeJson(res, 200, { employees: result.rows });
  } catch (err) {
    console.error('Error fetching employees:', err);
    safeJson(res, 500, { error: 'Failed to fetch employees' });
  }
});

// ================= ADMIN: OVERVIEW =================
app.get('/api/admin/overview', async (req, res) => {
  try {
    const totalResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE is_admin = false OR is_admin IS NULL'
    );
    const totalEmployees = parseInt(totalResult.rows[0].count);

    const attendanceResult = await pool.query(`
      SELECT 
        u.full_name,
        a.mode,
        a.clock_in,
        a.clock_out,
        a.leave_type
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE DATE(a.created_at) = CURRENT_DATE
      ORDER BY a.clock_in DESC
    `);

    const todayAttendance = attendanceResult.rows;
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

    let query = `
      SELECT 
        a.*,
        u.full_name,
        DATE(a.clock_in) as date
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.clock_in IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (employeeId && employeeId !== 'all') {
      query += ` AND a.user_id = $${paramIndex++}`;
      params.push(employeeId);
    }

    if (dateFrom) {
      query += ` AND DATE(a.clock_in) >= $${paramIndex++}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND DATE(a.clock_in) <= $${paramIndex++}`;
      params.push(dateTo);
    }

    if (mode && mode !== 'all') {
      query += ` AND a.mode = $${paramIndex++}`;
      params.push(mode);
    }

    query += ' ORDER BY a.clock_in DESC LIMIT 500';

    const result = await pool.query(query, params);

    safeJson(res, 200, { logs: result.rows });
  } catch (err) {
    console.error('Error fetching attendance logs:', err);
    safeJson(res, 500, { error: 'Failed to fetch logs' });
  }
});

// ================= ADMIN: LEAVES =================
app.get('/api/admin/leaves', async (req, res) => {
  try {
    const { employeeId, leaveType, period } = req.query;

    let query = `
      SELECT 
        a.*,
        u.full_name
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.leave_type IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (employeeId && employeeId !== 'all') {
      query += ` AND a.user_id = $${paramIndex++}`;
      params.push(employeeId);
    }

    if (leaveType && leaveType !== 'all') {
      query += ` AND a.leave_type = $${paramIndex++}`;
      params.push(leaveType);
    }

    if (period) {
      if (period === 'today') {
        query += ' AND DATE(a.created_at) = CURRENT_DATE';
      } else if (period === 'this-week') {
        query += ' AND DATE(a.created_at) >= DATE_TRUNC(\'week\', CURRENT_DATE)';
      } else if (period === 'this-month') {
        query += ' AND DATE(a.created_at) >= DATE_TRUNC(\'month\', CURRENT_DATE)';
      }
    }

    query += ' ORDER BY a.created_at DESC LIMIT 200';

    const result = await pool.query(query, params);

    safeJson(res, 200, { leaves: result.rows });
  } catch (err) {
    console.error('Error fetching leaves:', err);
    safeJson(res, 500, { error: 'Failed to fetch leaves' });
  }
});

// ================= ADMIN: DELETE EMPLOYEE =================
app.delete('/api/admin/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Delete attendance logs first
    await pool.query('DELETE FROM attendance_logs WHERE user_id = $1', [id]);
    
    // Delete user
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);

    if (!result.rows.length) {
      return safeJson(res, 404, { error: 'Employee not found' });
    }

    safeJson(res, 200, { success: true });
  } catch (err) {
    console.error('Error deleting employee:', err);
    safeJson(res, 500, { error: 'Failed to delete employee' });
  }
});

// ================= ADMIN: EDIT EMPLOYEE =================
app.put('/api/admin/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email } = req.body;

    if (!full_name || !email) {
      return safeJson(res, 400, { error: 'Missing required fields' });
    }

    const result = await pool.query(
      'UPDATE users SET full_name = $1, email = $2 WHERE id = $3 RETURNING *',
      [full_name, email, id]
    );

    if (!result.rows.length) {
      return safeJson(res, 404, { error: 'Employee not found' });
    }

    safeJson(res, 200, { employee: result.rows[0] });
  } catch (err) {
    console.error('Error updating employee:', err);
    safeJson(res, 500, { error: 'Failed to update employee' });
  }
});

// ================= ADMIN: EXPORT ATTENDANCE =================
app.post('/api/admin/export/attendance', async (req, res) => {
  try {
    const { filters } = req.body;
    const { employeeId, dateFrom, dateTo, mode } = filters || {};

    let query = `
      SELECT 
        u.full_name,
        u.email,
        a.mode,
        a.clock_in,
        a.clock_out,
        a.location
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.clock_in IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (employeeId && employeeId !== 'all') {
      query += ` AND a.user_id = $${paramIndex++}`;
      params.push(employeeId);
    }

    if (dateFrom) {
      query += ` AND DATE(a.clock_in) >= $${paramIndex++}`;
      params.push(dateFrom);
    }

    if (dateTo) {
      query += ` AND DATE(a.clock_in) <= $${paramIndex++}`;
      params.push(dateTo);
    }

    if (mode && mode !== 'all') {
      query += ` AND a.mode = $${paramIndex++}`;
      params.push(mode);
    }

    query += ' ORDER BY a.clock_in DESC';

    const result = await pool.query(query, params);
    const logs = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Attendance');

    worksheet.columns = [
      { header: 'Employee', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Mode', key: 'mode', width: 10 },
      { header: 'Clock In', key: 'clockIn', width: 20 },
      { header: 'Clock Out', key: 'clockOut', width: 20 },
      { header: 'Location', key: 'location', width: 30 }
    ];

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF667EEA' }
    };

    logs.forEach(log => {
      let locationText = 'N/A';
      if (log.location) {
        try {
          const loc = typeof log.location === 'string' ? JSON.parse(log.location) : log.location;
          locationText = `${loc.lat}, ${loc.lng}`;
        } catch (e) {
          locationText = 'Invalid';
        }
      }

      worksheet.addRow({
        name: log.full_name,
        email: log.email,
        mode: log.mode.toUpperCase(),
        clockIn: log.clock_in ? new Date(log.clock_in).toLocaleString() : 'N/A',
        clockOut: log.clock_out ? new Date(log.clock_out).toLocaleString() : 'N/A',
        location: locationText
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
    const { filters } = req.body;
    const { employeeId, leaveType, period } = filters || {};

    let query = `
      SELECT 
        u.full_name,
        u.email,
        a.leave_type,
        a.leave_reason,
        a.created_at
      FROM attendance_logs a
      JOIN users u ON a.user_id = u.id
      WHERE a.leave_type IS NOT NULL
    `;
    const params = [];
    let paramIndex = 1;

    if (employeeId && employeeId !== 'all') {
      query += ` AND a.user_id = $${paramIndex++}`;
      params.push(employeeId);
    }

    if (leaveType && leaveType !== 'all') {
      query += ` AND a.leave_type = $${paramIndex++}`;
      params.push(leaveType);
    }

    if (period) {
      if (period === 'today') {
        query += ' AND DATE(a.created_at) = CURRENT_DATE';
      } else if (period === 'this-week') {
        query += ' AND DATE(a.created_at) >= DATE_TRUNC(\'week\', CURRENT_DATE)';
      } else if (period === 'this-month') {
        query += ' AND DATE(a.created_at) >= DATE_TRUNC(\'month\', CURRENT_DATE)';
      }
    }

    query += ' ORDER BY a.created_at DESC';

    const result = await pool.query(query, params);
    const leaves = result.rows;

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
      worksheet.addRow({
        name: leave.full_name,
        email: leave.email,
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

    const now = await getServerNow();

    const leaveCheck = await pool.query(
      `SELECT 1 FROM attendance_logs
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE
       AND leave_type IS NOT NULL`,
      [userId]
    );
    
    if (leaveCheck.rows.length)
      return safeJson(res, 400, { error: 'Leave already filed today' });

    const existingCheck = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE user_id = $1 AND DATE(clock_in) = CURRENT_DATE`,
      [userId]
    );
    
    if (existingCheck.rows.length)
      return safeJson(res, 400, { error: 'Already clocked in today' });

    const locationJson = location ? JSON.stringify(location) : null;

    const result = await pool.query(
      `INSERT INTO attendance_logs
       (user_id, mode, clock_in, photo, location)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, mode, now, photo || null, locationJson]
    );

    safeJson(res, 201, { success: true, id: result.rows[0].id });
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

    const now = await getServerNow();

    const result = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE user_id = $1
         AND clock_out IS NULL
         AND DATE(clock_in) = CURRENT_DATE`,
      [userId]
    );

    if (!result.rows.length)
      return safeJson(res, 400, { error: 'No active clock-in found' });

    await pool.query(
      'UPDATE attendance_logs SET clock_out = $1 WHERE id = $2',
      [now, result.rows[0].id]
    );

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

    const now = await getServerNow();

    const clockedInCheck = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE
       AND clock_in IS NOT NULL`,
      [userId]
    );
    
    if (clockedInCheck.rows.length)
      return safeJson(res, 400, { error: 'Cannot file leave - already clocked in today' });

    const leaveCheck = await pool.query(
      `SELECT * FROM attendance_logs
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE
       AND leave_type IS NOT NULL`,
      [userId]
    );
    
    if (leaveCheck.rows.length)
      return safeJson(res, 400, { error: 'Leave already filed for today' });

    const result = await pool.query(
      `INSERT INTO attendance_logs
       (user_id, leave_type, leave_reason, created_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [userId, leaveType, reason || null, now]
    );

    safeJson(res, 201, { success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('File leave error:', err);
    safeJson(res, 500, { error: 'Failed to file leave: ' + err.message });
  }
});

// ================= LOGS =================
app.get('/api/logs/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `SELECT
         id,
         DATE(clock_in) AS date,
         mode,
         clock_in,
         clock_out,
         photo,
         location,
         leave_type
       FROM attendance_logs
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const logs = result.rows.map(row => {
      const log = { ...row };
      
      if (row.location) {
        try {
          log.location = JSON.parse(row.location);
        } catch (e) {
          log.location = null;
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

    const result = await pool.query(
      `SELECT
         DATE(clock_in) AS date,
         clock_in,
         clock_out,
         leave_type,
         mode
       FROM attendance_logs
       WHERE user_id = $1
         AND EXTRACT(YEAR FROM created_at) = $2
         AND EXTRACT(MONTH FROM created_at) = $3`,
      [userId, year, month]
    );

    const calendar = {};
    result.rows.forEach(r => {
      let status = 'present';
      if (r.leave_type) status = `leave-${r.leave_type}`;
      else if (!r.clock_out) status = 'incomplete';

      calendar[r.date] = {
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
  console.log('🔗 Supabase Project: 00jmdc-SysEng\'s Project');
});