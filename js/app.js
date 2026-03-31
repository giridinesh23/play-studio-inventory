/**
 * Play Studio Bhutan - Main Application Logic
 * Navigation, state management, screen renderers, event handling
 */

// ============ STATE ============

const AppState = {
  currentUser: JSON.parse(localStorage.getItem('ps_user') || 'null'),
  currentScreen: 'login',
  items: [],
  users: [],
  dashboardStats: null,
  selectedItem: null,
  editingItem: null,
  editingUser: null,
  filters: { category: '', condition: '', search: '' }
};

// ============ TOAST NOTIFICATIONS ============

const Toast = {
  show(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const icons = { success: '&#10003;', error: '&#10007;', warning: '&#9888;', info: '&#8505;' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-12px)';
      toast.style.transition = 'all 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Make Toast globally available for api.js
window.Toast = Toast;

// ============ NAVIGATION ============

function navigate(screen, data = null) {
  // Auth guard
  if (screen !== 'login' && screen !== 'settings' && !AppState.currentUser) {
    screen = 'login';
  }

  // Role guard
  const adminOnly = ['add-item', 'reports', 'users'];
  if (adminOnly.includes(screen) && AppState.currentUser?.role !== 'admin') {
    Toast.show('Admin access required', 'error');
    return;
  }

  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // Show target screen
  const target = document.getElementById(`screen-${screen}`);
  if (target) {
    target.classList.add('active');
  }

  AppState.currentScreen = screen;

  // Update bottom nav
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.screen === screen);
  });

  // Show/hide nav and header based on screen
  const isLogin = screen === 'login';
  document.getElementById('bottom-nav').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('app-header').style.display = isLogin ? 'none' : 'flex';
  document.querySelector('.app-content').style.marginTop = isLogin ? '0' : '';

  // Load screen data
  loadScreenData(screen, data);
}

async function loadScreenData(screen, data) {
  try {
    switch (screen) {
      case 'dashboard':
        await renderDashboard();
        break;
      case 'inventory':
        await renderInventory();
        break;
      case 'item-detail':
        if (data?.id || data?.barcode) await renderItemDetail(data);
        break;
      case 'scan':
        Scanner.start();
        break;
      case 'checkout':
        renderCheckoutForm(data);
        break;
      case 'checkin':
        renderCheckinScreen(data);
        break;
      case 'maintenance':
        renderMaintenanceForm(data);
        break;
      case 'add-item':
        await renderAddEditItem(data);
        break;
      case 'barcode-print':
        renderBarcodePrint(data);
        break;
      case 'reports':
        renderReports();
        break;
      case 'users':
        await renderUserManagement();
        break;
    }
  } catch (error) {
    Toast.show(error.message, 'error');
  }
}

// ============ CATEGORY HELPERS ============

const CATEGORIES = ['Audio', 'Lighting', 'Cables & Accessories', 'Microphones & Stands'];

function getCategoryIcon(cat) {
  const icons = {
    'Audio': '&#127911;',
    'Lighting': '&#128161;',
    'Cables & Accessories': '&#128268;',
    'Microphones & Stands': '&#127908;'
  };
  return icons[cat] || '&#128230;';
}

function getCategoryClass(cat) {
  if (cat?.includes('Audio')) return 'audio';
  if (cat?.includes('Light')) return 'lighting';
  if (cat?.includes('Cable')) return 'cables';
  if (cat?.includes('Micro')) return 'microphones';
  return 'audio';
}

function getConditionBadge(condition) {
  const map = {
    'Available': 'badge-available',
    'Checked Out': 'badge-checked-out',
    'Under Repair': 'badge-repair',
    'Retired': 'badge-retired'
  };
  return `<span class="badge ${map[condition] || 'badge-available'}">${condition || 'Available'}</span>`;
}

function getStatusBadge(status) {
  const map = {
    'Checked Out': 'badge-checked-out',
    'Returned': 'badge-returned',
    'Open': 'badge-active',
    'Resolved': 'badge-resolved'
  };
  return `<span class="badge ${map[status] || 'badge-active'}">${status}</span>`;
}

// ============ LOGIN ============

async function initLogin() {
  const select = document.getElementById('login-user-select');
  select.innerHTML = '<option value="">Select your name...</option>';

  try {
    const users = await API.getUsers();
    AppState.users = users;
    users.filter(u => String(u.active).toLowerCase() !== 'false').forEach(u => {
      select.innerHTML += `<option value="${u.name}">${u.name}</option>`;
    });
  } catch (e) {
    Toast.show('Cannot load users. Check API URL.', 'error');
  }
}

function setupPinInputs() {
  const pins = document.querySelectorAll('.pin-digit');
  pins.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val.slice(0, 1);
      if (val && i < pins.length - 1) {
        pins[i + 1].focus();
      }
      // Auto-submit when all 4 filled
      if (i === pins.length - 1 && val) {
        handleLogin();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value && i > 0) {
        pins[i - 1].focus();
      }
    });
  });
}

