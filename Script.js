/* ===========================================================
   DR VAPORS — application logic
   Modules: Age Confirmation, Login/Registration, Home, About,
   Product List, Product Rating, Wishlist, Shopping Cart,
   Order History, Order Tracking, User Profile,
   Notification & Messaging, Admin (Product/User/Order Mgmt)
=========================================================== */

const DB_KEY = 'drvapors_db_v1';
const PESO = n => '₱' + Number(n).toFixed(2);
const STAGES = ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

let db = null;          // in-memory mirror of localStorage
let currentEmail = null; // logged in user's email (sessionStorage)

/* ---------------- persistence ---------------- */
function loadDB(){
  const raw = localStorage.getItem(DB_KEY);
  db = raw ? JSON.parse(raw) : null;
}
function saveDB(){ localStorage.setItem(DB_KEY, JSON.stringify(db)); }

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function newUser({name,email,passHash,dob,role='customer'}){
  return {
    name, email, passHash, dob, address:'', phone:'',
    role, status:'active',
    wishlist:[], cart:[], notifications:[], chat:[], orderIds:[]
  };
}

async function ensureSeed(){
  loadDB();
  if(db) return;

  const products = [
    {id:1, name:'Frostbite Mint Disposable', category:'Disposables', price:349, stock:42, status:'Active', ratings:[5,4,5,5]},
    {id:2, name:'Cloudburst Mango Disposable', category:'Disposables', price:349, stock:6, status:'Active', ratings:[5,5,4]},
    {id:3, name:'Nimbus Pod Kit', category:'Mods & Kits', price:1290, stock:18, status:'Active', ratings:[4,5,4,4]},
    {id:4, name:'Ashfall Sub-Ohm Mod', category:'Mods & Kits', price:2450, stock:9, status:'Active', ratings:[5,5,5]},
    {id:5, name:'Vanilla Bean Custard 60ml', category:'E-Liquids', price:520, stock:31, status:'Active', ratings:[4,4,3,5]},
    {id:6, name:'Iced Watermelon 60ml', category:'E-Liquids', price:520, stock:0, status:'Active', ratings:[5,4]},
    {id:7, name:'Mesh Coil 5-Pack (0.4Ω)', category:'Coils', price:280, stock:54, status:'Active', ratings:[4,4,4]},
    {id:8, name:'Ceramic Coil 5-Pack (1.0Ω)', category:'Coils', price:310, stock:23, status:'Active', ratings:[3,4]},
    {id:9, name:'18650 Battery (Twin Pack)', category:'Batteries', price:480, stock:15, status:'Active', ratings:[5,5,4,5]},
    {id:10, name:'Magnetic Carry Case', category:'Accessories', price:220, stock:40, status:'Active', ratings:[4]},
  ];

  const adminHash = await sha256('Admin123!');
  const admin = newUser({name:'Store Admin', email:'admin@drvapors.com', passHash:adminHash, dob:'1990-01-01', role:'admin'});

  db = { users:{ [admin.email]: admin }, products, orders:[], nextOrderId:1001 };
  saveDB();
}

