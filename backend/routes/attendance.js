const express = require('express');
const db = require('../db');

const router = express.Router();

// CLOCK IN
router.post('/clock-in', async (req, res) => {
  const { userId, mode, photo, leave_type } = req.body;
  if (!userId || !mode) return res.status(400).json({ error: 'Missing data' });

  try {
    await db.query(
      `INSERT INTO attendance_logs (user_id, mode, clock_in, photo, leave_type)
       VALUES (?, ?, NOW(), ?, ?)`,
      [userId, mode, photo || null, leave_type || null]
    );
    res.json({ message: 'Clocked in' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// CLOCK OUT
router.post('/clock-out', async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  try {
    await db.query(
      `UPDATE attendance_logs SET clock_out = NOW() WHERE user_id = ? AND clock_out IS NULL`,
      [userId]
    );
    res.json({ message: 'Clocked out' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET LOGS
router.get('/logs/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [logs] = await db.query(
      `SELECT * FROM attendance_logs WHERE user_id = ? ORDER BY clock_in DESC`,
      [userId]
    );
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