async function handleLogin() {
  const name = document.getElementById('login-user-select').value;
  const pins = document.querySelectorAll('.pin-digit');
  const pin = Array.from(pins).map(p => p.value).join('');

  if (!name) {
    Toast.show('Please select your name', 'warning');
    return;
  }
  if (pin.length !== 4) {
    Toast.show('Enter 4-digit PIN', 'warning');
    return;
  }

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const user = await API.validatePin(name, pin);
    AppState.currentUser = user;
    localStorage.setItem('ps_user', JSON.stringify(user));
    // Clear PIN
    pins.forEach(p => p.value = '');
    Toast.show(`Welcome, ${user.name}!`, 'success');
    navigate('dashboard');
  } catch (e) {
    Toast.show(e.message, 'error');
    pins.forEach(p => p.value = '');
    pins[0].focus();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

function logout() {
  AppState.currentUser = null;
  localStorage.removeItem('ps_user');
  navigate('login');
  initLogin();
}

// ============ DASHBOARD ============

async function renderDashboard() {
  const container = document.getElementById('dashboard-content');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading...</div>';

  try {
    const stats = await API.getDashboardStats();
    AppState.dashboardStats = stats;

    let alertsHtml = '';
    if (stats.overdueItems?.length || stats.dueTodayItems?.length) {
      alertsHtml = '<div class="alerts-section"><div class="section-title">&#9888; Alerts</div>';

      (stats.overdueItems || []).forEach(item => {
        alertsHtml += `
          <div class="alert-item" onclick="navigateToItemByCheckout('${item.item_id}')">
            <span class="alert-icon">&#128308;</span>
            <div class="alert-text">
              <strong>${item.item_name}</strong><br>
              Overdue &middot; Expected: ${item.expected_return_date} &middot; ${item.client_name}
            </div>
          </div>`;
      });

      (stats.dueTodayItems || []).forEach(item => {
        alertsHtml += `
          <div class="alert-item warning" onclick="navigateToItemByCheckout('${item.item_id}')">
            <span class="alert-icon">&#128992;</span>
            <div class="alert-text">
              <strong>${item.item_name}</strong><br>
              Due today &middot; ${item.client_name}
            </div>
          </div>`;
      });

      alertsHtml += '</div>';
    }

    container.innerHTML = `
      <div class="summary-grid">
        <div class="summary-card total">
          <div class="count">${stats.totalItems}</div>
          <div class="label">Total Items</div>
        </div>
        <div class="summary-card checked-out">
          <div class="count">${stats.checkedOut}</div>
          <div class="label">Checked Out</div>
        </div>
        <div class="summary-card repair">
          <div class="count">${stats.underRepair}</div>
          <div class="label">Under Repair</div>
        </div>
        <div class="summary-card overdue">
          <div class="count">${stats.overdue}</div>
          <div class="label">Overdue</div>
        </div>
      </div>

      ${alertsHtml}

      <div class="section-title">Quick Actions</div>
      <div class="quick-actions">
        <button class="quick-action-btn" onclick="navigate('scan')">
          <span class="action-icon">&#128247;</span>
          Scan Item
        </button>
        ${AppState.currentUser?.role === 'admin' ? `
        <button class="quick-action-btn" onclick="navigate('add-item')">
          <span class="action-icon">&#10010;</span>
          Add Item
        </button>` : `
        <button class="quick-action-btn" onclick="navigate('checkin')">
          <span class="action-icon">&#9989;</span>
          Check In
        </button>`}
        <button class="quick-action-btn" onclick="navigate('inventory')">
          <span class="action-icon">&#128230;</span>
          Inventory
        </button>
        <button class="quick-action-btn" onclick="navigate('${AppState.currentUser?.role === 'admin' ? 'reports' : 'maintenance'}')">
          <span class="action-icon">${AppState.currentUser?.role === 'admin' ? '&#128202;' : '&#128295;'}</span>
          ${AppState.currentUser?.role === 'admin' ? 'Reports' : 'Log Repair'}
        </button>
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">&#9888;</div><p>${e.message}</p></div>`;
  }
}

function navigateToItemByCheckout(itemId) {
  navigate('item-detail', { id: itemId });
}

// ============ INVENTORY ============

async function renderInventory() {
  const list = document.getElementById('inventory-list');
  list.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading...</div>';

  try {
    const items = await API.getItems(AppState.filters);
    AppState.items = items;
    renderInventoryList(items);
  } catch (e) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">&#9888;</div><p>${e.message}</p></div>`;
  }
}

function renderInventoryList(items) {
  const list = document.getElementById('inventory-list');

  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>No items found</p></div>';
    return;
  }

  list.innerHTML = items.map(item => `
    <div class="item-card" onclick="navigate('item-detail', {id: '${item.id}'})">
      <div class="item-icon ${getCategoryClass(item.category)}">${getCategoryIcon(item.category)}</div>
      <div class="item-info">
        <div class="item-name">${item.name}</div>
        <div class="item-meta">${item.category} &middot; ${item.barcode}</div>
      </div>
      <div>
        ${getConditionBadge(item.condition)}
        <div class="item-qty">Qty: ${item.quantity || 1}</div>
      </div>
    </div>
  `).join('');
}

