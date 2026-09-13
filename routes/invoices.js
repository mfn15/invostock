const express = require('express');
const router = express.Router();
const db = require('../database/db');

function normalize(x) {
  return {
    ...x,
    id: Number(x.id),
    subtotal: Number(x.subtotal),
    discount: Number(x.discount),
    tax: Number(x.tax),
    grand_total: Number(x.grand_total),
    amount_paid: Number(x.amount_paid)
  };
}

// Create a new invoice: decrements stock for every line item and rejects
// the whole thing (rolled back) if any item doesn't have enough stock.
router.post('/', async (req, res) => {
  const { customer_id, items, discount, tax, amount_paid } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cannot create an empty invoice.' });

  const c = await db.connect();
  try {
    await c.query('BEGIN');

    const subtotal = items.reduce((sum, it) => sum + Number(it.unit_price) * Number(it.quantity), 0);
    const disc = Number(discount) || 0;
    const taxAmt = Number(tax) || 0;
    const grandTotal = subtotal - disc + taxAmt;
    const paid = Number(amount_paid) || 0;
    const status = paid >= grandTotal ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

    // Invoice number: INV-<year>-<sequence>, sequence resets each year.
    const year = new Date().getFullYear();
    const counter = await c.query(
      `INSERT INTO invoice_counters(counter_year,last_number) VALUES($1,1)
       ON CONFLICT(counter_year) DO UPDATE SET last_number=invoice_counters.last_number+1
       RETURNING last_number`,
      [year]
    );
    const invoiceNumber = `INV-${year}-${String(counter.rows[0].last_number).padStart(4, '0')}`;

    const inv = await c.query(
      `INSERT INTO invoices(invoice_number,customer_id,subtotal,discount,tax,grand_total,amount_paid,status,user_id)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at`,
      [invoiceNumber, customer_id || null, subtotal, disc, taxAmt, grandTotal, paid, status, req.session.user?.id || null]
    );
    const invoiceId = inv.rows[0].id;

    const values = items.map((_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`).join(',');
    const params = items.flatMap(it => {
      const q = Number(it.quantity), price = Number(it.unit_price);
      return [invoiceId, Number(it.product_id), it.product_name, price, q, price * q];
    });
    await c.query(`INSERT INTO invoice_items(invoice_id,product_id,product_name,unit_price,quantity,line_total) VALUES ${values}`, params);

    // Stock decrement + movement log for every item, in one round trip:
    // the inventory UPDATE's RETURNING feeds the movement INSERT via a CTE.
    const stockValues = items.map((_, i) => `($${i * 2 + 1}::bigint,$${i * 2 + 2}::numeric)`).join(',');
    const stockParams = items.flatMap(it => [Number(it.product_id), Number(it.quantity)]);
    const stockRes = await c.query(
      `WITH dec AS (
         UPDATE inventory AS inv SET stock_quantity = inv.stock_quantity - v.qty
         FROM (VALUES ${stockValues}) AS v(product_id, qty)
         WHERE inv.product_id = v.product_id AND inv.stock_quantity >= v.qty
         RETURNING inv.product_id, v.qty
       )
       INSERT INTO stock_movements(product_id, change_qty, reason, reference)
       SELECT product_id, -qty, 'sale', $${stockParams.length + 1} FROM dec
       RETURNING product_id`,
      [...stockParams, invoiceNumber]
    );
    const updatedIds = new Set(stockRes.rows.map(r => Number(r.product_id)));
    if (updatedIds.size < items.length) {
      const failed = items.find(it => !updatedIds.has(Number(it.product_id)));
      throw new Error(`Insufficient stock for ${failed ? failed.product_name : 'one or more items'}.`);
    }

    await c.query('COMMIT');
    res.json({
      success: true,
      id: Number(invoiceId),
      invoice_number: invoiceNumber,
      subtotal, discount: disc, tax: taxAmt, grand_total: grandTotal, amount_paid: paid, status,
      created_at: inv.rows[0].created_at,
      items
    });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { c.release(); }
});

router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    const params = [];
    let q = `SELECT i.*, cu.name AS customer_name FROM invoices i LEFT JOIN customers cu ON cu.id=i.customer_id WHERE 1=1`;
    if (search) { params.push(`%${search}%`); q += ` AND i.invoice_number ILIKE $${params.length}`; }
    if (status) { params.push(status); q += ` AND i.status = $${params.length}`; }
    q += ` ORDER BY i.id DESC LIMIT 200`;
    const r = await db.query(q, params);
    res.json(r.rows.map(normalize));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:invoice_number', async (req, res) => {
  try {
    const inv = await db.query(
      `SELECT i.*, cu.name AS customer_name, cu.phone AS customer_phone FROM invoices i LEFT JOIN customers cu ON cu.id=i.customer_id WHERE i.invoice_number=$1`,
      [req.params.invoice_number]
    );
    if (!inv.rowCount) return res.status(404).json({ error: 'Invoice not found.' });
    const items = await db.query('SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY id', [inv.rows[0].id]);
    res.json({ ...normalize(inv.rows[0]), items: items.rows.map(x => ({ ...x, id: Number(x.id), unit_price: Number(x.unit_price), quantity: Number(x.quantity), line_total: Number(x.line_total) })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/payment', async (req, res) => {
  const { amount } = req.body || {};
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'A positive amount is required.' });
  try {
    const r = await db.query(
      `UPDATE invoices SET amount_paid = amount_paid + $1,
         status = CASE WHEN amount_paid + $1 >= grand_total THEN 'paid' ELSE 'partial' END
       WHERE id=$2 AND status != 'void' RETURNING status, amount_paid`,
      [Number(amount), Number(req.params.id)]
    );
    if (!r.rowCount) return res.status(404).json({ error: 'Invoice not found or void.' });
    res.json({ success: true, status: r.rows[0].status, amount_paid: Number(r.rows[0].amount_paid) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/void', async (req, res) => {
  if (req.session.user?.role !== 'admin') return res.status(403).json({ error: 'Admin authority required.' });
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const items = await c.query('SELECT product_id, quantity FROM invoice_items WHERE invoice_id=$1', [Number(req.params.id)]);
    for (const it of items.rows) {
      await c.query('UPDATE inventory SET stock_quantity = stock_quantity + $1 WHERE product_id=$2', [it.quantity, it.product_id]);
      await c.query(`INSERT INTO stock_movements(product_id,change_qty,reason,reference) VALUES($1,$2,'return','void')`, [it.product_id, it.quantity]);
    }
    const r = await c.query(`UPDATE invoices SET status='void' WHERE id=$1 RETURNING id`, [Number(req.params.id)]);
    if (!r.rowCount) throw new Error('Invoice not found.');
    await c.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await c.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally { c.release(); }
});

module.exports = router;
