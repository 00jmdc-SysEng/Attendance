// API Configuration
const API_URL = 'http://localhost:3000/api';

// Current admin session
let currentAdmin = null;
let allEmployees = [];
let allLogs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();
  initializeAdmin();
});

function checkAdminAuth() {
  const admin = localStorage.getItem('adminUser');
  if (!admin) {
    window.location.href = 'admin-login.html';
    return;
  }
  currentAdmin = JSON.parse(admin);
  document.getElementById('adminName').textContent = currentAdmin.name;
}

async function initializeAdmin() {
  await loadEmployees();
  await loadOverview();
  setupEventListeners();
  setDefaultDates();
}

function setupEventListeners() {
  // DTR Report Type Change
  document.getElementById('dtrReportType').addEventListener('change', (e) => {
    const type = e.target.value;
    document.getElementById('monthlySelector').classList.toggle('hidden', type !== 'monthly');
    document.getElementById('weeklySelector').classList.toggle('hidden', type !== 'weekly');
    document.getElementById('customSelector').classList.toggle('hidden', type !== 'custom');
  });

  // Search Employee
  document.getElementById('searchEmployee').addEventListener('input', (e) => {
    filterEmployees(e.target.value);
  });
}

function setDefaultDates() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  // Set month inputs
  const monthValue = `${year}-${month}`;
  document.getElementById('dtrMonth').value = monthValue;
  document.getElementById('leavePeriod').value = monthValue;
  document.getElementById('analyticsPeriod').value = monthValue;
  document.getElementById('leavePeriodFilter').value = monthValue;
  
  // Set date inputs
  const dateValue = `${year}-${month}-${day}`;
  document.getElementById('dtrWeekStart').value = dateValue;
  document.getElementById('timelogFrom').value = `${year}-${month}-01`;
  document.getElementById('timelogTo').value = dateValue;
  document.getElementById('attendanceDateFrom').value = `${year}-${month}-01`;
  document.getElementById('attendanceDateTo').value = dateValue;
}

// Tab Navigation
function showTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
  
  event.target.classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
  
  // Load data when tab is opened
  if (tabName === 'overview') loadOverview();
  else if (tabName === 'employees') displayEmployees();
  else if (tabName === 'attendance') loadAttendanceLogs();
  else if (tabName === 'leaves') loadLeaves();
}

// Load Employees
async function loadEmployees() {
  try {
    const response = await fetch(`${API_URL}/admin/employees`);
    const data = await response.json();
    allEmployees = data.employees || [];
    
    // Populate employee dropdowns
    populateEmployeeDropdowns();
    
    return allEmployees;
  } catch (error) {
    console.error('Error loading employees:', error);
    allEmployees = [];
  }
}

function populateEmployeeDropdowns() {
  const dropdowns = [
    'dtrEmployee', 'leaveEmployee', 'timelogEmployee',
    'attendanceEmployee', 'leaveEmployeeFilter'
  ];
  
  dropdowns.forEach(id => {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="all">All Employees</option>';
    
    allEmployees.forEach(emp => {
      const option = document.createElement('option');
      option.value = emp.id;
      option.textContent = `${emp.full_name} (${emp.email})`;
      select.appendChild(option);
    });
  });
}

// Load Overview
async function loadOverview() {
  try {
    const response = await fetch(`${API_URL}/admin/overview`);
    const data = await response.json();
    
    document.getElementById('totalEmployees').textContent = data.totalEmployees || 0;
    document.getElementById('presentToday').textContent = data.presentToday || 0;
    document.getElementById('wfhToday').textContent = data.wfhToday || 0;
    document.getElementById('onLeaveToday').textContent = data.onLeaveToday || 0;
    
    displayTodaySummary(data.todayAttendance || []);
  } catch (error) {
    console.error('Error loading overview:', error);
  }
}

