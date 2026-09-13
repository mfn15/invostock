require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

const categories = ['Electronics', 'Groceries', 'Stationery', 'Apparel'];
const products = [
  ['EL-001', 'Wireless Mouse', 'Electronics', 8, 15, 40],
  ['EL-002', 'USB-C Cable 1m', 'Electronics', 2, 6, 100],
  ['EL-003', 'Bluetooth Speaker', 'Electronics', 20, 38, 25],
  ['GR-001', 'Rice 5kg Bag', 'Groceries', 6, 9, 60],
  ['GR-002', 'Cooking Oil 1L', 'Groceries', 3, 5, 80],
  ['ST-001', 'A4 Paper Ream', 'Stationery', 4, 7, 50],
  ['ST-002', 'Ballpoint Pen (Box of 10)', 'Stationery', 1.5, 3, 120],
  ['AP-001', 'Cotton T-Shirt', 'Apparel', 5, 12, 70],
];

(async () => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const adminHash = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD || 'admin123', 10);
    const staffHash = await bcrypt.hash(process.env.DEFAULT_STAFF_PASSWORD || 'staff123', 10);
    await client.query(`INSERT INTO users(username,password,role,name) VALUES($1,$2,'admin','Business Owner') ON CONFLICT(username) DO NOTHING`, ['admin', adminHash]);
    await client.query(`INSERT INTO users(username,password,role,name) VALUES($1,$2,'staff','Front Desk') ON CONFLICT(username) DO NOTHING`, ['staff', staffHash]);

    for (const name of categories) {
      await client.query(`INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO NOTHING`, [name]);
    }

    for (const [sku, name, cat, cost, price, stock] of products) {
      const c = await client.query('SELECT id FROM categories WHERE name=$1', [cat]);
      const r = await client.query(
        `INSERT INTO products(sku,name,category_id,cost_price,sale_price) VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(sku) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [sku, name, c.rows[0].id, cost, price]
      );
      await client.query(
        `INSERT INTO inventory(product_id,stock_quantity) VALUES($1,$2) ON CONFLICT(product_id) DO NOTHING`,
        [r.rows[0].id, stock]
      );
    }

    const existing = await client.query(`SELECT id FROM customers WHERE name='Walk-in Customer'`);
    if (!existing.rowCount) {
      await client.query(`INSERT INTO customers(name,phone,email) VALUES('Walk-in Customer','','')`);
    }

    await client.query('COMMIT');
    console.log('InvoStock demo data seeded successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    process.exitCode = 1;
  } finally {
    client.release();
    await db.end();
  }
})();
