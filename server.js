require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const path = require('path');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 4100;

app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new pgSession({ pool: db, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'CHANGE_THIS_SECRET',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' }
}));
app.use(express.static(path.join(__dirname, 'public')));

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in.' });
  next();
};

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', requireAuth, require('./routes/products'));
app.use('/api/customers', requireAuth, require('./routes/customers'));
app.use('/api/invoices', requireAuth, require('./routes/invoices'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api/settings', requireAuth, require('./routes/settings'));

app.get('/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch (e) { res.status(503).json({ ok: false, database: 'disconnected' }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

db.ensureSchema()
  .catch(e => console.error('Schema self-check failed:', e.message))
  .finally(() => {
    app.listen(PORT, '0.0.0.0', () => console.log(`InvoStock running on port ${PORT}`));
  });