function filterInventory(type, value) {
  if (type === 'category') {
    AppState.filters.category = AppState.filters.category === value ? '' : value;
  } else if (type === 'condition') {
    AppState.filters.condition = AppState.filters.condition === value ? '' : value;
  }

  // Update filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    const isActive = (chip.dataset.type === 'category' && chip.dataset.value === AppState.filters.category) ||
                     (chip.dataset.type === 'condition' && chip.dataset.value === AppState.filters.condition);
    chip.classList.toggle('active', isActive);
  });

  renderInventory();
}

function searchInventory() {
  const search = document.getElementById('inventory-search').value;
  AppState.filters.search = search;
  renderInventory();
}

// ============ ITEM DETAIL ============

async function renderItemDetail(data) {
  const container = document.getElementById('item-detail-content');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Loading...</div>';

  try {
    const result = await API.getItem(data.id || data.barcode);
    AppState.selectedItem = result;
    const item = result.item;
    const isAdmin = AppState.currentUser?.role === 'admin';

    container.innerHTML = `
      <div class="detail-header">
        <div class="detail-icon ${getCategoryClass(item.category)}" style="display:inline-flex">${getCategoryIcon(item.category)}</div>
        <h2>${item.name}</h2>
        <div class="detail-category">${item.category} &middot; ${getConditionBadge(item.condition)}</div>
      </div>

      <div class="detail-fields">
        <div class="detail-field"><span class="field-label">Barcode</span><span class="field-value">${item.barcode}</span></div>
        <div class="detail-field"><span class="field-label">Serial Number</span><span class="field-value">${item.serial_number || '—'}</span></div>
        <div class="detail-field"><span class="field-label">Purchase Date</span><span class="field-value">${item.purchase_date || '—'}</span></div>
        <div class="detail-field"><span class="field-label">Purchase Cost</span><span class="field-value">${item.purchase_cost ? 'Nu. ' + item.purchase_cost : '—'}</span></div>
        <div class="detail-field"><span class="field-label">Quantity</span><span class="field-value">${item.quantity || 1}</span></div>
        <div class="detail-field"><span class="field-label">Notes</span><span class="field-value">${item.notes || '—'}</span></div>
      </div>

      <div class="detail-actions">
        ${item.condition === 'Checked Out' ? `
          <button class="btn btn-success btn-sm" onclick="navigate('checkin', {item_id: '${item.id}', barcode: '${item.barcode}'})">&#9989; Check In</button>
        ` : item.condition === 'Available' ? `
          <button class="btn btn-primary btn-sm" onclick="navigate('checkout', {item: AppState.selectedItem.item})">&#128228; Check Out</button>
        ` : ''}
        <button class="btn btn-secondary btn-sm" onclick="navigate('maintenance', {item: AppState.selectedItem.item})">&#128295; Log Repair</button>
        ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="navigate('add-item', {item: AppState.selectedItem.item})">&#9998; Edit</button>` : ''}
        <button class="btn btn-secondary btn-sm" onclick="navigate('barcode-print', {item: AppState.selectedItem.item})">&#128424; Barcode</button>
      </div>

      <div class="tabs">
        <button class="tab active" onclick="switchTab(this, 'checkout-history')">Checkouts</button>
        <button class="tab" onclick="switchTab(this, 'maintenance-history')">Maintenance</button>
      </div>

      <div id="checkout-history" class="tab-content active">
        ${renderCheckoutHistory(result.checkouts)}
      </div>
      <div id="maintenance-history" class="tab-content">
        ${renderMaintenanceHistory(result.maintenance)}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">&#9888;</div><p>${e.message}</p></div>`;
  }
}

function renderCheckoutHistory(checkouts) {
  if (!checkouts?.length) return '<div class="empty-state"><p>No checkout history</p></div>';

  return checkouts.map(c => `
    <div class="history-item">
      <div class="history-header">
        <span class="history-title">${c.client_name}</span>
        ${getStatusBadge(c.status)}
      </div>
      <div class="history-detail">
        Staff: ${c.staff_name}<br>
        Out: ${c.checkout_date} &middot; Expected: ${c.expected_return_date || '—'}<br>
        ${c.return_date ? 'Returned: ' + c.return_date : ''}
        ${c.notes ? '<br>Notes: ' + c.notes : ''}
      </div>
    </div>
  `).join('');
}

