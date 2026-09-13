const App = {
  currentUser: null,
  products: [],
  customers: [],
  invoiceItems: [],

  async init() {
    this.bindNav();
    this.bindLogin();
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) { this.currentUser = await res.json(); this.showApp(); }
    } catch (e) { /* not logged in */ }
  },

  bindLogin() {
    document.getElementById('login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) { document.getElementById('login-error').textContent = data.error; return; }
      this.currentUser = data.user;
      this.showApp();
    });
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      location.reload();
    });
  },

  showApp() {
    document.getElementById('login-screen').hidden = true;
    document.getElementById('app-screen').hidden = false;
    document.getElementById('current-user-name').textContent = `${this.currentUser.name} (${this.currentUser.role})`;
    this.loadDashboard();
  },

  bindNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.showView(btn.dataset.view));
    });
    document.getElementById('invoice-filter-btn').addEventListener('click', () => this.loadInvoices());
    document.getElementById('ni-add-item').addEventListener('click', () => this.addInvoiceItem());
    document.getElementById('ni-submit').addEventListener('click', () => this.submitInvoice());
    document.getElementById('ni-discount').addEventListener('input', () => this.renderInvoiceItems());
    document.getElementById('ni-tax').addEventListener('input', () => this.renderInvoiceItems());
    document.getElementById('new-product-btn').addEventListener('click', () => this.newProductModal());
    document.getElementById('new-customer-btn').addEventListener('click', () => this.newCustomerModal());
  },

  showView(view) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    if (view === 'dashboard') this.loadDashboard();
    if (view === 'invoices') this.loadInvoices();
    if (view === 'products') this.loadProducts();
    if (view === 'customers') this.loadCustomers();
    if (view === 'new-invoice') this.loadNewInvoiceForm();
    if (view === 'reports') this.loadReports();
  },

  async loadDashboard() {
    const d = await fetch('/api/reports/dashboard').then(r => r.json());
    document.getElementById('stat-invoices').textContent = d.today_invoices;
    document.getElementById('stat-revenue').textContent = `$${d.today_revenue.toFixed(2)}`;
    document.getElementById('stat-outstanding').textContent = `$${d.outstanding_balance.toFixed(2)}`;
    document.getElementById('low-stock-body').innerHTML = d.low_stock.map(p =>
      `<tr><td>${escapeHtml(p.name)}</td><td>${p.stock_quantity}</td><td>${p.reorder_level}</td></tr>`
    ).join('') || '<tr><td colspan="3">All stock levels healthy.</td></tr>';
  },

  async loadInvoices() {
    const search = document.getElementById('invoice-search').value;
    const status = document.getElementById('invoice-status-filter').value;
    const q = new URLSearchParams({ search, status }).toString();
    const rows = await fetch(`/api/invoices?${q}`).then(r => r.json());
    document.getElementById('invoices-body').innerHTML = rows.map(inv => `
      <tr>
        <td>${escapeHtml(inv.invoice_number)}</td>
        <td>${escapeHtml(inv.customer_name || 'Walk-in')}</td>
        <td>$${inv.grand_total.toFixed(2)}</td>
        <td>$${inv.amount_paid.toFixed(2)}</td>
        <td><span class="badge badge-${inv.status}">${inv.status}</span></td>
        <td>${new Date(inv.created_at).toLocaleDateString()}</td>
        <td>
          ${inv.status !== 'paid' && inv.status !== 'void' ? `<button class="btn-sm" onclick="App.recordPayment(${inv.id}, ${inv.grand_total - inv.amount_paid})">Record Payment</button>` : ''}
          ${this.currentUser.role === 'admin' && inv.status !== 'void' ? `<button class="btn-sm" onclick="App.voidInvoice(${inv.id})">Void</button>` : ''}
        </td>
      </tr>
    `).join('');
  },

  async recordPayment(id, remaining) {
    const amount = prompt(`Amount to record (remaining: $${remaining.toFixed(2)}):`, remaining.toFixed(2));
    if (!amount) return;
    await fetch(`/api/invoices/${id}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount) }) });
    this.loadInvoices();
  },

  async voidInvoice(id) {
    if (!confirm('Void this invoice and restock its items?')) return;
    await fetch(`/api/invoices/${id}/void`, { method: 'POST' });
    this.loadInvoices();
  },

  async loadProducts() {
    this.products = await fetch('/api/products').then(r => r.json());
    document.getElementById('products-body').innerHTML = this.products.map(p => `
      <tr>
        <td>${escapeHtml(p.sku)}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${escapeHtml(p.category_name || '-')}</td>
        <td>$${Number(p.cost_price).toFixed(2)}</td>
        <td>$${Number(p.sale_price).toFixed(2)}</td>
        <td>${p.stock_quantity}</td>
      </tr>
    `).join('');
  },

  async loadCustomers() {
    this.customers = await fetch('/api/customers').then(r => r.json());
    document.getElementById('customers-body').innerHTML = this.customers.map(c => `
      <tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || '-')}</td><td>${escapeHtml(c.email || '-')}</td></tr>
    `).join('');
  },

  async loadNewInvoiceForm() {
    if (!this.products.length) this.products = await fetch('/api/products').then(r => r.json());
    if (!this.customers.length) this.customers = await fetch('/api/customers').then(r => r.json());
    document.getElementById('ni-customer').innerHTML = this.customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    document.getElementById('ni-product-select').innerHTML = this.products.map(p => `<option value="${p.id}" data-price="${p.sale_price}">${escapeHtml(p.name)} ($${p.sale_price})</option>`).join('');
    this.invoiceItems = [];
    this.renderInvoiceItems();
  },

  addInvoiceItem() {
    const sel = document.getElementById('ni-product-select');
    const opt = sel.selectedOptions[0];
    if (!opt) return;
    const qty = Number(document.getElementById('ni-qty').value) || 1;
    const product = this.products.find(p => String(p.id) === opt.value);
    this.invoiceItems.push({ product_id: Number(opt.value), product_name: product.name, unit_price: Number(product.sale_price), quantity: qty });
    this.renderInvoiceItems();
  },

  renderInvoiceItems() {
    document.getElementById('ni-items-body').innerHTML = this.invoiceItems.map((it, i) => `
      <tr>
        <td>${escapeHtml(it.product_name)}</td>
        <td>$${it.unit_price.toFixed(2)}</td>
        <td>${it.quantity}</td>
        <td>$${(it.unit_price * it.quantity).toFixed(2)}</td>
        <td><button class="btn-sm" onclick="App.removeInvoiceItem(${i})">Remove</button></td>
      </tr>
    `).join('');
    const subtotal = this.invoiceItems.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const discount = Number(document.getElementById('ni-discount').value) || 0;
    const tax = Number(document.getElementById('ni-tax').value) || 0;
    document.getElementById('ni-grand-total').textContent = (subtotal - discount + tax).toFixed(2);
  },

  removeInvoiceItem(i) {
    this.invoiceItems.splice(i, 1);
    this.renderInvoiceItems();
  },

  async submitInvoice() {
    if (!this.invoiceItems.length) return alert('Add at least one item.');
    const body = {
      customer_id: Number(document.getElementById('ni-customer').value) || null,
      items: this.invoiceItems,
      discount: Number(document.getElementById('ni-discount').value) || 0,
      tax: Number(document.getElementById('ni-tax').value) || 0,
      amount_paid: Number(document.getElementById('ni-paid').value) || 0
    };
    const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    alert(`Invoice ${data.invoice_number} created.`);
    this.invoiceItems = [];
    this.products = [];
    this.showView('invoices');
  },

  async loadReports() {
    const pl = await fetch('/api/reports/profit-loss').then(r => r.json());
    document.getElementById('profit-loss-summary').innerHTML = `
      <div class="stat-card"><span class="stat-label">Revenue</span><span class="stat-value">$${pl.revenue.toFixed(2)}</span></div>
      <div class="stat-card"><span class="stat-label">Cost of Goods</span><span class="stat-value">$${pl.cost.toFixed(2)}</span></div>
      <div class="stat-card"><span class="stat-label">Profit</span><span class="stat-value">$${pl.profit.toFixed(2)}</span></div>
    `;
    const top = await fetch('/api/reports/top-products').then(r => r.json());
    document.getElementById('top-products-body').innerHTML = top.map(p =>
      `<tr><td>${escapeHtml(p.product_name)}</td><td>${p.qty_sold}</td><td>$${p.revenue.toFixed(2)}</td></tr>`
    ).join('');
  },

  newProductModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>New Product</h3>
          <input id="m-sku" placeholder="SKU">
          <input id="m-name" placeholder="Name">
          <input id="m-cost" type="number" placeholder="Cost Price">
          <input id="m-price" type="number" placeholder="Sale Price">
          <input id="m-stock" type="number" placeholder="Initial Stock" value="0">
          <div class="modal-actions">
            <button class="btn-sm" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
            <button class="primary-btn" onclick="App.saveProduct()">Save</button>
          </div>
        </div>
      </div>`;
  },

  async saveProduct() {
    const body = {
      sku: document.getElementById('m-sku').value,
      name: document.getElementById('m-name').value,
      cost_price: document.getElementById('m-cost').value,
      sale_price: document.getElementById('m-price').value,
      stock_quantity: document.getElementById('m-stock').value
    };
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return alert(data.error);
    document.getElementById('modal-root').innerHTML = '';
    this.loadProducts();
  },

  newCustomerModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <h3>New Customer</h3>
          <input id="m-cname" placeholder="Name">
          <input id="m-cphone" placeholder="Phone">
          <input id="m-cemail" placeholder="Email">
          <div class="modal-actions">
            <button class="btn-sm" onclick="document.getElementById('modal-root').innerHTML=''">Cancel</button>
            <button class="primary-btn" onclick="App.saveCustomer()">Save</button>
          </div>
        </div>
      </div>`;
  },

  async saveCustomer() {
    const body = { name: document.getElementById('m-cname').value, phone: document.getElementById('m-cphone').value, email: document.getElementById('m-cemail').value };
    const res = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return alert((await res.json()).error);
    document.getElementById('modal-root').innerHTML = '';
    this.loadCustomers();
  }
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

App.init();
