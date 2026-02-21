// Client-side JavaScript for Attendance System
// This file runs in the browser and communicates with your backend

// API Configuration - Update this to your deployed backend URL
const API_BASE = window.location.origin; // Uses same domain as frontend

// ============ SUPABASE CONFIG ============
const SUPABASE_URL = 'https://iyd2lrjfufiyptbsbnxg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5ZDJscmpmdWZpeXB0YnNibnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkxNTQ0MTIsImV4cCI6MjA1NDczMDQxMn0.p9M7vGrLwwvXGNaXqsxHZgCwJpE3lIQnNx0F5TXLR3I';

let supabase;
if (window.supabase) {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// ============ AUTHENTICATION ============

async function loginWithGoogle() {
  if (!supabase) {
    alert('Supabase client not initialized. Check internet connection.');
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/login.html'
    }
  });

  if (error) {
    console.error('Google login error:', error);
    alert('Google login failed: ' + error.message);
  }
}

async function register() {
  const name = document.getElementById('name')?.value;
  const email = document.getElementById('regEmail')?.value;
  const password = document.getElementById('regPassword')?.value;

  if (!name || !email || !password) {
    alert('Please fill all fields');
    return;
  }

  // Use Supabase Auth for registration
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: name
          }
        }
      });

      if (error) throw error;

      alert('Registration successful! Please check your email for verification.');
      window.location.href = 'login.html';
    } catch (err) {
      console.error('Supabase register error:', err);
      // Fallback to legacy registration if needed, or just show error
      alert('Registration failed: ' + err.message);
    }
  } else {
    // Legacy registration fallback
    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await response.json();

      if (response.ok) {
        alert('Registration successful! Please login.');
        window.location.href = 'login.html';
      } else {
        alert(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('Register error:', err);
      alert('Registration failed. Please try again.');
    }
  }
}

async function login() {
  const email = document.getElementById('email')?.value;
  const password = document.getElementById('password')?.value;

  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }

  // Try Supabase Auth first
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (data?.session) {
        // Sync with backend
        const response = await fetch(`${API_BASE}/api/auth/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: data.session.access_token })
        });

        const userData = await response.json();

        if (response.ok) {
          localStorage.setItem('currentUser', JSON.stringify({
            id: userData.user.id,
            name: userData.user.name,
            email: userData.user.email
          }));
          window.location.href = 'dashboard.html';
          return;
        }
      }

      // If Supabase login failed or sync failed, try legacy login
      console.log('Supabase login/sync failed, trying legacy login...');
    } catch (err) {
      console.error('Supabase login error:', err);
    }
  }

  // Legacy Login
  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      // Store user data - handle both 'name' and 'full_name' from backend
      localStorage.setItem('currentUser', JSON.stringify({
        id: data.user.id,
        name: data.user.name || data.user.full_name,
        email: email
      }));
      window.location.href = 'dashboard.html';
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login failed. Please check your connection.');
  }
}

function logout() {
  localStorage.removeItem('currentUser');
  window.location.href = 'login.html';
}

// ============ DASHBOARD FUNCTIONS ============

let currentUser = null;

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', async () => {
  // Check for Supabase session on load (for OAuth callback)
  // Only proceed if we have a hash fragment (redirect from Google) to avoid auto-login loops
  if (supabase && (window.location.pathname.includes('login.html') || window.location.pathname.includes('register.html'))) {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (session && window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery'))) {
      console.log('Supabase session found from redirect, syncing with backend...');

      try {
        const response = await fetch(`${API_BASE}/api/auth/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: session.access_token })
        });

        const data = await response.json();

        if (response.ok) {
           localStorage.setItem('currentUser', JSON.stringify({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email
          }));

          // Clear URL fragment
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.href = 'dashboard.html';
        } else {
          console.error('Backend sync failed:', data.error);
          alert('Login failed: ' + data.error);
          await supabase.auth.signOut();
        }
      } catch (err) {
        console.error('Backend sync error:', err);
      }
    }
  }

  // Check if we're on the dashboard page
  if (window.location.pathname.includes('dashboard.html')) {
    const userData = localStorage.getItem('currentUser');
    if (!userData) {
      window.location.href = 'login.html';
      return;
    }
    
    currentUser = JSON.parse(userData);
    
    // Update welcome message
    const welcomeMsg = document.getElementById('welcomeMsg');
    if (welcomeMsg) {
      welcomeMsg.textContent = `Welcome, ${currentUser.name || 'User'}`;
    }
    
    // Initialize clock and load logs
    initServerClock();
    loadLogs();
  }
});

