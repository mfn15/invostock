const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const r = await db.query('SELECT key,value FROM settings');
    res.json(Object.fromEntries(r.rows.map(x => [x.key, x.value])));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', async (req, res) => {
  if (req.session.user?.role !== 'admin') return res.status(403).json({ error: 'Admin authority required.' });
  const entries = Object.entries(req.body || {});
  try {
    for (const [key, value] of entries) {
      await db.query('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key, String(value)]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
