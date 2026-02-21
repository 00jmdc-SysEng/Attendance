const express = require('express');
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Import handlers - with error handling
let registerHandler, loginHandler, authSyncHandler, clockInHandler, clockOutHandler, fileLeaveHandler, getLogHandler;

try {
  registerHandler = require('./register');
  loginHandler = require('./login');
  authSyncHandler = require('./auth-sync');
  clockInHandler = require('./clock-in');
  clockOutHandler = require('./clock-out');
  fileLeaveHandler = require('./file-leave');
  getLogHandler = require('./get-log');
  console.log('[INIT] All handlers loaded successfully');
} catch (error) {
  console.error('[INIT] Error loading handlers:', error.message);
}

// Wrapper to safely call handlers
const safeHandler = (handler, name) => async (req, res) => {
  try {
    console.log(`[${name}] Called with params:`, req.params, 'query:', req.query);
    await handler(req, res);
  } catch (error) {
    console.error(`[${name}] Error:`, error.message);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: `${name} failed`,
        message: error.message 
      });
    }
  }
};

// Routes
if (registerHandler) app.post('/register', safeHandler(registerHandler, 'REGISTER'));
if (loginHandler) app.post('/login', safeHandler(loginHandler, 'LOGIN'));
if (authSyncHandler) app.post('/auth/sync', safeHandler(authSyncHandler, 'AUTH-SYNC'));
if (clockInHandler) app.post('/clock-in', safeHandler(clockInHandler, 'CLOCK-IN'));
if (clockOutHandler) app.post('/clock-out', safeHandler(clockOutHandler, 'CLOCK-OUT'));
if (fileLeaveHandler) app.post('/file-leave', safeHandler(fileLeaveHandler, 'FILE-LEAVE'));

// GET logs route - with explicit parameter handling
if (getLogHandler) {
  app.get('/logs/:userId', (req, res, next) => {
    console.log('[ROUTE] /logs/:userId hit with userId:', req.params.userId);
    safeHandler(getLogHandler, 'GET-LOGS')(req, res, next);
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    handlers: {
      register: !!registerHandler,
      login: !!loginHandler,
      authSync: !!authSyncHandler,
      clockIn: !!clockInHandler,
      clockOut: !!clockOutHandler,
      fileLeave: !!fileLeaveHandler,
      getLogs: !!getLogHandler
    }
  });
});

// 404
app.use((req, res) => {
  console.log('[404]', req.method, req.url);
  res.status(404).json({ 
    error: 'Not found',
    path: req.url,
    availableRoutes: [
      'POST /register',
      'POST /login', 
      'POST /clock-in',
      'POST /clock-out',
      'POST /file-leave',
      'GET /logs/:userId',
      'GET /health'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

module.exports = app;