/* ---------------- helpers ---------------- */
function me(){ return currentEmail ? db.users[currentEmail] : null; }
function allProducts(){ return db.products; }
function productById(id){ return db.products.find(p => p.id === id); }
function avgRating(p){ return p.ratings.length ? p.ratings.reduce((a,b)=>a+b,0)/p.ratings.length : 0; }
function starString(avg){
  const full = Math.round(avg);
  return '★'.repeat(full) + '☆'.repeat(5-full);
}
function fmtDate(d){ return new Date(d).toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'}); }

function pushNotification(email, text){
  const u = db.users[email];
  if(!u) return;
  u.notifications.unshift({id:Date.now()+Math.random(), text, ts:Date.now(), read:false});
  saveDB();
}

function showToast(title, msg){
  const stack = document.getElementById('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${title}</b>${msg}`;
  stack.appendChild(el);
  setTimeout(()=> el.remove(), 4200);
}

/* ---------------- AGE CONFIRMATION MODULE ---------------- */
function initAgeGate(){
  const gate = document.getElementById('age-gate');
  if(sessionStorage.getItem('drvapors_age_verified') === 'true'){
    gate.classList.add('hidden');
    afterAgeVerified();
    return;
  }
  document.getElementById('age-yes').addEventListener('click', ()=>{
    sessionStorage.setItem('drvapors_age_verified','true');
    gate.classList.add('hidden');
    afterAgeVerified();
  });
  document.getElementById('age-no').addEventListener('click', ()=>{
    document.querySelector('.age-actions').classList.add('hidden');
    document.getElementById('age-blocked-msg').classList.remove('hidden');
  });
}
function afterAgeVerified(){
  const savedUser = sessionStorage.getItem('drvapors_current_user');
  if(savedUser && db.users[savedUser]){
    currentEmail = savedUser;
    enterApp();
  } else {
    document.getElementById('auth-page').classList.remove('hidden');
  }
}

/* ---------------- LOGIN / REGISTRATION MODULE ---------------- */
function initAuth(){
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabLogin.addEventListener('click', ()=>{
    tabLogin.classList.add('active'); tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
  });
  tabRegister.addEventListener('click', ()=>{
    tabRegister.classList.add('active'); tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
  });

  registerForm.addEventListener('submit', async e =>{
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const dob = document.getElementById('reg-dob').value;
    const pw = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    const emailErr = document.getElementById('reg-email-error');
    const pwErr = document.getElementById('reg-password-error');
    const msg = document.getElementById('register-msg');
    emailErr.textContent = ''; pwErr.textContent = ''; msg.textContent = ''; msg.className='auth-msg';

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRe.test(email)){ emailErr.textContent = 'Enter a valid email address.'; return; }
    if(db.users[email]){ emailErr.textContent = 'An account with this email already exists.'; return; }
    if(pw !== confirm){ pwErr.textContent = 'Passwords do not match.'; return; }
    if(pw.length < 6){ pwErr.textContent = 'Password must be at least 6 characters.'; return; }
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / 3.15576e10);
    if(!dob || age < 18){ pwErr.textContent = 'You must be 18 or older to register.'; return; }

    const passHash = await sha256(pw);
    db.users[email] = newUser({name, email, passHash, dob});
    pushNotification(email, `Welcome to Dr Vapors, ${name.split(' ')[0]}! Your account is verified.`);
    saveDB();

    msg.textContent = 'Account created — you can now log in.'; msg.classList.add('ok');
    registerForm.reset();
    setTimeout(()=> tabLogin.click(), 900);
  });

  loginForm.addEventListener('submit', async e =>{
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const pw = document.getElementById('login-password').value;
    const err = document.getElementById('login-error');
    const msg = document.getElementById('login-msg');
    err.textContent=''; msg.textContent=''; msg.className='auth-msg';

    const u = db.users[email];
    if(!u){ err.textContent = 'Invalid email or password.'; return; }
    const hash = await sha256(pw);
    if(hash !== u.passHash){ err.textContent = 'Invalid email or password.'; return; }
    if(u.status === 'suspended'){ err.textContent = 'This account has been suspended.'; return; }

    msg.textContent = `Welcome back, ${u.name.split(' ')[0]}!`; msg.classList.add('ok');
    currentEmail = email;
    sessionStorage.setItem('drvapors_current_user', email);
    setTimeout(enterApp, 400);
  });

  document.getElementById('logout-btn').addEventListener('click', ()=>{
    sessionStorage.removeItem('drvapors_current_user');
    currentEmail = null;
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('login-form').reset();
  });
}

/* ---------------- APP SHELL / NAV ---------------- */
function enterApp(){
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  const u = me();
  document.getElementById('topbar-username').textContent = u.name.split(' ')[0];
  document.getElementById('admin-nav-btn').classList.toggle('hidden', u.role !== 'admin');
  showPage('home');
}

function showPage(name){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelectorAll('.navlinks button').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  renderAll();
  window.scrollTo({top:0, behavior:'smooth'});
}

function initNav(){
  document.querySelectorAll('[data-nav]').forEach(el => el.addEventListener('click', ()=> showPage(el.dataset.nav)));
}

