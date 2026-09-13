const express = require('express');
const router = express.Router();
const db = require('../database/db');

router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sales = await db.query(
      `SELECT COUNT(*)::int invoice_count, COALESCE(SUM(grand_total),0) revenue
       FROM invoices WHERE created_at::date=$1 AND status != 'void'`,
      [today]
    );
    const outstanding = await db.query(
      `SELECT COALESCE(SUM(grand_total - amount_paid),0) outstanding FROM invoices WHERE status IN ('unpaid','partial')`
    );
    const lowStock = await db.query(
      `SELECT p.name, i.stock_quantity, i.reorder_level FROM inventory i JOIN products p ON p.id=i.product_id
       WHERE i.stock_quantity <= i.reorder_level ORDER BY i.stock_quantity ASC LIMIT 10`
    );
    res.json({
      today_invoices: sales.rows[0].invoice_count,
      today_revenue: Number(sales.rows[0].revenue),
      outstanding_balance: Number(outstanding.rows[0].outstanding),
      low_stock: lowStock.rows
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/profit-loss', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const params = [];
    let dateFilter = '';
    if (start_date && end_date) { params.push(start_date, end_date); dateFilter = ` AND i.created_at::date BETWEEN $1 AND $2`; }
    const r = await db.query(
      `SELECT COALESCE(SUM(ii.line_total),0) AS revenue,
              COALESCE(SUM(ii.quantity * p.cost_price),0) AS cost
       FROM invoice_items ii
       JOIN invoices i ON i.id = ii.invoice_id
       JOIN products p ON p.id = ii.product_id
       WHERE i.status != 'void' ${dateFilter}`,
      params
    );
    const revenue = Number(r.rows[0].revenue), cost = Number(r.rows[0].cost);
    res.json({ revenue, cost, profit: revenue - cost });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/top-products', async (req, res) => {
  try {
    const r = await db.query(
      `SELECT ii.product_name, SUM(ii.quantity)::float AS qty_sold, SUM(ii.line_total) AS revenue
       FROM invoice_items ii JOIN invoices i ON i.id=ii.invoice_id
       WHERE i.status != 'void'
       GROUP BY ii.product_name ORDER BY revenue DESC LIMIT 10`
    );
    res.json(r.rows.map(x => ({ ...x, qty_sold: Number(x.qty_sold), revenue: Number(x.revenue) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