function renderMaintenanceHistory(logs) {
  if (!logs?.length) return '<div class="empty-state"><p>No maintenance history</p></div>';

  return logs.map(m => `
    <div class="history-item">
      <div class="history-header">
        <span class="history-title">${m.issue}</span>
        ${getStatusBadge(m.status)}
      </div>
      <div class="history-detail">
        Logged by: ${m.logged_by} &middot; ${m.date_logged}<br>
        ${m.date_resolved ? 'Resolved: ' + m.date_resolved : ''}
        ${m.notes ? '<br>Notes: ' + m.notes : ''}
      </div>
    </div>
  `).join('');
}

function switchTab(tabEl, contentId) {
  tabEl.closest('.tabs').querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tabEl.classList.add('active');
  tabEl.closest('.screen, .app-content').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(contentId).classList.add('active');
}

// ============ CHECKOUT FORM ============

function renderCheckoutForm(data) {
  const item = data?.item;
  const container = document.getElementById('checkout-form-content');

  container.innerHTML = `
    <div class="form-group">
      <label>Item</label>
      <input type="text" class="form-control" id="checkout-item-name" value="${item?.name || ''}" readonly>
      <input type="hidden" id="checkout-item-id" value="${item?.id || ''}">
      <input type="hidden" id="checkout-item-display" value="${item?.name || ''}">
    </div>
    <div class="form-group">
      <label>Client / Job Name</label>
      <input type="text" class="form-control" id="checkout-client" placeholder="Enter client or job name">
    </div>
    <div class="form-group">
      <label>Staff</label>
      <input type="text" class="form-control" id="checkout-staff" value="${AppState.currentUser?.name || ''}" readonly>
    </div>
    <div class="form-group">
      <label>Expected Return Date</label>
      <input type="date" class="form-control" id="checkout-return-date">
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea class="form-control" id="checkout-notes" placeholder="Optional notes..."></textarea>
    </div>
    <button class="btn btn-primary btn-block" onclick="submitCheckout()">&#128228; Check Out Item</button>
  `;
}

