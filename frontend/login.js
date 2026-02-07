const API = 'http://localhost:3000/api';
let currentUser = null;

// Login elements
const email = document.getElementById('email');
const password = document.getElementById('password');

// Register elements
const nameInput = document.getElementById('name');
const regEmail = document.getElementById('regEmail');
const regPassword = document.getElementById('regPassword');

// Dashboard elements
const userLabel = document.getElementById('userLabel');
const records = document.getElementById('records');
const video = document.getElementById('video');
const captureBtn = document.getElementById('captureBtn');
const photoPreview = document.getElementById('photoPreview');
const cameraModal = document.getElementById('cameraModal');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');
const retakeBtn = document.getElementById('retakeBtn');
let capturedPhoto = '';
let currentStream = null;
let selectedMode = 'onsite';

/* ================= AUTH FUNCTIONS ================= */
async function login() {
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value.trim(), password: password.value })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);

    currentUser = data.user;
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    window.location.href = 'dashboard.html';
  } catch (err) {
    console.error(err);
    alert('Failed to login.');
  }
}

async function register() {
  try {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        email: regEmail.value.trim(),
        password: regPassword.value
      })
    });
    const data = await res.json();
    if (!res.ok) return alert(data.error);

    alert('Registered successfully! You can now log in.');
    window.location.href = 'login.html';
  } catch (err) {
    console.error(err);
    alert('Failed to register.');
  }
}

/* ================= CAMERA MODAL FUNCTIONS ================= */
async function initiateClockIn() {
  if (!currentUser) return alert('No user logged in');
  
  // Get selected mode
  const modeSelect = document.getElementById('mode');
  selectedMode = modeSelect ? modeSelect.value : 'onsite';
  
  // Show modal and start camera
  if (cameraModal) {
    cameraModal.classList.remove('hidden');
    await startCamera();
  }
}

async function startCamera() {
  if (!video) return;
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    video.srcObject = currentStream;
  } catch (err) {
    console.error('Camera error:', err);
    alert('Unable to access camera. Please check permissions.');
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  if (video) {
    video.srcObject = null;
  }
}

function closeModal() {
  stopCamera();
  capturedPhoto = '';
  if (cameraModal) cameraModal.classList.add('hidden');
  if (photoPreview) photoPreview.src = '';
  if (confirmBtn) confirmBtn.classList.add('hidden');
  if (captureBtn) captureBtn.classList.remove('hidden');
  if (retakeBtn) retakeBtn.classList.add('hidden');
  if (video) video.classList.remove('hidden');
}

// Camera button event listeners
if (captureBtn) {
  captureBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Compress image to reduce size
    capturedPhoto = canvas.toDataURL('image/jpeg', 0.8);
    
    console.log('Photo captured, size:', capturedPhoto.length);
    
    // Show preview and hide video
    photoPreview.src = capturedPhoto;
    video.classList.add('hidden');
    captureBtn.classList.add('hidden');
    confirmBtn.classList.remove('hidden');
    retakeBtn.classList.remove('hidden');
  });
}

if (retakeBtn) {
  retakeBtn.addEventListener('click', () => {
    capturedPhoto = '';
    photoPreview.src = '';
    video.classList.remove('hidden');
    captureBtn.classList.remove('hidden');
    confirmBtn.classList.add('hidden');
    retakeBtn.classList.add('hidden');
  });
}

if (confirmBtn) {
  confirmBtn.addEventListener('click', async () => {
    if (!capturedPhoto) {
      alert('Please capture a photo first!');
      return;
    }
    
    // Disable button and show loading state
    confirmBtn.disabled = true;
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = '📍 Getting location...';
    
    try {
      await clockIn(selectedMode);
      closeModal();
    } catch (err) {
      console.error('Error during clock in:', err);
    } finally {
      // Re-enable button and restore text
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalText;
    }
  });
}

if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    closeModal();
  });
}