/* ---------------- render orchestration ---------------- */
function renderAll(){
  if(!me()) return;
  renderBadges();
  renderHome();
  renderShop();
  renderWishlist();
  renderCart();
  renderOrders();
  renderProfile();
  renderNotifications();
  renderChat();
  if(me().role === 'admin') renderAdmin();
}

function renderBadges(){
  const u = me();
  const cartBadge = document.getElementById('cart-badge');
  const wishBadge = document.getElementById('wishlist-badge');
  const notifBadge = document.getElementById('notif-badge');
  const cartCount = u.cart.reduce((s,i)=> s+i.qty, 0);
  const unread = u.notifications.filter(n=>!n.read).length;

  cartBadge.textContent = cartCount; cartBadge.classList.toggle('hidden', cartCount===0);
  wishBadge.textContent = u.wishlist.length; wishBadge.classList.toggle('hidden', u.wishlist.length===0);
  notifBadge.textContent = unread; notifBadge.classList.toggle('hidden', unread===0);
}

/* ---------------- PRODUCT CARD (shared: Product List + Rating + Wishlist) ---------------- */
function productCard(p){
  const u = me();
  const avg = avgRating(p);
  const wished = u.wishlist.includes(p.id);
  const low = p.stock > 0 && p.stock <= 8;
  const out = p.stock === 0;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <button class="wish-btn ${wished?'active':''}" data-wish="${p.id}">${wished ? '♥' : '♡'}</button>
    <div class="swatch">${p.name.split(' ').map(w=>w[0]).slice(0,2).join('')}</div>
    <div class="cat">${p.category}</div>
    <h3>${p.name}</h3>
    <div class="stars">${starString(avg)}<span class="count">${avg.toFixed(1)} (${p.ratings.length})</span></div>
    <div class="rate-row" data-rate-for="${p.id}">
      ${[1,2,3,4,5].map(n=>`<span class="rate-star" data-star="${n}">★</span>`).join('')}
    </div>
    <div class="price-row">
      <span class="price">${PESO(p.price)}</span>
      <span class="stock ${low||out?'low':''}">${out ? 'Out of stock' : low ? p.stock+' left' : p.stock+' in stock'}</span>
    </div>
    <button class="btn small block" data-addcart="${p.id}" ${out?'disabled':''}>${out?'Unavailable':'Add to cart'}</button>
  `;

  card.querySelector('[data-wish]').addEventListener('click', ()=> toggleWishlist(p.id));
  card.querySelectorAll('[data-star]').forEach(star=>{
    star.addEventListener('click', ()=> rateProduct(p.id, Number(star.dataset.star)));
  });
  if(!out) card.querySelector('[data-addcart]').addEventListener('click', ()=> addToCart(p.id));
  return card;
}

function rateProduct(id, value){
  const p = productById(id);
  p.ratings.push(value);
  saveDB();
  showToast('Rating submitted', `You rated ${p.name} ${value}★`);
  renderShop(); renderHome(); renderWishlist();
}

/* ---------------- HOME MODULE ---------------- */
function renderHome(){
  document.getElementById('stat-products').textContent = db.products.reduce((s,p)=>s+p.stock,0) > 0 ? db.products.length : db.products.length;
  const allRatings = db.products.flatMap(p=>p.ratings);
  const overall = allRatings.length ? allRatings.reduce((a,b)=>a+b,0)/allRatings.length : 0;
  document.getElementById('stat-rating').textContent = overall.toFixed(1);
  document.getElementById('stat-members').textContent = Object.keys(db.users).length;

  const featured = [...db.products]
    .filter(p=>p.status==='Active')
    .sort((a,b)=> avgRating(b)-avgRating(a) || b.ratings.length-a.ratings.length)
    .slice(0,4);
  const grid = document.getElementById('featured-grid');
  grid.innerHTML = '';
  featured.forEach(p => grid.appendChild(productCard(p)));
}

/* ---------------- PRODUCT LIST MODULE ---------------- */
let activeCategory = 'All';
function renderShop(){
  const cats = ['All', ...new Set(db.products.map(p=>p.category))];
  const chipRow = document.getElementById('category-chips');
  chipRow.innerHTML = '';
  cats.forEach(c=>{
    const chip = document.createElement('button');
    chip.className = 'chip' + (c===activeCategory?' active':'');
    chip.textContent = c;
    chip.addEventListener('click', ()=>{ activeCategory = c; renderShop(); });
    chipRow.appendChild(chip);
  });

  const list = db.products.filter(p => p.status==='Active' && (activeCategory==='All' || p.category===activeCategory));
  document.getElementById('shop-count-sub').textContent = `${list.length} product${list.length!==1?'s':''}`;
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  if(list.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><b>No products here</b>Try a different category.</div>`;
    return;
  }
  list.forEach(p => grid.appendChild(productCard(p)));
}