async function submitCheckout() {
  const itemId = document.getElementById('checkout-item-id').value;
  const itemName = document.getElementById('checkout-item-display').value;
  const client = document.getElementById('checkout-client').value;

  if (!itemId || !client) {
    Toast.show('Item and client name are required', 'warning');
    return;
  }

  try {
    await API.addCheckout({
      item_id: itemId,
      item_name: itemName,
      client_name: client,
      staff_name: document.getElementById('checkout-staff').value,
      expected_return_date: document.getElementById('checkout-return-date').value,
      notes: document.getElementById('checkout-notes').value
    });
    Toast.show('Item checked out successfully', 'success');
    navigate('item-detail', { id: itemId });
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

// ============ CHECK IN ============

function renderCheckinScreen(data) {
  const container = document.getElementById('checkin-content');

  if (data?.item_id) {
    loadCheckinDetails(data.item_id, container);
  } else {
    container.innerHTML = `
      <div class="scanner-fallback" style="border:none; padding:0">
        <div class="form-group">
          <label>Search by barcode or item name</label>
          <div class="search-bar">
            <input type="text" class="form-control" id="checkin-search" placeholder="Scan or type barcode...">
            <button class="btn btn-primary" onclick="searchCheckin()">Search</button>
          </div>
        </div>
      </div>
      <button class="btn btn-secondary btn-block" onclick="navigate('scan')" style="margin-bottom:16px">&#128247; Scan Barcode Instead</button>
      <div id="checkin-details"></div>
    `;
  }
}

async function searchCheckin() {
  const query = document.getElementById('checkin-search').value;
  if (!query) return;

  const container = document.getElementById('checkin-details');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const result = await API.getItem(query);
    if (result.item.condition !== 'Checked Out') {
      container.innerHTML = `<div class="empty-state"><p>${result.item.name} is not checked out</p></div>`;
      return;
    }
    renderCheckinItem(result, container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

async function loadCheckinDetails(itemId, container) {
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const result = await API.getItem(itemId);
    if (result.item.condition !== 'Checked Out') {
      container.innerHTML = `<div class="empty-state"><p>${result.item.name} is not checked out</p></div>`;
      return;
    }
    renderCheckinItem(result, container);
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function renderCheckinItem(result, container) {
  const item = result.item;
  const activeCheckout = result.checkouts?.find(c => c.status === 'Checked Out');

  if (!activeCheckout) {
    container.innerHTML = `<div class="empty-state"><p>No active checkout found</p></div>`;
    return;
  }

  container.innerHTML = `
    <div class="card">
      <h3 style="color:var(--text-heading); margin-bottom:12px">${item.name}</h3>
      <div class="detail-field"><span class="field-label">Client</span><span class="field-value">${activeCheckout.client_name}</span></div>
      <div class="detail-field"><span class="field-label">Checked out by</span><span class="field-value">${activeCheckout.staff_name}</span></div>
      <div class="detail-field"><span class="field-label">Checkout Date</span><span class="field-value">${activeCheckout.checkout_date}</span></div>
      <div class="detail-field"><span class="field-label">Expected Return</span><span class="field-value">${activeCheckout.expected_return_date || '—'}</span></div>
    </div>

    <div class="form-group">
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; text-transform:none; font-size:14px">
        <input type="checkbox" id="checkin-needs-repair" onchange="toggleRepairField()" style="accent-color:var(--gold); width:18px; height:18px;">
        Needs repair?
      </label>
    </div>
    <div class="form-group" id="checkin-repair-field" style="display:none">
      <label>Issue Description</label>
      <textarea class="form-control" id="checkin-repair-issue" placeholder="Describe the issue..."></textarea>
    </div>

    <input type="hidden" id="checkin-checkout-id" value="${activeCheckout.id}">
    <input type="hidden" id="checkin-item-id" value="${item.id}">
    <button class="btn btn-success btn-block" onclick="submitCheckin()">&#9989; Confirm Return</button>
  `;
}

function toggleRepairField() {
  const show = document.getElementById('checkin-needs-repair').checked;
  document.getElementById('checkin-repair-field').style.display = show ? 'block' : 'none';
}

async function submitCheckin() {
  const checkoutId = document.getElementById('checkin-checkout-id').value;
  const needsRepair = document.getElementById('checkin-needs-repair').checked;

  const data = {
    id: checkoutId,
    staff_name: AppState.currentUser?.name || '',
    needs_repair: needsRepair ? 'true' : 'false'
  };

  if (needsRepair) {
    data.repair_issue = document.getElementById('checkin-repair-issue').value;
  }

  try {
    await API.returnItem(data);
    Toast.show('Item returned successfully', 'success');
    const itemId = document.getElementById('checkin-item-id').value;
    navigate('item-detail', { id: itemId });
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

// ============ MAINTENANCE FORM ============

function renderMaintenanceForm(data) {
  const item = data?.item;
  const container = document.getElementById('maintenance-form-content');

  container.innerHTML = `
    <div class="form-group">
      <label>Item</label>
      <input type="text" class="form-control" value="${item?.name || ''}" ${item ? 'readonly' : 'placeholder="Search item..."'} id="maint-item-name">
      <input type="hidden" id="maint-item-id" value="${item?.id || ''}">
      <input type="hidden" id="maint-item-display" value="${item?.name || ''}">
    </div>
    ${!item ? `
    <div class="form-group">
      <button class="btn btn-secondary btn-sm" onclick="searchMaintenanceItem()">Search Item</button>
    </div>` : ''}
    <div class="form-group">
      <label>Issue Description</label>
      <textarea class="form-control" id="maint-issue" placeholder="Describe the issue..."></textarea>
    </div>
    <div class="form-group">
      <label>Logged By</label>
      <input type="text" class="form-control" id="maint-logged-by" value="${AppState.currentUser?.name || ''}" readonly>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea class="form-control" id="maint-notes" placeholder="Additional notes..."></textarea>
    </div>
    <button class="btn btn-primary btn-block" onclick="submitMaintenance()">&#128295; Log Maintenance</button>
  `;
}

async function submitMaintenance() {
  const itemId = document.getElementById('maint-item-id').value;
  const issue = document.getElementById('maint-issue').value;

  if (!itemId || !issue) {
    Toast.show('Item and issue description are required', 'warning');
    return;
  }

  try {
    await API.addMaintenanceLog({
      item_id: itemId,
      item_name: document.getElementById('maint-item-display').value,
      issue: issue,
      logged_by: document.getElementById('maint-logged-by').value,
      notes: document.getElementById('maint-notes').value
    });
    Toast.show('Maintenance logged', 'success');
    navigate('item-detail', { id: itemId });
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

// ============ ADD / EDIT ITEM ============

async function renderAddEditItem(data) {
  const item = data?.item;
  const isEdit = !!item;
  const container = document.getElementById('add-item-content');

  let barcode = item?.barcode || '';
  if (!isEdit) {
    try {
      barcode = await API.getNextBarcode();
    } catch (e) {}
  }

  document.getElementById('add-item-title').textContent = isEdit ? 'Edit Item' : 'Add New Item';

  container.innerHTML = `
    <input type="hidden" id="item-form-id" value="${item?.id || ''}">
    <div class="form-group">
      <label>Item Name</label>
      <input type="text" class="form-control" id="item-form-name" value="${item?.name || ''}" placeholder="e.g. QSC K12.2 Speaker">
    </div>
    <div class="form-group">
      <label>Category</label>
      <select class="form-control" id="item-form-category">
        <option value="">Select category...</option>
        ${CATEGORIES.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label>Serial Number</label>
      <input type="text" class="form-control" id="item-form-serial" value="${item?.serial_number || ''}" placeholder="Manufacturer serial number">
    </div>
    <div class="form-group">
      <label>Purchase Date</label>
      <input type="date" class="form-control" id="item-form-purchase-date" value="${item?.purchase_date || ''}">
    </div>
    <div class="form-group">
      <label>Purchase Cost (Nu.)</label>
      <input type="number" class="form-control" id="item-form-cost" value="${item?.purchase_cost || ''}" placeholder="0">
    </div>
    <div class="form-group">
      <label>Condition</label>
      <select class="form-control" id="item-form-condition">
        <option value="Available" ${item?.condition === 'Available' ? 'selected' : ''}>Available</option>
        <option value="Checked Out" ${item?.condition === 'Checked Out' ? 'selected' : ''}>Checked Out</option>
        <option value="Under Repair" ${item?.condition === 'Under Repair' ? 'selected' : ''}>Under Repair</option>
        <option value="Retired" ${item?.condition === 'Retired' ? 'selected' : ''}>Retired</option>
      </select>
    </div>
    <div class="form-group">
      <label>Quantity</label>
      <input type="number" class="form-control" id="item-form-qty" value="${item?.quantity || 1}" min="1">
    </div>
    <div class="form-group">
      <label>Barcode ID</label>
      <input type="text" class="form-control" id="item-form-barcode" value="${barcode}" readonly style="color:var(--gold)">
    </div>
    <div id="barcode-preview" class="barcode-container" style="margin-bottom:16px"></div>
    <div class="form-group">
      <label>Notes</label>
      <textarea class="form-control" id="item-form-notes" placeholder="Additional notes...">${item?.notes || ''}</textarea>
    </div>
    <div class="btn-group">
      <button class="btn btn-primary" style="flex:1" onclick="submitItem(${isEdit})">${isEdit ? '&#9998; Update' : '&#10010; Add'} Item</button>
      ${isEdit ? `<button class="btn btn-danger" onclick="confirmDeleteItem('${item.id}')">&#128465; Delete</button>` : ''}
    </div>
  `;

  // Render barcode preview
  if (barcode && typeof JsBarcode !== 'undefined') {
    setTimeout(() => BarcodeUtil.renderPreview('barcode-preview', barcode, item?.name || 'New Item'), 100);
  }
}

async function submitItem(isEdit) {
  const name = document.getElementById('item-form-name').value;
  const category = document.getElementById('item-form-category').value;

  if (!name || !category) {
    Toast.show('Name and category are required', 'warning');
    return;
  }

  const itemData = {
    name,
    category,
    serial_number: document.getElementById('item-form-serial').value,
    purchase_date: document.getElementById('item-form-purchase-date').value,
    purchase_cost: document.getElementById('item-form-cost').value,
    condition: document.getElementById('item-form-condition').value,
    quantity: document.getElementById('item-form-qty').value,
    barcode: document.getElementById('item-form-barcode').value,
    notes: document.getElementById('item-form-notes').value
  };

  try {
    if (isEdit) {
      itemData.id = document.getElementById('item-form-id').value;
      await API.updateItem(itemData);
      Toast.show('Item updated', 'success');
      navigate('item-detail', { id: itemData.id });
    } else {
      const newItem = await API.addItem(itemData);
      Toast.show('Item added', 'success');
      navigate('item-detail', { id: newItem.id });
    }
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

async function confirmDeleteItem(id) {
  if (!confirm('Are you sure you want to delete this item? This cannot be undone.')) return;

  try {
    await API.deleteItem(id);
    Toast.show('Item deleted', 'success');
    navigate('inventory');
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

// ============ BARCODE PRINT ============

function renderBarcodePrint(data) {
  const container = document.getElementById('barcode-print-content');

  if (data?.item) {
    // Single item barcode
    container.innerHTML = `
      <div id="barcode-single" class="barcode-container"></div>
      <div class="btn-group" style="justify-content:center">
        <button class="btn btn-primary" onclick="printBarcodes()">&#128424; Print</button>
        <button class="btn btn-secondary" onclick="navigate('barcode-print')">Batch Print</button>
      </div>
    `;
    setTimeout(() => BarcodeUtil.renderPreview('barcode-single', data.item.barcode, data.item.name), 100);
  } else {
    // Batch mode - load all items
    loadBatchBarcodeList(container);
  }
}

async function loadBatchBarcodeList(container) {
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const items = await API.getItems();
    container.innerHTML = `
      <div class="form-group">
        <label>Select items to print barcodes</label>
        <div class="btn-group" style="margin-bottom:12px">
          <button class="btn btn-sm btn-secondary" onclick="toggleAllBarcodes(true)">Select All</button>
          <button class="btn btn-sm btn-secondary" onclick="toggleAllBarcodes(false)">Deselect All</button>
        </div>
      </div>
      <div class="checkbox-list" id="barcode-item-list">
        ${items.map(item => `
          <label class="checkbox-item">
            <input type="checkbox" value="${item.barcode}" data-name="${item.name}">
            <span>${item.name}</span>
            <span style="color:var(--text-secondary); font-size:12px; margin-left:auto">${item.barcode}</span>
          </label>
        `).join('')}
      </div>
      <button class="btn btn-primary btn-block" onclick="generateBatchBarcodes()" style="margin-top:16px">&#128424; Generate & Print</button>
      <div id="batch-barcode-output" style="margin-top:16px"></div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function toggleAllBarcodes(checked) {
  document.querySelectorAll('#barcode-item-list input[type="checkbox"]').forEach(cb => cb.checked = checked);
}

function generateBatchBarcodes() {
  const selected = [];
  document.querySelectorAll('#barcode-item-list input[type="checkbox"]:checked').forEach(cb => {
    selected.push({ barcode: cb.value, name: cb.dataset.name });
  });

  if (!selected.length) {
    Toast.show('Select at least one item', 'warning');
    return;
  }

  const output = document.getElementById('batch-barcode-output');
  output.innerHTML = '<div class="barcode-print-grid" id="barcode-grid"></div>';

  setTimeout(() => {
    const grid = document.getElementById('barcode-grid');
    selected.forEach(item => {
      const div = document.createElement('div');
      div.className = 'barcode-print-item';
      div.innerHTML = `<svg id="bc-${item.barcode.replace(/[^a-zA-Z0-9]/g, '')}"></svg>
        <div class="barcode-item-name">${item.name}</div>
        <div class="barcode-item-id">${item.barcode}</div>`;
      grid.appendChild(div);
    });

    selected.forEach(item => {
      BarcodeUtil.generate(`bc-${item.barcode.replace(/[^a-zA-Z0-9]/g, '')}`, item.barcode);
    });

    output.innerHTML += '<button class="btn btn-primary btn-block" onclick="printBarcodes()" style="margin-top:12px">&#128424; Print All</button>';
  }, 100);
}

function printBarcodes() {
  // Add print-active class to current screen
  const screen = document.getElementById(`screen-${AppState.currentScreen}`);
  screen.classList.add('print-active');
  window.print();
  screen.classList.remove('print-active');
}

// ============ REPORTS ============

function renderReports() {
  const container = document.getElementById('reports-content');

  container.innerHTML = `
    <div class="report-card" onclick="generateReport('inventory')">
      <span class="report-icon">&#128230;</span>
      <div class="report-info">
        <h3>Full Inventory</h3>
        <p>Complete list of all items with details</p>
      </div>
    </div>
    <div class="report-card" onclick="generateReport('checkouts')">
      <span class="report-icon">&#128228;</span>
      <div class="report-info">
        <h3>Active Checkouts</h3>
        <p>Currently checked out items</p>
      </div>
    </div>
    <div class="report-card" onclick="generateReport('overdue')">
      <span class="report-icon">&#128308;</span>
      <div class="report-info">
        <h3>Overdue Items</h3>
        <p>Items past expected return date</p>
      </div>
    </div>
    <div class="report-card" onclick="generateReport('maintenance')">
      <span class="report-icon">&#128295;</span>
      <div class="report-info">
        <h3>Maintenance History</h3>
        <p>All maintenance logs and repairs</p>
      </div>
    </div>

    <div id="report-output" style="margin-top:16px"></div>
  `;
}

async function generateReport(type) {
  const output = document.getElementById('report-output');
  output.innerHTML = '<div class="loading-overlay"><span class="spinner"></span> Generating report...</div>';

  try {
    let data, title, headers;

    switch (type) {
      case 'inventory':
        data = await API.getItems();
        title = 'Full Inventory Report';
        headers = ['Name', 'Category', 'Serial #', 'Condition', 'Qty', 'Barcode'];
        data = data.map(i => [i.name, i.category, i.serial_number, i.condition, i.quantity, i.barcode]);
        break;
      case 'checkouts':
        data = await API.getCheckouts({ status: 'Checked Out' });
        title = 'Active Checkouts';
        headers = ['Item', 'Client', 'Staff', 'Checkout Date', 'Expected Return'];
        data = data.map(c => [c.item_name, c.client_name, c.staff_name, c.checkout_date, c.expected_return_date]);
        break;
      case 'overdue':
        const stats = await API.getDashboardStats();
        data = stats.overdueItems || [];
        title = 'Overdue Items';
        headers = ['Item', 'Client', 'Staff', 'Expected Return'];
        data = data.map(c => [c.item_name, c.client_name, c.staff_name, c.expected_return_date]);
        break;
      case 'maintenance':
        data = await API.getMaintenanceLogs();
        title = 'Maintenance History';
        headers = ['Item', 'Issue', 'Logged By', 'Date', 'Status'];
        data = data.map(m => [m.item_name, m.issue, m.logged_by, m.date_logged, m.status]);
        break;
    }

    output.innerHTML = `
      <h3 style="color:var(--text-heading); margin-bottom:12px">${title}</h3>
      <p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px">${data.length} records</p>
      <div class="btn-group" style="margin-bottom:16px">
        <button class="btn btn-primary btn-sm" onclick="ExportUtil.toPDF('${title}', ${JSON.stringify(headers)}, reportData)">&#128196; PDF</button>
        <button class="btn btn-secondary btn-sm" onclick="ExportUtil.toExcel('${title}', ${JSON.stringify(headers)}, reportData)">&#128202; Excel</button>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%; border-collapse:collapse; font-size:13px">
          <thead>
            <tr>${headers.map(h => `<th style="text-align:left; padding:8px; border-bottom:2px solid var(--border); color:var(--gold)">${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map(row => `<tr>${row.map(cell => `<td style="padding:8px; border-bottom:1px solid var(--border)">${cell || '—'}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Store data for export
    window.reportData = data;
  } catch (e) {
    output.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

// ============ USER MANAGEMENT ============

async function renderUserManagement() {
  const container = document.getElementById('users-content');
  container.innerHTML = '<div class="loading-overlay"><span class="spinner"></span></div>';

  try {
    const users = await API.getUsers();
    AppState.users = users;

    container.innerHTML = `
      <button class="btn btn-primary btn-block" onclick="showUserForm()" style="margin-bottom:16px">&#10010; Add User</button>
      <div id="user-form-area"></div>
      ${users.map(u => `
        <div class="user-card">
          <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${u.name}</div>
            <div class="user-role"><span class="badge badge-${u.role}">${u.role}</span>
              ${String(u.active).toLowerCase() === 'false' ? ' <span class="badge badge-retired">Inactive</span>' : ''}
            </div>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-secondary" onclick="showUserForm(${JSON.stringify(u).replace(/"/g, '&quot;')})">Edit</button>
          </div>
        </div>
      `).join('')}
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
}

function showUserForm(user = null) {
  const area = document.getElementById('user-form-area');
  const isEdit = !!user;

  area.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <h3 style="color:var(--text-heading); margin-bottom:12px">${isEdit ? 'Edit' : 'Add'} User</h3>
      <input type="hidden" id="user-form-id" value="${user?.id || ''}">
      <div class="form-group">
        <label>Name</label>
        <input type="text" class="form-control" id="user-form-name" value="${user?.name || ''}">
      </div>
      <div class="form-group">
        <label>Role</label>
        <select class="form-control" id="user-form-role">
          <option value="staff" ${user?.role === 'staff' ? 'selected' : ''}>Staff</option>
          <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
      <div class="form-group">
        <label>${isEdit ? 'New PIN (leave blank to keep)' : 'PIN (4 digits)'}</label>
        <input type="password" class="form-control" id="user-form-pin" maxlength="4" placeholder="****" inputmode="numeric">
      </div>
      ${isEdit ? `
      <div class="form-group">
        <label>Active</label>
        <select class="form-control" id="user-form-active">
          <option value="TRUE" ${String(user?.active).toLowerCase() !== 'false' ? 'selected' : ''}>Active</option>
          <option value="FALSE" ${String(user?.active).toLowerCase() === 'false' ? 'selected' : ''}>Inactive</option>
        </select>
      </div>` : ''}
      <div class="btn-group">
        <button class="btn btn-primary" onclick="submitUser(${isEdit})">${isEdit ? 'Update' : 'Add'} User</button>
        <button class="btn btn-secondary" onclick="document.getElementById('user-form-area').innerHTML=''">Cancel</button>
      </div>
    </div>
  `;
}

async function submitUser(isEdit) {
  const name = document.getElementById('user-form-name').value;
  const pin = document.getElementById('user-form-pin').value;

  if (!name) {
    Toast.show('Name is required', 'warning');
    return;
  }
  if (!isEdit && (!pin || pin.length !== 4)) {
    Toast.show('4-digit PIN is required', 'warning');
    return;
  }

  const userData = {
    name,
    role: document.getElementById('user-form-role').value
  };

  if (pin) userData.pin = pin;

  try {
    if (isEdit) {
      userData.id = document.getElementById('user-form-id').value;
      userData.active = document.getElementById('user-form-active').value;
      await API.updateUser(userData);
      Toast.show('User updated', 'success');
    } else {
      await API.addUser(userData);
      Toast.show('User added', 'success');
    }
    renderUserManagement();
  } catch (e) {
    Toast.show(e.message, 'error');
  }
}

// ============ SETTINGS MODAL ============

function showSettings() {
  const modal = document.getElementById('settings-modal');
  document.getElementById('settings-api-url').value = API.getBaseUrl();
  modal.classList.add('active');
}

function hideSettings() {
  document.getElementById('settings-modal').classList.remove('active');
}

function saveSettings() {
  const url = document.getElementById('settings-api-url').value.trim();
  if (url) {
    API.setBaseUrl(url);
    Toast.show('API URL saved', 'success');
    hideSettings();
    if (AppState.currentScreen === 'login') {
      initLogin();
    }
  } else {
    Toast.show('Please enter a valid URL', 'warning');
  }
}

function initializeRemoteSheets() {
  API.initializeSheets()
    .then(msg => Toast.show(msg, 'success'))
    .catch(e => Toast.show(e.message, 'error'));
}

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
  setupPinInputs();

  // Check if already logged in
  if (AppState.currentUser) {
    navigate('dashboard');
  } else {
    navigate('login');
    initLogin();
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