/* ================= ATTENDANCE FUNCTIONS ================= */
async function clockIn(mode = 'onsite') {
  if (!currentUser) return alert('No user logged in');

  try {
    // Get location data
    let locationData = null;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 10000,
          enableHighAccuracy: true
        });
      });
      
      // Get address from coordinates using reverse geocoding
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`,
          {
            headers: {
              'User-Agent': 'AttendanceSystem/1.0'
            }
          }
        );
        const data = await response.json();
        
        const addressParts = [];
        if (data.address.road) addressParts.push(data.address.road);
        if (data.address.suburb || data.address.neighbourhood) addressParts.push(data.address.suburb || data.address.neighbourhood);
        if (data.address.city) addressParts.push(data.address.city);
        if (data.address.country) addressParts.push(data.address.country);
        
        locationData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: addressParts.join(', ') || `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        };
      } catch (geoErr) {
        console.log('Reverse geocoding failed:', geoErr);
        // If reverse geocoding fails, just use coordinates
        locationData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          address: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`
        };
      }
    } catch (locErr) {
      console.log('Location unavailable:', locErr);
      // Location is optional, continue without it
    }

    const payload = { 
      userId: currentUser.id, 
      mode, 
      photo: capturedPhoto,
      location: locationData
    };
    
    console.log('Sending clock-in request:', {
      userId: payload.userId,
      mode: payload.mode,
      photoLength: payload.photo ? payload.photo.length : 0,
      location: payload.location
    });
    
    const res = await fetch(`${API}/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Clock-in error:', data);
      return alert(data.error || 'Failed to clock in');
    }
    alert('Clock-in successful!');
    loadLogs();
  } catch (err) {
    console.error('Clock-in error:', err);
    alert('Failed to clock in. Please try again.');
  }
}

async function clockOut() {
  if (!currentUser) return alert('No user logged in');
  try {
    const res = await fetch(`${API}/clock-out`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id })
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Clock-out error:', data);
      return alert(data.error || 'Failed to clock out');
    }
    alert('Clock-out successful!');
    loadLogs();
  } catch (err) {
    console.error('Clock-out error:', err);
    alert('Failed to clock out. Please try again.');
  }
}

/* ================= LOAD ATTENDANCE LOGS ================= */
async function loadLogs() {
  if (!currentUser || !records) return;

  try {
    const res = await fetch(`${API}/logs/${currentUser.id}`);
    const data = await res.json();
    
    console.log('Logs response:', data);
    
    if (!res.ok) return alert(data.error);

    const logs = data.logs || [];
    
    console.log('Processing', logs.length, 'logs');
    
    if (logs.length === 0) {
      records.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);padding:2rem;font-size:0.9rem;">No attendance records yet</p>';
      return;
    }
    
    // Clear the records container
    records.innerHTML = '';
    
    logs.forEach((l, index) => {
      const recordId = `record-${index}`;
      const clockInTime = new Date(l.clock_in).toLocaleString();
      const clockOutTime = l.clock_out ? new Date(l.clock_out).toLocaleString() : 'ONGOING';
      
      console.log(`Log ${index}:`, {
        id: l.id,
        has_photo: !!l.photo,
        photo_preview: l.photo ? l.photo.substring(0, 30) + '...' : 'none',
        has_location: !!l.location,
        location: l.location
      });
      
      // Calculate duration if clocked out
      let duration = '';
      if (l.clock_out) {
        const diff = new Date(l.clock_out) - new Date(l.clock_in);
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        duration = `${hours}h ${minutes}m`;
      }
      
      // Build location HTML
      let locationHTML = '';
      if (l.location && l.location.lat && l.location.lng) {
        const address = l.location.address || `${l.location.lat.toFixed(6)}, ${l.location.lng.toFixed(6)}`;
        locationHTML = `
          <div class="detail-item full-width">
            <div class="detail-label">Location</div>
            <div class="detail-value">📍 ${address}</div>
            <a href="https://www.google.com/maps?q=${l.location.lat},${l.location.lng}" 
               target="_blank" 
               class="map-link">
              🗺️ View on Map
            </a>
          </div>
        `;
      }
      
      // Build photo HTML - escape single quotes in the data URL
      let photoHTML = '';
      if (l.photo) {
        const escapedPhoto = l.photo.replace(/'/g, "\\'");
        photoHTML = `
          <div class="detail-item full-width">
            <div class="detail-label">Photo Verification</div>
            <div class="photo-container">
              <img src="${l.photo}" 
                   alt="Clock in photo" 
                   class="record-photo" 
                   onclick="viewFullPhoto('${escapedPhoto}')"
                   onerror="console.error('Failed to load image'); this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>Image failed to load</text></svg>'">
              <div class="photo-hint">Click to view full size</div>
            </div>
          </div>
        `;
      } else {
        photoHTML = `
          <div class="detail-item full-width">
            <div class="detail-label">Photo</div>
            <div class="detail-value">No photo available</div>
          </div>
        `;
      }
      
      // Create record card
      const recordCard = document.createElement('div');
      recordCard.className = 'record-card';
      recordCard.innerHTML = `
        <div class="record-header" onclick="toggleRecord('${recordId}')">
          <div class="record-header-left">
            <span class="record-badge ${l.mode}">${l.mode.toUpperCase()}</span>
            <span class="record-date">${new Date(l.clock_in).toLocaleDateString()}</span>
          </div>
          <span class="record-arrow" id="${recordId}-arrow">▼</span>
        </div>
        <div class="record-details hidden" id="${recordId}">
          <div class="record-detail-grid">
            <div class="detail-item">
              <div class="detail-label">Clock In</div>
              <div class="detail-value">🕐 ${clockInTime}</div>
            </div>
            <div class="detail-item">
              <div class="detail-label">Clock Out</div>
              <div class="detail-value">${l.clock_out ? '🕐 ' + clockOutTime : '⏱️ Ongoing'}</div>
            </div>
            ${duration ? `
              <div class="detail-item">
                <div class="detail-label">Duration</div>
                <div class="detail-value">⏱️ ${duration}</div>
              </div>
            ` : ''}
            ${locationHTML}
            ${photoHTML}
          </div>
        </div>
      `;
      
      records.appendChild(recordCard);
    });
    
    console.log('Finished rendering', logs.length, 'records');
  } catch (err) {
    console.error('Error loading logs:', err);
    records.innerHTML = '<p style="text-align:center;color:#ff4444;padding:2rem;font-size:0.9rem;">Error loading records</p>';
  }
}

