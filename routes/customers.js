const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM customers ORDER BY name');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { name, phone, email, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required.' });
  try {
    const r = await db.query(
      `INSERT INTO customers(name,phone,email,address) VALUES($1,$2,$3,$4) RETURNING id`,
      [name, phone || null, email || null, address || null]
    );
    res.json({ success: true, id: Number(r.rows[0].id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id/invoices', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT invoice_number, grand_total, amount_paid, status, created_at FROM invoices WHERE customer_id=$1 ORDER BY id DESC`,
      [Number(req.params.id)]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