function displayTodaySummary(attendance) {
  const container = document.getElementById('todaySummary');
  
  if (!attendance.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><p>No attendance records today</p></div>';
    return;
  }
  
  let html = '<table class="data-table"><thead><tr><th>Employee</th><th>Status</th><th>Clock In</th><th>Clock Out</th></tr></thead><tbody>';
  
  attendance.forEach(record => {
    const status = record.leave_type ? 
      `<span class="status-badge status-leave">Leave (${record.leave_type})</span>` :
      record.mode === 'wfh' ?
      `<span class="status-badge status-wfh">WFH</span>` :
      `<span class="status-badge status-present">Onsite</span>`;
    
    html += `
      <tr>
        <td><strong>${record.full_name}</strong></td>
        <td>${status}</td>
        <td>${record.clock_in ? formatTime(record.clock_in) : '-'}</td>
        <td>${record.clock_out ? formatTime(record.clock_out) : '<em>Not clocked out</em>'}</td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Display Employees
function displayEmployees() {
  const container = document.getElementById('employeeList');
  
  if (!allEmployees.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>No employees found</p></div>';
    return;
  }
  
  let html = '';
  allEmployees.forEach(emp => {
    html += `
      <div class="employee-card">
        <div class="employee-info">
          <h4>${emp.full_name}</h4>
          <p>📧 ${emp.email}</p>
          <p>📅 Joined: ${formatDate(emp.created_at)}</p>
        </div>
        <div class="employee-stats">
          <div class="stat-item">Total Days: <strong>${emp.total_days || 0}</strong></div>
          <div class="stat-item">Leaves: <strong>${emp.total_leaves || 0}</strong></div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function filterEmployees(searchTerm) {
  const filtered = allEmployees.filter(emp => 
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const container = document.getElementById('employeeList');
  
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><p>No employees match your search</p></div>';
    return;
  }
  
  let html = '';
  filtered.forEach(emp => {
    html += `
      <div class="employee-card">
        <div class="employee-info">
          <h4>${emp.full_name}</h4>
          <p>📧 ${emp.email}</p>
          <p>📅 Joined: ${formatDate(emp.created_at)}</p>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Load Attendance Logs
async function loadAttendanceLogs() {
  const employeeId = document.getElementById('attendanceEmployee').value;
  const dateFrom = document.getElementById('attendanceDateFrom').value;
  const dateTo = document.getElementById('attendanceDateTo').value;
  const mode = document.getElementById('attendanceMode').value;
  
  try {
    const params = new URLSearchParams({
      employeeId,
      dateFrom,
      dateTo,
      mode
    });
    
    const response = await fetch(`${API_URL}/admin/attendance-logs?${params}`);
    const data = await response.json();
    allLogs = data.logs || [];
    
    displayAttendanceLogs(allLogs);
  } catch (error) {
    console.error('Error loading attendance logs:', error);
  }
}

function displayAttendanceLogs(logs) {
  const container = document.getElementById('attendanceLogsList');
  
  if (!logs.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>No attendance logs found</p></div>';
    return;
  }
  
  let html = '<table class="data-table"><thead><tr><th>Employee</th><th>Date</th><th>Mode</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Photo</th></tr></thead><tbody>';
  
  logs.forEach(log => {
    const hours = calculateHours(log.clock_in, log.clock_out);
    const photoBtn = log.photo ? `<button onclick="showPhoto('${log.photo}')" class="btn-secondary" style="padding: 5px 10px; font-size: 12px;">📷 View</button>` : '-';
    
    html += `
      <tr>
        <td><strong>${log.full_name}</strong></td>
        <td>${formatDate(log.date || log.clock_in)}</td>
        <td><span class="status-badge status-${log.mode}">${log.mode ? log.mode.toUpperCase() : '-'}</span></td>
        <td>${log.clock_in ? formatTime(log.clock_in) : '-'}</td>
        <td>${log.clock_out ? formatTime(log.clock_out) : '<em>Ongoing</em>'}</td>
        <td>${hours}</td>
        <td>${photoBtn}</td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Load Leaves
async function loadLeaves() {
  const employeeId = document.getElementById('leaveEmployeeFilter').value;
  const leaveType = document.getElementById('leaveTypeFilter').value;
  const period = document.getElementById('leavePeriodFilter').value;
  
  try {
    const params = new URLSearchParams({
      employeeId,
      leaveType,
      period
    });
    
    const response = await fetch(`${API_URL}/admin/leaves?${params}`);
    const data = await response.json();
    
    displayLeaves(data.leaves || []);
  } catch (error) {
    console.error('Error loading leaves:', error);
  }
}

function displayLeaves(leaves) {
  const container = document.getElementById('leavesList');
  
  if (!leaves.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🏖️</div><p>No leave records found</p></div>';
    return;
  }
  
  let html = '<table class="data-table"><thead><tr><th>Employee</th><th>Date</th><th>Leave Type</th><th>Reason</th></tr></thead><tbody>';
  
  leaves.forEach(leave => {
    html += `
      <tr>
        <td><strong>${leave.full_name}</strong></td>
        <td>${formatDate(leave.created_at)}</td>
        <td><span class="status-badge status-leave">${leave.leave_type}</span></td>
        <td>${leave.leave_reason || '<em>No reason provided</em>'}</td>
      </tr>
    `;
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

// Generate DTR Report
async function generateDTR() {
  const reportType = document.getElementById('dtrReportType').value;
  const employeeId = document.getElementById('dtrEmployee').value;
  
  let dateFrom, dateTo;
  
  if (reportType === 'monthly') {
    const month = document.getElementById('dtrMonth').value;
    if (!month) {
      alert('Please select a month');
      return;
    }
    const [year, monthNum] = month.split('-');
    dateFrom = `${year}-${monthNum}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    dateTo = `${year}-${monthNum}-${lastDay}`;
  } else if (reportType === 'weekly') {
    const weekStart = document.getElementById('dtrWeekStart').value;
    if (!weekStart) {
      alert('Please select week start date');
      return;
    }
    dateFrom = weekStart;
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    dateTo = endDate.toISOString().split('T')[0];
  } else {
    dateFrom = document.getElementById('dtrDateFrom').value;
    dateTo = document.getElementById('dtrDateTo').value;
    if (!dateFrom || !dateTo) {
      alert('Please select date range');
      return;
    }
  }
  
  try {
    const params = new URLSearchParams({
      employeeId,
      dateFrom,
      dateTo,
      reportType
    });
    
    const response = await fetch(`${API_URL}/admin/generate-dtr?${params}`);
    const blob = await response.blob();
    
    // Download file
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DTR_Report_${dateFrom}_to_${dateTo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('DTR report generated successfully!');
  } catch (error) {
    console.error('Error generating DTR:', error);
    alert('Failed to generate DTR report');
  }
}

// Generate Leave Report
async function generateLeaveReport() {
  const period = document.getElementById('leavePeriod').value;
  const employeeId = document.getElementById('leaveEmployee').value;
  
  if (!period) {
    alert('Please select a period');
    return;
  }
  
  try {
    const params = new URLSearchParams({ period, employeeId });
    const response = await fetch(`${API_URL}/admin/generate-leave-report?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leave_Report_${period}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('Leave report generated successfully!');
  } catch (error) {
    console.error('Error generating leave report:', error);
    alert('Failed to generate leave report');
  }
}

// Generate Time Log
async function generateTimeLog() {
  const dateFrom = document.getElementById('timelogFrom').value;
  const dateTo = document.getElementById('timelogTo').value;
  const employeeId = document.getElementById('timelogEmployee').value;
  
  if (!dateFrom || !dateTo) {
    alert('Please select date range');
    return;
  }
  
  try {
    const params = new URLSearchParams({ dateFrom, dateTo, employeeId });
    const response = await fetch(`${API_URL}/admin/generate-timelog?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Time_Log_${dateFrom}_to_${dateTo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('Time log report generated successfully!');
  } catch (error) {
    console.error('Error generating time log:', error);
    alert('Failed to generate time log report');
  }
}

// Generate Analytics
async function generateAnalytics() {
  const period = document.getElementById('analyticsPeriod').value;
  
  if (!period) {
    alert('Please select a period');
    return;
  }
  
  try {
    const params = new URLSearchParams({ period });
    const response = await fetch(`${API_URL}/admin/generate-analytics?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Analytics_Report_${period}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    alert('Analytics report generated successfully!');
  } catch (error) {
    console.error('Error generating analytics:', error);
    alert('Failed to generate analytics report');
  }
}

// Export Functions
async function exportAttendanceLogs() {
  if (!allLogs.length) {
    alert('No data to export');
    return;
  }
  
  const employeeId = document.getElementById('attendanceEmployee').value;
  const dateFrom = document.getElementById('attendanceDateFrom').value;
  const dateTo = document.getElementById('attendanceDateTo').value;
  const mode = document.getElementById('attendanceMode').value;
  
  try {
    const params = new URLSearchParams({ employeeId, dateFrom, dateTo, mode });
    const response = await fetch(`${API_URL}/admin/export-attendance?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Attendance_Logs_${dateFrom}_to_${dateTo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Error exporting attendance:', error);
    alert('Failed to export attendance logs');
  }
}

async function exportLeaves() {
  const employeeId = document.getElementById('leaveEmployeeFilter').value;
  const leaveType = document.getElementById('leaveTypeFilter').value;
  const period = document.getElementById('leavePeriodFilter').value;
  
  try {
    const params = new URLSearchParams({ employeeId, leaveType, period });
    const response = await fetch(`${API_URL}/admin/export-leaves?${params}`);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Leave_Records_${period}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    console.error('Error exporting leaves:', error);
    alert('Failed to export leave records');
  }
}

// Utility Functions
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function calculateHours(clockIn, clockOut) {
  if (!clockIn || !clockOut) return '-';
  const start = new Date(clockIn);
  const end = new Date(clockOut);
  const hours = (end - start) / (1000 * 60 * 60);
  return `${hours.toFixed(2)}h`;
}

function showPhoto(photoData) {
  const modal = document.createElement('div');
  modal.className = 'photo-modal';
  modal.innerHTML = `<img src="${photoData}" alt="Attendance Photo">`;
  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
}

function logout() {
  localStorage.removeItem('adminUser');
  window.location.href = 'admin-login.html';
}