// Toggle record expansion
function toggleRecord(recordId) {
  const details = document.getElementById(recordId);
  const arrow = document.getElementById(`${recordId}-arrow`);
  
  if (!details || !arrow) {
    console.error('Could not find elements for', recordId);
    return;
  }
  
  console.log('Toggling record:', recordId, 'Currently hidden:', details.classList.contains('hidden'));
  
  if (details.classList.contains('hidden')) {
    details.classList.remove('hidden');
    arrow.textContent = '▲';
    arrow.style.transform = 'rotate(180deg)';
  } else {
    details.classList.add('hidden');
    arrow.textContent = '▼';
    arrow.style.transform = 'rotate(0deg)';
  }
}

// View full photo in modal
function viewFullPhoto(photoSrc) {
  console.log('Opening full photo modal');
  const modal = document.createElement('div');
  modal.className = 'photo-modal';
  modal.innerHTML = `
    <div class="photo-modal-content">
      <button class="photo-close-btn" onclick="this.parentElement.parentElement.remove()">×</button>
      <img src="${photoSrc}" alt="Full size photo">
    </div>
  `;
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
  document.body.appendChild(modal);
}

/* ================= CALENDAR FUNCTIONS ================= */
let calendarYear, calendarMonth;

function initCalendar() {
  if (!document.getElementById('calendar')) return;

  const now = new Date();
  calendarYear = now.getFullYear();
  calendarMonth = now.getMonth() + 1;
  renderCalendar();
}

async function renderCalendar() {
  if (!currentUser) return;

  const label = document.getElementById('calendarLabel');
  const calendar = document.getElementById('calendar');
  if (!label || !calendar) return;

  label.textContent = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}`;
  calendar.innerHTML = '';

  const res = await fetch(`${API}/calendar/${currentUser.id}/${calendarYear}/${calendarMonth}`);
  const data = await res.json();
  const calendarData = data.calendar || {};
  const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = `${calendarYear}-${String(calendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const entry = calendarData[dateKey];

    const cell = document.createElement('div');
    cell.className = 'calendar-day';
    if (entry) {
      cell.classList.add(entry.status);
      cell.title = entry.status.replace('-', ' ').toUpperCase();
    } else {
      cell.classList.add('absent');
      cell.title = 'ABSENT';
    }
    cell.textContent = day;
    calendar.appendChild(cell);
  }
}