/* ---------------- WISHLIST MODULE ---------------- */
function toggleWishlist(id){
  const u = me();
  const i = u.wishlist.indexOf(id);
  if(i === -1){ u.wishlist.push(id); showToast('Added to wishlist', productById(id).name); }
  else { u.wishlist.splice(i,1); }
  saveDB();
  renderShop(); renderHome(); renderWishlist(); renderBadges();
}

function renderWishlist(){
  const u = me();
  const grid = document.getElementById('wishlist-grid');
  grid.innerHTML = '';
  if(u.wishlist.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><b>Your wishlist is empty</b>Tap the heart on any product to save it here.</div>`;
    return;
  }
  u.wishlist.forEach(id=>{
    const p = productById(id);
    if(p) grid.appendChild(productCard(p));
  });
}

/* ---------------- SHOPPING CART MODULE ---------------- */
function addToCart(id){
  const u = me();
  const line = u.cart.find(l => l.productId === id);
  const p = productById(id);
  const inCart = line ? line.qty : 0;
  if(inCart >= p.stock){ showToast('Stock limit reached', `Only ${p.stock} of ${p.name} available.`); return; }
  if(line) line.qty += 1; else u.cart.push({productId:id, qty:1});
  saveDB();
  showToast('Added to cart', p.name);
  renderCart(); renderBadges();
}

function renderCart(){
  const u = me();
  const wrap = document.getElementById('cart-list');
  wrap.innerHTML = '';
  if(u.cart.length === 0){
    wrap.innerHTML = `<div class="empty-state"><b>Your cart is empty</b>Head to the shop to add some products.</div>`;
  } else {
    u.cart.forEach(line=>{
      const p = productById(line.productId);
      if(!p) return;
      const row = document.createElement('div');
      row.className = 'line-item';
      row.innerHTML = `
        <div><div class="name">${p.name}</div><div class="meta">${PESO(p.price)} each</div></div>
        <div class="qty-ctrl">
          <button data-dec="${p.id}">−</button>
          <span>${line.qty}</span>
          <button data-inc="${p.id}">+</button>
        </div>
        <div class="sub">${PESO(p.price*line.qty)}</div>
        <button class="remove-x" data-remove="${p.id}">✕</button>
      `;
      row.querySelector('[data-inc]').addEventListener('click', ()=> changeQty(p.id, 1));
      row.querySelector('[data-dec]').addEventListener('click', ()=> changeQty(p.id, -1));
      row.querySelector('[data-remove]').addEventListener('click', ()=> removeFromCart(p.id));
      wrap.appendChild(row);
    });
  }
  const subtotal = u.cart.reduce((s,l)=> s + (productById(l.productId)?.price || 0) * l.qty, 0);
  const delivery = subtotal > 0 ? 60 : 0;
  document.getElementById('cart-subtotal').textContent = PESO(subtotal);
  document.getElementById('cart-delivery').textContent = PESO(delivery);
  document.getElementById('cart-total').textContent = PESO(subtotal+delivery);
  document.getElementById('checkout-btn').disabled = u.cart.length===0;
}

function changeQty(id, delta){
  const u = me();
  const line = u.cart.find(l=>l.productId===id);
  const p = productById(id);
  if(!line) return;
  const next = line.qty + delta;
  if(next <= 0){ removeFromCart(id); return; }
  if(next > p.stock){ showToast('Stock limit reached', `Only ${p.stock} available.`); return; }
  line.qty = next;
  saveDB(); renderCart(); renderBadges();
}
function removeFromCart(id){
  const u = me();
  u.cart = u.cart.filter(l=>l.productId!==id);
  saveDB(); renderCart(); renderBadges();
}

function checkout(){
  const u = me();
  if(u.cart.length===0) return;
  if(!u.address){ showToast('Add a delivery address', 'Save an address on your Profile page before checking out.'); showPage('profile'); return; }

  const items = u.cart.map(l=>{
    const p = productById(l.productId);
    p.stock -= l.qty;
    return {productId:p.id, name:p.name, price:p.price, qty:l.qty};
  });
  const subtotal = items.reduce((s,i)=>s+i.price*i.qty,0);
  const delivery = 60;
  const order = {
    id: 'DV-' + db.nextOrderId++,
    customerEmail: currentEmail,
    items, subtotal, delivery, total: subtotal+delivery,
    date: Date.now(), statusIndex: 0
  };
  db.orders.push(order);
  u.orderIds.push(order.id);
  u.cart = [];
  pushNotification(currentEmail, `Order ${order.id} placed — ${PESO(order.total)}. We'll notify you as it ships.`);
  saveDB();
  showToast('Order placed', order.id);
  showPage('orders');
}

/* ---------------- ORDER HISTORY + TRACKING MODULES ---------------- */
let expandedOrder = null;
function renderOrders(){
  const u = me();
  const wrap = document.getElementById('orders-list');
  wrap.innerHTML = '';
  const orders = db.orders.filter(o=>o.customerEmail===currentEmail).sort((a,b)=>b.date-a.date);
  if(orders.length===0){
    wrap.innerHTML = `<div class="empty-state"><b>No orders yet</b>Your past and current orders will show up here.</div>`;
    return;
  }
  orders.forEach(o=>{
    const statusClass = ['placed','processing','shipped','out','delivered'][o.statusIndex];
    const card = document.createElement('div');
    card.className = 'order-card';
    card.innerHTML = `
      <div class="order-head">
        <div><div class="order-id">${o.id}</div><div class="order-date">${fmtDate(o.date)} · ${o.items.reduce((s,i)=>s+i.qty,0)} item(s)</div></div>
        <span class="status-pill ${statusClass}">${STAGES[o.statusIndex]}</span>
      </div>
      <div class="track-wrap hidden">
        <div class="track-steps">
          ${STAGES.map((s,i)=>`<div class="track-step ${i<=o.statusIndex?'done':''}"><div class="line"></div><div class="dot"></div><small>${s}</small></div>`).join('')}
        </div>
        <div class="order-items">
          ${o.items.map(i=>`<div><span>${i.name} × ${i.qty}</span><span>${PESO(i.price*i.qty)}</span></div>`).join('')}
          <div style="border-top:1px solid var(--border); margin-top:6px; padding-top:6px; color:var(--text)"><span>Total</span><span>${PESO(o.total)}</span></div>
        </div>
      </div>
    `;
    const trackWrap = card.querySelector('.track-wrap');
    if(expandedOrder === o.id) trackWrap.classList.remove('hidden');
    card.querySelector('.order-head').addEventListener('click', ()=>{
      expandedOrder = expandedOrder === o.id ? null : o.id;
      renderOrders();
    });
    wrap.appendChild(card);
  });
}

/* ---------------- USER PROFILE MODULE ---------------- */
function renderProfile(){
  const u = me();
  document.getElementById('avatar-initial').textContent = u.name[0].toUpperCase();
  document.getElementById('profile-name-display').textContent = u.name;
  document.getElementById('profile-email-display').textContent = u.email;
  document.getElementById('profile-role-tag').textContent = u.role;
  document.getElementById('profile-role-tag').classList.toggle('admin', u.role==='admin');
  document.getElementById('profile-name').value = u.name;
  document.getElementById('profile-address').value = u.address;
  document.getElementById('profile-phone').value = u.phone;
}
function initProfileForm(){
  document.getElementById('profile-form').addEventListener('submit', e=>{
    e.preventDefault();
    const u = me();
    u.name = document.getElementById('profile-name').value.trim() || u.name;
    u.address = document.getElementById('profile-address').value.trim();
    u.phone = document.getElementById('profile-phone').value.trim();
    saveDB();
    document.getElementById('topbar-username').textContent = u.name.split(' ')[0];
    const msg = document.getElementById('profile-msg');
    msg.textContent = 'Profile updated successfully.';
    renderProfile();
    setTimeout(()=> msg.textContent='', 2500);
  });
}

/* ---------------- NOTIFICATION & MESSAGING MODULE ---------------- */
function renderNotifications(){
  const u = me();
  const wrap = document.getElementById('notif-list');
  wrap.innerHTML = '';
  if(u.notifications.length===0){
    wrap.innerHTML = `<div class="empty-state"><b>No notifications</b>Order and promo updates will appear here.</div>`;
    return;
  }
  u.notifications.forEach(n=>{
    const el = document.createElement('div');
    el.className = 'notif-item' + (n.read?'':' unread');
    el.innerHTML = `${n.read?'':'<div class="dotmark"></div>'}<div class="txt">${n.text}<small>${new Date(n.ts).toLocaleString()}</small></div>`;
    wrap.appendChild(el);
  });
}
function initNotifControls(){
  document.getElementById('mark-read-btn').addEventListener('click', ()=>{
    me().notifications.forEach(n=> n.read = true);
    saveDB(); renderNotifications(); renderBadges();
  });
}

/* live chat: simple FIFO-processed queue with an automated reply */
function renderChat(){
  const u = me();
  const thread = document.getElementById('chat-thread');
  thread.innerHTML = '';
  if(u.chat.length===0){
    thread.innerHTML = `<div class="chat-msg system">Hi ${u.name.split(' ')[0]}! Ask us about orders, restocks or products.</div>`;
  }
  u.chat.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'chat-msg ' + m.from;
    el.textContent = m.text;
    thread.appendChild(el);
  });
  thread.scrollTop = thread.scrollHeight;
}
function initChat(){
  document.getElementById('chat-form').addEventListener('submit', e=>{
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text) return;
    const u = me();
    u.chat.push({from:'user', text, ts:Date.now()});
    saveDB(); renderChat();
    input.value = '';
    setTimeout(()=>{
      const reply = autoReply(text);
      u.chat.push({from:'system', text:reply, ts:Date.now()});
      saveDB(); renderChat();
    }, 700);
  });
}
function autoReply(text){
  const t = text.toLowerCase();
  if(t.includes('order') || t.includes('track')) return "You can track any order's live status from the Orders tab — tap an order to expand it.";
  if(t.includes('restock') || t.includes('stock')) return "We restock weekly. Add the item to your Wishlist and we'll flag it once it's back.";
  if(t.includes('refund') || t.includes('return')) return "Reach out with your order ID and our team will sort out a return within 24 hours.";
  return "Thanks for reaching out — a Dr Vapors team member will follow up shortly.";
}