// Camera and photo capture
let stream = null;
let photoData = null;

const clockInBtn = document.getElementById('clockInBtn');
const clockOutBtn = document.getElementById('clockOutBtn');
const fileLeaveBtn = document.getElementById('fileLeaveBtn');
const cameraModal = document.getElementById('cameraModal');
const video = document.getElementById('video');
const photoPreview = document.getElementById('photoPreview');
const captureBtn = document.getElementById('captureBtn');
const retakeBtn = document.getElementById('retakeBtn');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

if (clockInBtn) {
  clockInBtn.addEventListener('click', openCamera);
}

if (clockOutBtn) {
  clockOutBtn.addEventListener('click', clockOut);
}

if (fileLeaveBtn) {
  fileLeaveBtn.addEventListener('click', fileLeave);
}

if (captureBtn) {
  captureBtn.addEventListener('click', capturePhoto);
}

if (retakeBtn) {
  retakeBtn.addEventListener('click', retakePhoto);
}

if (confirmBtn) {
  confirmBtn.addEventListener('click', confirmClockIn);
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', closeCamera);
}

async function openCamera() {
  try {
    cameraModal.classList.remove('hidden');
    // Request environment camera (back camera) on mobile, fallback to user camera
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' }
      }
    });
    video.srcObject = stream;
    video.style.display = 'block';
    photoPreview.style.display = 'none';
    captureBtn.classList.remove('hidden');
    retakeBtn.classList.add('hidden');
    confirmBtn.classList.add('hidden');
    photoData = null;
  } catch (err) {
    console.error('Camera error:', err);
    alert('Unable to access camera. Clocking in without photo...');
    closeCamera();
    await clockInWithoutPhoto();
  }
}

function capturePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  photoData = canvas.toDataURL('image/jpeg');
  
  photoPreview.src = photoData;
  photoPreview.style.display = 'block';
  video.style.display = 'none';
  
  captureBtn.classList.add('hidden');
  retakeBtn.classList.remove('hidden');
  confirmBtn.classList.remove('hidden');
}

function retakePhoto() {
  video.style.display = 'block';
  photoPreview.style.display = 'none';
  captureBtn.classList.remove('hidden');
  retakeBtn.classList.add('hidden');
  confirmBtn.classList.add('hidden');
  photoData = null;
}

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraModal.classList.add('hidden');
  photoData = null;
}

async function confirmClockIn() {
  closeCamera();
  const mode = document.getElementById('mode')?.value || 'onsite';
  
  try {
    const response = await fetch(`${API_BASE}/api/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        mode: mode,
        photo: photoData,
        location: null
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Clocked in successfully!');
      loadLogs();
    } else {
      alert(data.error || 'Clock-in failed');
    }
  } catch (err) {
    console.error('Clock-in error:', err);
    alert('Clock-in failed. Please try again.');
  }
}

async function clockInWithoutPhoto() {
  const mode = document.getElementById('mode')?.value || 'onsite';
  
  try {
    const response = await fetch(`${API_BASE}/api/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        mode: mode,
        photo: null,
        location: null
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Clocked in successfully!');
      loadLogs();
    } else {
      alert(data.error || 'Clock-in failed');
    }
  } catch (err) {
    console.error('Clock-in error:', err);
    alert('Clock-in failed. Please try again.');
  }
}