function prevMonth() {
  calendarMonth--;
  if (calendarMonth < 1) {
    calendarMonth = 12;
    calendarYear--;
  }
  renderCalendar();
}

function nextMonth() {
  calendarMonth++;
  if (calendarMonth > 12) {
    calendarMonth = 1;
    calendarYear++;
  }
  renderCalendar();
}

/* ================= EXPORT ================= */
window.login = login;
window.register = register;
window.initiateClockIn = initiateClockIn;
window.clockIn = clockIn;
window.clockOut = clockOut;
window.loadLogs = loadLogs;
window.toggleRecord = toggleRecord;
window.viewFullPhoto = viewFullPhoto;
window.initCalendar = initCalendar;
window.prevMonth = prevMonth;
window.nextMonth = nextMonth;

/* ================= EVENT LISTENERS ================= */
// Add event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const clockInBtn = document.getElementById('clockInBtn');
  const clockOutBtn = document.getElementById('clockOutBtn');
  
  if (clockInBtn) {
    clockInBtn.addEventListener('click', initiateClockIn);
  }
  
  if (clockOutBtn) {
    clockOutBtn.addEventListener('click', clockOut);
  }
});
/* ================= SERVER-SYNCED CLOCK ================= */
let serverTimeOffset = 0; // Offset between server time and local time
let clockInterval = null;
let syncInterval = null;

async function initServerClock() {
  const clockTime = document.getElementById('clockTime');
  const clockDate = document.getElementById('clockDate');
  const clockSync = document.getElementById('clockSync');
  
  if (!clockTime || !clockDate || !clockSync) {
    console.log('Clock elements not found');
    return;
  }
  
  // Initial sync
  await syncServerTime();
  
  // Update clock display every second
  clockInterval = setInterval(() => {
    updateClockDisplay();
  }, 1000);
  
  // Re-sync with server every 5 minutes
  syncInterval = setInterval(() => {
    syncServerTime();
  }, 5 * 60 * 1000);
  
  // Initial display
  updateClockDisplay();
}

async function syncServerTime() {
  const clockSync = document.getElementById('clockSync');
  
  try {
    if (clockSync) {
      clockSync.textContent = '🔄 Syncing...';
      clockSync.className = 'clock-sync syncing';
    }
    
    const startTime = Date.now();
    const response = await fetch(`${API}/server-time`);
    const latency = Date.now() - startTime;
    
    if (!response.ok) {
      throw new Error('Failed to fetch server time');
    }
    
    const data = await response.json();
    const serverTime = new Date(data.serverTime);
    const localTime = Date.now() + (latency / 2); // Account for network latency
    
    serverTimeOffset = serverTime.getTime() - localTime;
    
    if (clockSync) {
      clockSync.textContent = '✓ Server Synced';
      clockSync.className = 'clock-sync synced';
    }
    
    console.log(`Server time synced. Offset: ${serverTimeOffset}ms, Latency: ${latency}ms`);
  } catch (error) {
    console.error('Failed to sync server time:', error);
    
    if (clockSync) {
      clockSync.textContent = '⚠ Sync Failed';
      clockSync.className = 'clock-sync error';
    }
    
    // Retry after 10 seconds
    setTimeout(syncServerTime, 10000);
  }
}

function updateClockDisplay() {
  const clockTime = document.getElementById('clockTime');
  const clockDate = document.getElementById('clockDate');
  
  if (!clockTime || !clockDate) return;
  
  // Get current time adjusted by server offset
  const now = new Date(Date.now() + serverTimeOffset);
  
  // Format time: HH:MM:SS
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  clockTime.textContent = `${hours}:${minutes}:${seconds}`;
  
  // Format date: Weekday, Month Day, Year
  const options = { 
    weekday: 'short', 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  };
  clockDate.textContent = now.toLocaleDateString('en-US', options);
}

// Export clock function
window.initServerClock = initServerClock;

