const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'evelyn';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';
const CATEGORIES = ['Books','Electronics','Clothes','Food','Stationery','Accessories','Services','Other'];

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(cookie => {
    const parts = cookie.trim().split('=');
    return [parts.shift(), decodeURIComponent(parts.join('='))];
  }));
}
function isAdmin(req) { return parseCookies(req).mca_admin === 'yes'; }
function esc(value='') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const dbFile = path.join(__dirname, 'database.json');

function readProducts() {
  if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, JSON.stringify({ products: [], nextId: 1 }, null, 2));
  return JSON.parse(fs.readFileSync(dbFile, 'utf8'));
}
function saveProducts(data) { fs.writeFileSync(dbFile, JSON.stringify(data, null, 2)); }

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_'))
});
const upload = multer({ storage });

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

function layout(title, active, content) {
  const nav = [['/', 'Welcome'], ['/submit', 'Submit Product'], ['/products', 'Available Items'], ['/about', 'About Admin']]
    .map(([href, label]) => `<a class="${active === label ? 'active' : ''}" href="${href}">${label}</a>`).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${esc(title)}</title><link rel="stylesheet" href="/style.css" /></head><body><header class="topbar"><div class="brand"><div class="logo">MCA</div><div><h1>Malawi College of Accountancy Market Place</h1><p>Professional campus buying and selling platform</p></div></div><nav>${nav}</nav></header><main>${content}</main><footer><p>&copy; ${new Date().getFullYear()} Malawi College of Accountancy Market Place | Admin: Evelyn Chilaya</p></footer></body></html>`;
}
function categoryOptions(selected='', includeAll=false) {
  return `${includeAll ? `<option value="">All Categories</option>` : ''}${CATEGORIES.map(c => `<option value="${c}" ${selected === c ? 'selected' : ''}>${c}</option>`).join('')}`;
}

app.get('/', (req, res) => {
  res.send(layout('Welcome - MCA Market Place', 'Welcome', `<section class="welcome-only"><div class="welcome-card"><div class="welcome-badge">Student Marketplace</div><h2>Welcome to Malawi College of Accountancy Market Place</h2><p>A trusted place for MCA students to buy and sell approved products.</p></div></section>`));
});

app.get('/submit', (req, res) => {
  const success = req.query.success ? `<div class="alert success">Product submitted successfully. Please wait for admin approval before it appears for sale.</div>` : '';
  res.send(layout('Submit Product - MCA Market Place', 'Submit Product', `<section class="page-head"><h2>Submit Your Product</h2><p>Fill in the form below. The admin will review your post before it appears under Available Items.</p></section>${success}<form class="form-card" action="/submit" method="POST" enctype="multipart/form-data"><div class="note">Use a clear product picture, correct price and reachable phone number.</div><div class="grid-2"><label>Product Name<input name="product_name" required placeholder="e.g. Scientific calculator"></label><label>Category<select name="category" required>${categoryOptions('Books')}</select></label></div><div class="grid-2"><label>Price<input name="price" required placeholder="e.g. MK 25,000"></label><label>Product Image<input type="file" name="image" accept="image/*"></label></div><label>Product Description<textarea name="description" required placeholder="Describe condition, size, quantity, colour, or other important details"></textarea></label><h3>Poster Details</h3><div class="grid-2"><label>Poster Name<input name="seller_name" required placeholder="Full name"></label><label>Poster Phone<input name="seller_phone" required placeholder="e.g. 0990000000"></label></div><label>Poster Email<input type="email" name="seller_email" placeholder="optional@email.com"></label><h3>Payment Methods Accepted</h3><div class="checks"><label><input type="checkbox" name="payment_methods" value="Mpamba" checked> Mpamba</label><label><input type="checkbox" name="payment_methods" value="Airtel Money"> Airtel Money</label><label><input type="checkbox" name="payment_methods" value="Bank"> Bank</label></div><button type="submit">Submit Product for Approval</button></form>`));
});

app.post('/submit', upload.single('image'), (req, res) => {
  const b = req.body;
  const methods = Array.isArray(b.payment_methods) ? b.payment_methods.join(', ') : (b.payment_methods || 'Not specified');
  const data = readProducts();
  data.products.push({ id: data.nextId++, product_name: b.product_name, category: b.category, price: b.price, description: b.description, seller_name: b.seller_name, seller_phone: b.seller_phone, seller_email: b.seller_email || '', payment_methods: methods, image: req.file ? req.file.filename : '', status: 'pending', created_at: new Date().toISOString() });
  saveProducts(data); res.redirect('/submit?success=1');
});

app.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  let products = readProducts().products.filter(p => p.status === 'approved');
  if (category) products = products.filter(p => p.category === category);
  if (q) products = products.filter(p => [p.product_name,p.description,p.seller_name,p.price].join(' ').toLowerCase().includes(q));
  products.sort((a,b) => b.created_at.localeCompare(a.created_at));
  const cards = products.length ? products.map(productCard).join('') : `<div class="empty">No approved products match your search.</div>`;
  res.send(layout('Available Items - MCA Market Place', 'Available Items', `<section class="page-head"><h2>Items Available for Sale</h2><p>Search by product name, seller, price or description. You can also filter by category.</p></section><form class="filter-card" method="GET" action="/products"><input name="q" value="${esc(req.query.q || '')}" placeholder="Search products, sellers or prices"><select name="category">${categoryOptions(category, true)}</select><button type="submit">Search</button><a class="clear-link" href="/products">Clear</a></form><section class="category-strip">${CATEGORIES.map(c => `<a class="${category===c?'selected':''}" href="/products?category=${encodeURIComponent(c)}">${c}</a>`).join('')}</section><section class="product-grid">${cards}</section>`));
});

function productCard(p) {
  const img = p.image ? `/uploads/${esc(p.image)}` : '/placeholder.svg';
  return `<article class="product-card"><img src="${img}" alt="${esc(p.product_name)}"><div class="product-body"><span class="badge">${esc(p.category)}</span><h3>${esc(p.product_name)}</h3><p class="price">${esc(p.price)}</p><p>${esc(p.description)}</p><div class="seller"><strong>Poster Details</strong><p>Name: ${esc(p.seller_name)}</p><p>Phone: ${esc(p.seller_phone)}</p>${p.seller_email ? `<p>Email: ${esc(p.seller_email)}</p>` : ''}</div><p class="payment"><strong>Payment:</strong> ${esc(p.payment_methods)}</p></div></article>`;
}

app.get('/about', (req, res) => res.send(layout('About Admin - MCA Market Place', 'About Admin', `<section class="about-card"><h2>About the Admin</h2><p>This marketplace is managed by the admin, who reviews submitted products and approves them before they appear under Available Items.</p><div class="admin-info"><p><strong>Admin Name:</strong> EVELYN CHILAYA</p><p><strong>Contact:</strong> 0992200048</p><p><strong>Email:</strong> CH2772@MAC.AC.MW</p></div><a class="admin-link" href="/admin">Admin Approval Panel</a></section>`)));

app.get('/admin', (req, res) => {
  const error = req.query.error ? `<div class="alert error">Wrong admin username or password. Please try again.</div>` : '';
  if (!isAdmin(req)) return res.send(layout('Admin Login - MCA Market Place', '', `<section class="login-card"><h2>Admin Login</h2><p>Login to approve, edit, delete and manage marketplace products.</p>${error}<form method="POST" action="/admin/login"><label>Admin Username<input name="username" required></label><label>Admin Password<input type="password" name="password" required></label><button type="submit">Login</button></form><p class="hint">Demo login: username <strong>evelyn</strong> and password <strong>1234</strong>.</p></section>`));
  const data = readProducts();
  const pending = data.products.filter(p => p.status === 'pending').sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const approved = data.products.filter(p => p.status === 'approved').sort((a,b)=>b.created_at.localeCompare(a.created_at));
  const rejected = data.products.filter(p => p.status !== 'pending' && p.status !== 'approved').length;
  const pendingRows = pending.length ? pending.map(adminRow).join('') : '<p class="empty">No pending products.</p>';
  const approvedRows = approved.length ? approved.map(adminRow).join('') : '<p class="empty">No approved products yet.</p>';
  res.send(layout('Admin Panel - MCA Market Place', '', `<section class="page-head admin-head"><div><h2>Admin Dashboard</h2><p>Approve, edit and delete marketplace posts from one place.</p></div><form method="POST" action="/admin/logout"><button class="secondary">Logout</button></form></section><section class="stats-grid"><div class="stat"><span>${data.products.length}</span><p>Total Posts</p></div><div class="stat"><span>${pending.length}</span><p>Pending Approval</p></div><div class="stat"><span>${approved.length}</span><p>Approved Items</p></div><div class="stat"><span>${CATEGORIES.length}</span><p>Categories</p></div></section><h3 class="section-title">Pending Products Awaiting Approval</h3><div class="admin-list">${pendingRows}</div><h3 class="section-title">Approved Products Already Visible to Buyers</h3><div class="admin-list">${approvedRows}</div>`));
});

app.post('/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) { res.setHeader('Set-Cookie','mca_admin=yes; Path=/; HttpOnly; SameSite=Lax'); return res.redirect('/admin'); }
  res.redirect('/admin?error=1');
});
app.post('/admin/logout', (req, res) => { res.setHeader('Set-Cookie','mca_admin=; Path=/; Max-Age=0'); res.redirect('/admin'); });

function adminRow(p) {
  const img = p.image ? `/uploads/${esc(p.image)}` : '/placeholder.svg';
  return `<div class="admin-row"><img class="admin-thumb" src="${img}" alt="${esc(p.product_name)}"><div class="admin-details"><strong>${esc(p.product_name)}</strong><p>${esc(p.seller_name)} | ${esc(p.seller_phone)} | ${esc(p.price)}</p><p>${esc(p.description)}</p><span class="badge status-${esc(p.status)}">${esc(p.status)}</span></div><div class="actions">${p.status !== 'approved' ? `<form method="POST" action="/admin/${p.id}/approve"><button>Approve</button></form>` : ''}<a class="edit-btn" href="/admin/${p.id}/edit">Edit</a><form method="POST" action="/admin/${p.id}/delete" onsubmit="return confirm('Delete this product?')"><button class="danger">Delete</button></form></div></div>`;
}

app.post('/admin/:id/approve', (req, res) => { if(!isAdmin(req)) return res.redirect('/admin'); const data=readProducts(); const p=data.products.find(x=>String(x.id)===String(req.params.id)); if(p) p.status='approved'; saveProducts(data); res.redirect('/admin'); });
app.post('/admin/:id/delete', (req, res) => { if(!isAdmin(req)) return res.redirect('/admin'); const data=readProducts(); data.products=data.products.filter(p=>String(p.id)!==String(req.params.id)); saveProducts(data); res.redirect('/admin'); });

app.get('/admin/:id/edit', (req, res) => {
  if(!isAdmin(req)) return res.redirect('/admin');
  const product = readProducts().products.find(p => String(p.id) === String(req.params.id));
  if(!product) return res.redirect('/admin');
  res.send(layout('Edit Product - MCA Market Place', '', `<section class="page-head"><h2>Edit Product</h2><p>Update product details, category, status, image and seller information.</p></section><form class="form-card" action="/admin/${product.id}/edit" method="POST" enctype="multipart/form-data"><div class="grid-2"><label>Product Name<input name="product_name" value="${esc(product.product_name)}" required></label><label>Category<select name="category" required>${categoryOptions(product.category)}</select></label></div><div class="grid-2"><label>Price<input name="price" value="${esc(product.price)}" required></label><label>Status<select name="status"><option value="pending" ${product.status==='pending'?'selected':''}>pending</option><option value="approved" ${product.status==='approved'?'selected':''}>approved</option></select></label></div><label>Product Description<textarea name="description" required>${esc(product.description)}</textarea></label><div class="current-image"><img src="${product.image ? `/uploads/${esc(product.image)}` : '/placeholder.svg'}" alt="Current image"><p>Current product picture</p></div><label>Change Product Image<input type="file" name="image" accept="image/*"></label><h3>Poster Details</h3><div class="grid-2"><label>Poster Name<input name="seller_name" value="${esc(product.seller_name)}" required></label><label>Poster Phone<input name="seller_phone" value="${esc(product.seller_phone)}" required></label></div><label>Poster Email<input type="email" name="seller_email" value="${esc(product.seller_email || '')}"></label><label>Payment Methods<input name="payment_methods" value="${esc(product.payment_methods)}" required></label><button type="submit">Save Changes</button> <a class="clear-link" href="/admin">Back to Dashboard</a></form>`));
});

app.post('/admin/:id/edit', upload.single('image'), (req, res) => {
  if(!isAdmin(req)) return res.redirect('/admin');
  const data = readProducts(); const p = data.products.find(x => String(x.id) === String(req.params.id));
  if(p) { const b=req.body; p.product_name=b.product_name; p.category=b.category; p.price=b.price; p.description=b.description; p.seller_name=b.seller_name; p.seller_phone=b.seller_phone; p.seller_email=b.seller_email || ''; p.payment_methods=b.payment_methods; p.status=b.status; if(req.file) p.image=req.file.filename; }
  saveProducts(data); res.redirect('/admin');
});

app.listen(PORT, () => console.log(`MCA Market Place running at http://localhost:${PORT}`));