async function clockOut() {
  if (!confirm('Clock out now?')) return;

  try {
    const response = await fetch(`${API_BASE}/api/clock-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Clocked out successfully!');
      loadLogs();
    } else {
      alert(data.error || 'Clock-out failed');
    }
  } catch (err) {
    console.error('Clock-out error:', err);
    alert('Clock-out failed. Please try again.');
  }
}

async function fileLeave() {
  const leaveType = document.getElementById('leaveType')?.value;
  const reason = document.getElementById('leaveReason')?.value;

  if (!leaveType) {
    alert('Please select leave type');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/file-leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        leaveType: leaveType,
        reason: reason
      })
    });

    const data = await response.json();

    if (response.ok) {
      alert('Leave filed successfully!');
      document.getElementById('leaveType').value = '';
      document.getElementById('leaveReason').value = '';
      loadLogs();
    } else {
      alert(data.error || 'Failed to file leave');
    }
  } catch (err) {
    console.error('File leave error:', err);
    alert('Failed to file leave. Please try again.');
  }
}

async function loadLogs() {
  if (!currentUser) {
    console.error('No current user found');
    return;
  }

  try {
    console.log('Loading logs for user:', currentUser.id);
    
    const response = await fetch(`${API_BASE}/api/logs/${currentUser.id}`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json'
      }
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Logs data received:', data);

    const recordsDiv = document.getElementById('records');
    if (!recordsDiv) {
      console.error('Records div not found');
      return;
    }

    if (!data.logs || data.logs.length === 0) {
      recordsDiv.innerHTML = '<p class="text-gray-400">No records found.</p>';
      return;
    }

    recordsDiv.innerHTML = data.logs.map(log => {
      if (log.leave_type) {
        return `
          <div class="record-item bg-gray-800 p-4 rounded-lg mb-3">
            <div class="flex justify-between items-start">
              <div>
                <strong class="text-yellow-400">LEAVE</strong> - ${log.leave_type.toUpperCase()}
                <br><small class="text-gray-400">Date: ${new Date(log.date || log.created_at).toLocaleDateString()}</small>
                ${log.leave_reason ? `<br><small class="text-gray-300">Reason: ${log.leave_reason}</small>` : ''}
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="record-item bg-gray-800 p-4 rounded-lg mb-3">
            <div class="flex justify-between items-start">
              <div>
                <strong class="text-green-400">${(log.mode || 'N/A').toUpperCase()}</strong>
                <br><small class="text-gray-400">Clock In: ${log.clock_in ? new Date(log.clock_in).toLocaleString() : 'N/A'}</small>
                <br><small class="text-gray-400">Clock Out: ${log.clock_out ? new Date(log.clock_out).toLocaleString() : '<span class="text-yellow-400">Not yet</span>'}</small>
              </div>
              ${log.photo ? `<img src="${log.photo}" class="w-20 h-20 object-cover rounded" alt="Photo">` : ''}
            </div>
          </div>
        `;
      }
    }).join('');
    
    console.log('Logs rendered successfully');
  } catch (err) {
    console.error('Load logs error:', err);
    const recordsDiv = document.getElementById('records');
    if (recordsDiv) {
      recordsDiv.innerHTML = `<p class="text-red-400">Error loading logs: ${err.message}</p>`;
    }
  }
}

// Server-synced clock
function initServerClock() {
  const clockTime = document.getElementById('clockTime');
  const clockDate = document.getElementById('clockDate');
  const clockSync = document.getElementById('clockSync');

  if (!clockTime || !clockDate) return;

  function updateClock() {
    const now = new Date();
    clockTime.textContent = now.toLocaleTimeString();
    clockDate.textContent = now.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  updateClock();
  setInterval(updateClock, 1000);
  
  if (clockSync) {
    clockSync.textContent = '✓ Synced';
  }
}

// Filter functionality
const applyFilterBtn = document.getElementById('applyFilterBtn');
const clearFilterBtn = document.getElementById('clearFilterBtn');

if (applyFilterBtn) {
  applyFilterBtn.addEventListener('click', applyFilters);
}

if (clearFilterBtn) {
  clearFilterBtn.addEventListener('click', clearFilters);
}

function applyFilters() {
  loadLogs();
}

function clearFilters() {
  const filterType = document.getElementById('filterType');
  const filterLeaveType = document.getElementById('filterLeaveType');
  const filterDateFrom = document.getElementById('filterDateFrom');
  const filterDateTo = document.getElementById('filterDateTo');

  if (filterType) filterType.value = 'all';
  if (filterLeaveType) filterLeaveType.value = 'all';
  if (filterDateFrom) filterDateFrom.value = '';
  if (filterDateTo) filterDateTo.value = '';

  loadLogs();
}