/* ================= LEAVE FILING ================= */
async function fileLeave() {
  if (!currentUser) return alert('No user logged in');

  const leaveTypeSelect = document.getElementById('leaveType');
  const leaveReasonTextarea = document.getElementById('leaveReason');
  
  const leaveType = leaveTypeSelect?.value;
  const reason = leaveReasonTextarea?.value.trim();

  if (!leaveType) {
    return alert('Please select a leave type');
  }

  try {
    const res = await fetch(`${API}/file-leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        leaveType,
        reason
      })
    });

    const data = await res.json();
    
    if (!res.ok) {
      return alert(data.error || 'Failed to file leave');
    }

    alert('Leave filed successfully!');
    
    // Reset form
    if (leaveTypeSelect) leaveTypeSelect.value = '';
    if (leaveReasonTextarea) leaveReasonTextarea.value = '';
    
    // Reload logs
    loadLogs();
  } catch (err) {
    console.error('File leave error:', err);
    alert('Failed to file leave. Please try again.');
  }
}

/* ================= FILTERING ================= */
let allLogs = []; // Store all logs for filtering

// Update the original loadLogs function
const originalLoadLogs = loadLogs;
window.loadLogs = async function() {
  if (!currentUser || !records) return;

  try {
    const res = await fetch(`${API}/logs/${currentUser.id}`);
    const data = await res.json();
    allLogs = data.logs || [];
    
    // Apply any active filters
    displayFilteredLogs(allLogs);
  } catch (err) {
    console.error('Error loading logs:', err);
    if (records) {
      records.innerHTML = '<p style="text-align:center;color:#ff4444;padding:2rem;font-size:0.9rem;">Error loading records</p>';
    }
  }
};

function displayFilteredLogs(logs) {
  if (!records) return;
  
  records.innerHTML = '';
  
  if (logs.length === 0) {
    records.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.5);padding:2rem;font-size:0.9rem;">No records match the current filters</p>';
    return;
  }
  
  logs.forEach((l, index) => {
    const recordId = `record-${index}`;
    const isLeave = !!l.leave_type;
    
    let badgeClass = '';
    let badgeText = '';
    let dateDisplay = '';
    
    if (isLeave) {
      badgeClass = `leave-${l.leave_type}`;
      const leaveLabels = {
        'sick': 'SICK LEAVE',
        'vacation': 'VACATION',
        'emergency': 'EMERGENCY',
        'official': 'OFFICIAL BUSINESS'
      };
      badgeText = leaveLabels[l.leave_type] || l.leave_type.toUpperCase();
      dateDisplay = new Date(l.created_at || l.date).toLocaleDateString();
    } else {
      badgeClass = l.mode;
      badgeText = l.mode.toUpperCase();
      dateDisplay = new Date(l.clock_in).toLocaleDateString();
    }
    
    let detailsHTML = '';
    
    if (isLeave) {
      detailsHTML = `
        <div class="record-detail-grid">
          <div class="detail-item full-width">
            <div class="detail-label">Leave Type</div>
            <div class="detail-value">📋 ${badgeText}</div>
          </div>
          ${l.leave_reason ? `
            <div class="detail-item full-width">
              <div class="detail-label">Reason</div>
              <div class="detail-value">${l.leave_reason}</div>
            </div>
          ` : ''}
          <div class="detail-item full-width">
            <div class="detail-label">Filed On</div>
            <div class="detail-value">📅 ${new Date(l.created_at).toLocaleString()}</div>
          </div>
        </div>
      `;
    } else {
      const clockInTime = new Date(l.clock_in).toLocaleString();
      const clockOutTime = l.clock_out ? new Date(l.clock_out).toLocaleString() : 'ONGOING';
      
      let duration = '';
      if (l.clock_out) {
        const diff = new Date(l.clock_out) - new Date(l.clock_in);
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        duration = `${hours}h ${minutes}m`;
      }
      
      let locationHTML = '';
      if (l.location && l.location.lat && l.location.lng) {
        const address = l.location.address || `${l.location.lat.toFixed(6)}, ${l.location.lng.toFixed(6)}`;
        locationHTML = `
          <div class="detail-item full-width">
            <div class="detail-label">Location</div>
            <div class="detail-value">📍 ${address}</div>
            <a href="https://www.google.com/maps?q=${l.location.lat},${l.location.lng}" 
               target="_blank" 
               class="map-link">
              🗺️ View on Map
            </a>
          </div>
        `;
      }
      
      let photoHTML = '';
      if (l.photo) {
        const escapedPhoto = l.photo.replace(/'/g, "\\'");
        photoHTML = `
          <div class="detail-item full-width">
            <div class="detail-label">Photo Verification</div>
            <div class="photo-container">
              <img src="${l.photo}" 
                   alt="Clock in photo" 
                   class="record-photo" 
                   onclick="viewFullPhoto('${escapedPhoto}')"
                   onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><text x=%2250%%22 y=%2250%%22 text-anchor=%22middle%22>Image failed to load</text></svg>'">
              <div class="photo-hint">Click to view full size</div>
            </div>
          </div>
        `;
      }
      
      detailsHTML = `
        <div class="record-detail-grid">
          <div class="detail-item">
            <div class="detail-label">Clock In</div>
            <div class="detail-value">🕐 ${clockInTime}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Clock Out</div>
            <div class="detail-value">${l.clock_out ? '🕐 ' + clockOutTime : '⏱️ Ongoing'}</div>
          </div>
          ${duration ? `
            <div class="detail-item">
              <div class="detail-label">Duration</div>
              <div class="detail-value">⏱️ ${duration}</div>
            </div>
          ` : ''}
          ${locationHTML}
          ${photoHTML}
        </div>
      `;
    }
    
    const recordCard = document.createElement('div');
    recordCard.className = 'record-card';
    recordCard.innerHTML = `
      <div class="record-header" onclick="toggleRecord('${recordId}')">
        <div class="record-header-left">
          <span class="record-badge ${badgeClass}">${badgeText}</span>
          <span class="record-date">${dateDisplay}</span>
        </div>
        <span class="record-arrow" id="${recordId}-arrow">▼</span>
      </div>
      <div class="record-details hidden" id="${recordId}">
        ${detailsHTML}
      </div>
    `;
    
    records.appendChild(recordCard);
  });
}

function applyFilters() {
  const filterType = document.getElementById('filterType')?.value || 'all';
  const filterLeaveType = document.getElementById('filterLeaveType')?.value || 'all';
  const filterDateFrom = document.getElementById('filterDateFrom')?.value;
  const filterDateTo = document.getElementById('filterDateTo')?.value;
  
  let filteredLogs = [...allLogs];
  
  if (filterType !== 'all') {
    if (filterType === 'leave') {
      filteredLogs = filteredLogs.filter(log => log.leave_type !== null);
    } else {
      filteredLogs = filteredLogs.filter(log => log.mode === filterType && log.leave_type === null);
    }
  }
  
  if (filterLeaveType !== 'all') {
    filteredLogs = filteredLogs.filter(log => log.leave_type === filterLeaveType);
  }
  
  if (filterDateFrom) {
    const fromDate = new Date(filterDateFrom);
    fromDate.setHours(0, 0, 0, 0);
    filteredLogs = filteredLogs.filter(log => {
      const logDate = new Date(log.clock_in || log.created_at || log.date);
      logDate.setHours(0, 0, 0, 0);
      return logDate >= fromDate;
    });
  }
  
  if (filterDateTo) {
    const toDate = new Date(filterDateTo);
    toDate.setHours(23, 59, 59, 999);
    filteredLogs = filteredLogs.filter(log => {
      const logDate = new Date(log.clock_in || log.created_at || log.date);
      return logDate <= toDate;
    });
  }
  
  displayFilteredLogs(filteredLogs);
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
  
  displayFilteredLogs(allLogs);
}

// Export new functions
window.fileLeave = fileLeave;
window.applyFilters = applyFilters;
window.clearFilters = clearFilters;

// Add event listeners for new buttons
(function() {
  const originalDOMContentLoaded = document.addEventListener;
  document.addEventListener('DOMContentLoaded', () => {
    const fileLeaveBtn = document.getElementById('fileLeaveBtn');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    
    if (fileLeaveBtn) {
      fileLeaveBtn.addEventListener('click', fileLeave);
    }
    
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener('click', applyFilters);
    }
    
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', clearFilters);
    }
  });
})();