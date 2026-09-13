const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  try {
    const r = await db.query('SELECT id,username,password,role,name FROM users WHERE username=$1', [username]);
    if (!r.rowCount) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });
    req.session.user = { id: Number(user.id), username: user.username, role: user.role, name: user.name };
    res.json({ success: true, user: req.session.user });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  res.json(req.session.user);
});

module.exports = router;