/* ---------------- ADMIN: PRODUCT / USER / ORDER MANAGEMENT ---------------- */
function initAdminTabs(){
  document.querySelectorAll('[data-admin-tab]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('[data-admin-tab]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      ['products','users','orders'].forEach(t=>{
        document.getElementById('admin-'+t).classList.toggle('hidden', t !== btn.dataset.adminTab);
      });
    });
  });
}

function renderAdmin(){
  renderAdminProducts();
  renderAdminUsers();
  renderAdminOrders();
}

function renderAdminProducts(){
  const body = document.getElementById('admin-products-body');
  body.innerHTML = '';
  db.products.forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td><input type="number" min="0" step="0.01" value="${p.price}" data-field="price" style="width:80px; background:var(--bg-alt); border:1px solid var(--border); color:var(--text); border-radius:3px; padding:4px 6px"></td>
      <td><input type="number" min="0" value="${p.stock}" data-field="stock" style="width:60px; background:var(--bg-alt); border:1px solid var(--border); color:var(--text); border-radius:3px; padding:4px 6px"></td>
      <td>
        <select class="status-select" data-field="status">
          <option ${p.status==='Active'?'selected':''}>Active</option>
          <option ${p.status==='Inactive'?'selected':''}>Inactive</option>
        </select>
      </td>
      <td>${avgRating(p).toFixed(1)} (${p.ratings.length})</td>
      <td><button class="btn danger small" data-del="${p.id}">Delete</button></td>
    `;
    tr.querySelector('[data-field="price"]').addEventListener('change', e=>{ p.price = Number(e.target.value); saveDB(); renderAll(); });
    tr.querySelector('[data-field="stock"]').addEventListener('change', e=>{ p.stock = Number(e.target.value); saveDB(); renderAll(); });
    tr.querySelector('[data-field="status"]').addEventListener('change', e=>{ p.status = e.target.value; saveDB(); renderAll(); });
    tr.querySelector('[data-del]').addEventListener('click', ()=>{
      db.products = db.products.filter(x=>x.id!==p.id);
      saveDB(); renderAll();
    });
    body.appendChild(tr);
  });
}
function initAdminProductForm(){
  document.getElementById('product-form').addEventListener('submit', e=>{
    e.preventDefault();
    const name = document.getElementById('pf-name').value.trim();
    const category = document.getElementById('pf-category').value.trim();
    const price = Number(document.getElementById('pf-price').value);
    const stock = Number(document.getElementById('pf-stock').value);
    if(!name || !category) return;
    const id = Math.max(0, ...db.products.map(p=>p.id)) + 1;
    db.products.push({id, name, category, price, stock, status:'Active', ratings:[]});
    saveDB();
    e.target.reset();
    renderAll();
    showToast('Product added', name);
  });
}

function renderAdminUsers(){
  const body = document.getElementById('admin-users-body');
  body.innerHTML = '';
  Object.values(db.users).forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td><span class="role-tag ${u.role==='admin'?'admin':''}">${u.role}</span></td>
      <td>
        <select class="status-select" data-ufield="status" ${u.email===currentEmail?'disabled':''}>
          <option ${u.status==='active'?'selected':''}>active</option>
          <option ${u.status==='suspended'?'selected':''}>suspended</option>
        </select>
      </td>
      <td>${u.orderIds.length}</td>
    `;
    const sel = tr.querySelector('[data-ufield="status"]');
    if(sel) sel.addEventListener('change', e=>{ u.status = e.target.value; saveDB(); showToast('User updated', `${u.name} marked ${u.status}`); });
    body.appendChild(tr);
  });
}

