const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/', async (req, res) => {
  try {
    const r = await db.query(`
      SELECT p.*, c.name AS category_name, i.stock_quantity, i.reorder_level
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN inventory i ON i.product_id = p.id
      ORDER BY p.name
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories', async (req, res) => {
  try {
    const r = await db.query('SELECT * FROM categories ORDER BY name');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/', async (req, res) => {
  const { sku, name, category_id, unit, cost_price, sale_price, stock_quantity, reorder_level } = req.body || {};
  if (!sku || !name || !sale_price) return res.status(400).json({ error: 'sku, name and sale_price are required.' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const p = await c.query(
      `INSERT INTO products(sku,name,category_id,unit,cost_price,sale_price) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [sku, name, category_id || null, unit || 'pcs', Number(cost_price) || 0, Number(sale_price)]
    );
    await c.query(
      `INSERT INTO inventory(product_id,stock_quantity,reorder_level) VALUES($1,$2,$3)`,
      [p.rows[0].id, Number(stock_quantity) || 0, Number(reorder_level) || 5]
    );
    await c.query('COMMIT');
    res.json({ success: true, id: Number(p.rows[0].id) });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { c.release(); }
});

router.put('/:id', async (req, res) => {
  const { name, category_id, unit, cost_price, sale_price, reorder_level, is_active } = req.body || {};
  try {
    await db.query(
      `UPDATE products SET name=$1,category_id=$2,unit=$3,cost_price=$4,sale_price=$5,is_active=$6 WHERE id=$7`,
      [name, category_id || null, unit, Number(cost_price) || 0, Number(sale_price), is_active !== false, Number(req.params.id)]
    );
    if (reorder_level !== undefined) {
      await db.query(`UPDATE inventory SET reorder_level=$1 WHERE product_id=$2`, [Number(reorder_level), Number(req.params.id)]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Manual stock adjustment (purchase, correction, return -- anything that
// isn't a sale, since sales are recorded through the invoices route).
router.post('/:id/adjust-stock', async (req, res) => {
  const { change_qty, reason, reference } = req.body || {};
  if (!change_qty || !['purchase', 'adjustment', 'return'].includes(reason)) {
    return res.status(400).json({ error: 'change_qty and a valid reason are required.' });
  }
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `UPDATE inventory SET stock_quantity = stock_quantity + $1 WHERE product_id = $2`,
      [Number(change_qty), Number(req.params.id)]
    );
    await c.query(
      `INSERT INTO stock_movements(product_id,change_qty,reason,reference) VALUES($1,$2,$3,$4)`,
      [Number(req.params.id), Number(change_qty), reason, reference || null]
    );
    await c.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { c.release(); }
});

module.exports = router;