function renderAdminOrders(){
  const body = document.getElementById('admin-orders-body');
  body.innerHTML = '';
  const orders = [...db.orders].sort((a,b)=>b.date-a.date);
  if(orders.length===0){
    body.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted)">No orders placed yet.</td></tr>`;
    return;
  }
  orders.forEach(o=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${o.id}</td>
      <td>${db.users[o.customerEmail]?.name || o.customerEmail}</td>
      <td>${fmtDate(o.date)}</td>
      <td>${PESO(o.total)}</td>
      <td>
        <select class="status-select" data-oid="${o.id}">
          ${STAGES.map((s,i)=>`<option value="${i}" ${o.statusIndex===i?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
    `;
    tr.querySelector('select').addEventListener('change', e=>{
      o.statusIndex = Number(e.target.value);
      saveDB();
      pushNotification(o.customerEmail, `Order ${o.id} is now: ${STAGES[o.statusIndex]}.`);
      showToast('Order updated', `${o.id} → ${STAGES[o.statusIndex]}`);
      renderAll();
    });
    body.appendChild(tr);
  });
}

/* ---------------- boot ---------------- */
async function boot(){
  await ensureSeed();
  document.getElementById('year').textContent = new Date().getFullYear();
  initAgeGate();
  initAuth();
  initNav();
  initProfileForm();
  initNotifControls();
  initChat();
  initAdminTabs();
  initAdminProductForm();
  document.getElementById('checkout-btn').addEventListener('click', checkout);
}
document.addEventListener('DOMContentLoaded', boot);
