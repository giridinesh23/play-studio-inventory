/**
 * Play Studio Bhutan - Inventory Management System
 * Google Apps Script Backend
 *
 * Deploy as Web App:
 * 1. Create a Google Sheet with tabs: Items, Checkouts, Maintenance, Users
 * 2. Open Extensions > Apps Script, paste this code
 * 3. Deploy > New deployment > Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy the Web App URL into the frontend config
 */

// ============ CONFIG ============
const SHEET_NAMES = {
  ITEMS: 'Items',
  CHECKOUTS: 'Checkouts',
  MAINTENANCE: 'Maintenance',
  USERS: 'Users'
};

const ITEM_HEADERS = ['id', 'name', 'category', 'serial_number', 'purchase_date', 'purchase_cost', 'condition', 'quantity', 'barcode', 'notes'];
const CHECKOUT_HEADERS = ['id', 'item_id', 'item_name', 'client_name', 'staff_name', 'checkout_date', 'expected_return_date', 'return_date', 'notes', 'status'];
const MAINTENANCE_HEADERS = ['id', 'item_id', 'item_name', 'issue', 'logged_by', 'date_logged', 'date_resolved', 'status', 'notes'];
const USER_HEADERS = ['id', 'name', 'role', 'pin', 'active'];

// ============ ENTRY POINTS ============

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    let postData = {};

    if (e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
      } catch (err) {
        // Not JSON, try URL params
      }
    }

    const action = params.action || postData.action;
    const allParams = Object.assign({}, params, postData);

    if (!action) {
      return jsonResponse({ success: false, error: 'No action specified' });
    }

    const actions = {
      // Items
      getItems: () => getItems(allParams),
      getItem: () => getItem(allParams),
      addItem: () => addItem(allParams),
      updateItem: () => updateItem(allParams),
      deleteItem: () => deleteItem(allParams),
      getNextBarcode: () => getNextBarcode(),

      // Users
      getUsers: () => getUsers(),
      validatePin: () => validatePin(allParams),
      addUser: () => addUser(allParams),
      updateUser: () => updateUser(allParams),

      // Checkouts
      getCheckouts: () => getCheckouts(allParams),
      addCheckout: () => addCheckout(allParams),
      returnItem: () => returnItem(allParams),

      // Maintenance
      getMaintenanceLogs: () => getMaintenanceLogs(allParams),
      addMaintenanceLog: () => addMaintenanceLog(allParams),
      resolveMaintenance: () => resolveMaintenance(allParams),

      // Dashboard
      getDashboardStats: () => getDashboardStats(),

      // Setup
      initializeSheets: () => initializeSheets()
    };

    if (!actions[action]) {
      return jsonResponse({ success: false, error: 'Unknown action: ' + action });
    }

    const result = actions[action]();
    return jsonResponse(result);

  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============ HELPERS ============

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getSheetData(sheetName, headers) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
}

function findRowIndex(sheetName, id) {
  const sheet = getSheet(sheetName);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return i + 1; // 1-indexed for Sheets
    }
  }
  return -1;
}

function generateId() {
  return Utilities.getUuid().substring(0, 8);
}

// ============ ITEMS ============

function getItems(params) {
  const items = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);

  let filtered = items;
  if (params.category) {
    filtered = filtered.filter(i => i.category === params.category);
  }
  if (params.condition) {
    filtered = filtered.filter(i => i.condition === params.condition);
  }
  if (params.search) {
    const s = params.search.toLowerCase();
    filtered = filtered.filter(i =>
      i.name.toString().toLowerCase().includes(s) ||
      i.barcode.toString().toLowerCase().includes(s) ||
      i.serial_number.toString().toLowerCase().includes(s)
    );
  }

  return { success: true, data: filtered };
}

function getItem(params) {
  const items = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);
  const item = items.find(i => String(i.id) === String(params.id) || String(i.barcode) === String(params.barcode));

  if (!item) {
    return { success: false, error: 'Item not found' };
  }

  // Get checkout history
  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS)
    .filter(c => String(c.item_id) === String(item.id));

  // Get maintenance history
  const maintenance = getSheetData(SHEET_NAMES.MAINTENANCE, MAINTENANCE_HEADERS)
    .filter(m => String(m.item_id) === String(item.id));

  return { success: true, data: { item, checkouts, maintenance } };
}

function addItem(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.ITEMS);
    const id = generateId();
    const barcode = params.barcode || generateBarcode();

    const row = [
      id,
      params.name || '',
      params.category || '',
      params.serial_number || '',
      params.purchase_date || '',
      params.purchase_cost || '',
      params.condition || 'Available',
      params.quantity || 1,
      barcode,
      params.notes || ''
    ];

    sheet.appendRow(row);

    const item = {};
    ITEM_HEADERS.forEach((h, i) => item[h] = row[i]);

    return { success: true, data: item };
  } finally {
    lock.releaseLock();
  }
}

function updateItem(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.ITEMS);
    const rowIndex = findRowIndex(SHEET_NAMES.ITEMS, params.id);

    if (rowIndex === -1) {
      return { success: false, error: 'Item not found' };
    }

    const currentRow = sheet.getRange(rowIndex, 1, 1, ITEM_HEADERS.length).getValues()[0];

    const updatedRow = ITEM_HEADERS.map((h, i) => {
      return params[h] !== undefined && params[h] !== '' ? params[h] : currentRow[i];
    });
    // Always keep the ID
    updatedRow[0] = currentRow[0];

    sheet.getRange(rowIndex, 1, 1, ITEM_HEADERS.length).setValues([updatedRow]);

    const item = {};
    ITEM_HEADERS.forEach((h, i) => item[h] = updatedRow[i]);

    return { success: true, data: item };
  } finally {
    lock.releaseLock();
  }
}

function deleteItem(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.ITEMS);
    const rowIndex = findRowIndex(SHEET_NAMES.ITEMS, params.id);

    if (rowIndex === -1) {
      return { success: false, error: 'Item not found' };
    }

    sheet.deleteRow(rowIndex);
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function getNextBarcode() {
  const items = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);
  const year = new Date().getFullYear();
  const prefix = 'PSB-' + year + '-';

  let maxNum = 0;
  items.forEach(item => {
    const bc = String(item.barcode);
    if (bc.startsWith(prefix)) {
      const num = parseInt(bc.substring(prefix.length), 10);
      if (num > maxNum) maxNum = num;
    }
  });

  const next = prefix + String(maxNum + 1).padStart(4, '0');
  return { success: true, data: next };
}

function generateBarcode() {
  const result = getNextBarcode();
  return result.data;
}

// ============ USERS ============

function getUsers() {
  const users = getSheetData(SHEET_NAMES.USERS, USER_HEADERS);
  // Don't send PINs to frontend
  const safeUsers = users.map(u => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active
  }));
  return { success: true, data: safeUsers };
}

function validatePin(params) {
  const users = getSheetData(SHEET_NAMES.USERS, USER_HEADERS);
  const user = users.find(u =>
    String(u.name) === String(params.name) &&
    String(u.pin) === String(params.pin) &&
    String(u.active).toLowerCase() !== 'false'
  );

  if (!user) {
    return { success: false, error: 'Invalid credentials' };
  }

  return {
    success: true,
    data: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  };
}

function addUser(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.USERS);
    const id = generateId();

    const row = [
      id,
      params.name || '',
      params.role || 'staff',
      params.pin || '0000',
      'TRUE'
    ];

    sheet.appendRow(row);

    return { success: true, data: { id: id, name: params.name, role: params.role, active: 'TRUE' } };
  } finally {
    lock.releaseLock();
  }
}

function updateUser(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.USERS);
    const rowIndex = findRowIndex(SHEET_NAMES.USERS, params.id);

    if (rowIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    const currentRow = sheet.getRange(rowIndex, 1, 1, USER_HEADERS.length).getValues()[0];

    const updatedRow = USER_HEADERS.map((h, i) => {
      return params[h] !== undefined && params[h] !== '' ? params[h] : currentRow[i];
    });
    updatedRow[0] = currentRow[0];

    sheet.getRange(rowIndex, 1, 1, USER_HEADERS.length).setValues([updatedRow]);

    return { success: true, data: { id: updatedRow[0], name: updatedRow[1], role: updatedRow[2], active: updatedRow[4] } };
  } finally {
    lock.releaseLock();
  }
}

// ============ CHECKOUTS ============

function getCheckouts(params) {
  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);

  let filtered = checkouts;
  if (params.status) {
    filtered = filtered.filter(c => c.status === params.status);
  }
  if (params.item_id) {
    filtered = filtered.filter(c => String(c.item_id) === String(params.item_id));
  }

  return { success: true, data: filtered };
}

function addCheckout(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.CHECKOUTS);
    const id = generateId();

    const row = [
      id,
      params.item_id || '',
      params.item_name || '',
      params.client_name || '',
      params.staff_name || '',
      params.checkout_date || new Date().toISOString().split('T')[0],
      params.expected_return_date || '',
      '',  // return_date empty
      params.notes || '',
      'Checked Out'
    ];

    sheet.appendRow(row);

    // Update item condition to Checked Out
    if (params.item_id) {
      const itemSheet = getSheet(SHEET_NAMES.ITEMS);
      const itemRow = findRowIndex(SHEET_NAMES.ITEMS, params.item_id);
      if (itemRow !== -1) {
        itemSheet.getRange(itemRow, 7).setValue('Checked Out'); // condition column
      }
    }

    const checkout = {};
    CHECKOUT_HEADERS.forEach((h, i) => checkout[h] = row[i]);

    return { success: true, data: checkout };
  } finally {
    lock.releaseLock();
  }
}

function returnItem(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.CHECKOUTS);
    const rowIndex = findRowIndex(SHEET_NAMES.CHECKOUTS, params.id);

    if (rowIndex === -1) {
      return { success: false, error: 'Checkout record not found' };
    }

    const returnDate = params.return_date || new Date().toISOString().split('T')[0];

    // Update return_date (col 8) and status (col 10)
    sheet.getRange(rowIndex, 8).setValue(returnDate);
    sheet.getRange(rowIndex, 10).setValue('Returned');

    // Update item condition back to Available (or Under Repair if flagged)
    const currentRow = sheet.getRange(rowIndex, 1, 1, CHECKOUT_HEADERS.length).getValues()[0];
    const itemId = currentRow[1];

    if (itemId) {
      const newCondition = params.needs_repair === 'true' ? 'Under Repair' : 'Available';
      const itemSheet = getSheet(SHEET_NAMES.ITEMS);
      const itemRow = findRowIndex(SHEET_NAMES.ITEMS, itemId);
      if (itemRow !== -1) {
        itemSheet.getRange(itemRow, 7).setValue(newCondition);
      }

      // If needs repair, auto-create maintenance log
      if (params.needs_repair === 'true' && params.repair_issue) {
        addMaintenanceLog({
          item_id: itemId,
          item_name: currentRow[2],
          issue: params.repair_issue,
          logged_by: params.staff_name || '',
          notes: 'Logged on return'
        });
      }
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ MAINTENANCE ============

function getMaintenanceLogs(params) {
  const logs = getSheetData(SHEET_NAMES.MAINTENANCE, MAINTENANCE_HEADERS);

  let filtered = logs;
  if (params.status) {
    filtered = filtered.filter(m => m.status === params.status);
  }
  if (params.item_id) {
    filtered = filtered.filter(m => String(m.item_id) === String(params.item_id));
  }

  return { success: true, data: filtered };
}

function addMaintenanceLog(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.MAINTENANCE);
    const id = generateId();

    const row = [
      id,
      params.item_id || '',
      params.item_name || '',
      params.issue || '',
      params.logged_by || '',
      params.date_logged || new Date().toISOString().split('T')[0],
      '',  // date_resolved empty
      'Open',
      params.notes || ''
    ];

    sheet.appendRow(row);

    // Update item condition to Under Repair
    if (params.item_id) {
      const itemSheet = getSheet(SHEET_NAMES.ITEMS);
      const itemRow = findRowIndex(SHEET_NAMES.ITEMS, params.item_id);
      if (itemRow !== -1) {
        itemSheet.getRange(itemRow, 7).setValue('Under Repair');
      }
    }

    const log = {};
    MAINTENANCE_HEADERS.forEach((h, i) => log[h] = row[i]);

    return { success: true, data: log };
  } finally {
    lock.releaseLock();
  }
}

function resolveMaintenance(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.MAINTENANCE);
    const rowIndex = findRowIndex(SHEET_NAMES.MAINTENANCE, params.id);

    if (rowIndex === -1) {
      return { success: false, error: 'Maintenance log not found' };
    }

    const resolvedDate = params.date_resolved || new Date().toISOString().split('T')[0];

    // Update date_resolved (col 7) and status (col 8)
    sheet.getRange(rowIndex, 7).setValue(resolvedDate);
    sheet.getRange(rowIndex, 8).setValue('Resolved');
    if (params.notes) {
      sheet.getRange(rowIndex, 9).setValue(params.notes);
    }

    // Update item condition back to Available
    const currentRow = sheet.getRange(rowIndex, 1, 1, MAINTENANCE_HEADERS.length).getValues()[0];
    const itemId = currentRow[1];

    if (itemId) {
      const itemSheet = getSheet(SHEET_NAMES.ITEMS);
      const itemRow = findRowIndex(SHEET_NAMES.ITEMS, itemId);
      if (itemRow !== -1) {
        itemSheet.getRange(itemRow, 7).setValue('Available');
      }
    }

    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

// ============ DASHBOARD ============

function getDashboardStats() {
  const items = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);
  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);

  const totalItems = items.length;
  const checkedOut = items.filter(i => i.condition === 'Checked Out').length;
  const underRepair = items.filter(i => i.condition === 'Under Repair').length;

  const today = new Date().toISOString().split('T')[0];
  const activeCheckouts = checkouts.filter(c => c.status === 'Checked Out');

  const overdueItems = activeCheckouts.filter(c => {
    if (!c.expected_return_date) return false;
    const expected = new Date(c.expected_return_date).toISOString().split('T')[0];
    return expected < today;
  });

  const dueTodayItems = activeCheckouts.filter(c => {
    if (!c.expected_return_date) return false;
    const expected = new Date(c.expected_return_date).toISOString().split('T')[0];
    return expected === today;
  });

  return {
    success: true,
    data: {
      totalItems,
      checkedOut,
      underRepair,
      overdue: overdueItems.length,
      overdueItems: overdueItems,
      dueTodayItems: dueTodayItems,
      activeCheckouts: activeCheckouts
    }
  };
}

// ============ SHEET INITIALIZATION ============

function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetsConfig = [
    { name: SHEET_NAMES.ITEMS, headers: ITEM_HEADERS },
    { name: SHEET_NAMES.CHECKOUTS, headers: CHECKOUT_HEADERS },
    { name: SHEET_NAMES.MAINTENANCE, headers: MAINTENANCE_HEADERS },
    { name: SHEET_NAMES.USERS, headers: USER_HEADERS }
  ];

  sheetsConfig.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
    }

    // Set headers if first row is empty
    const firstRow = sheet.getRange(1, 1, 1, config.headers.length).getValues()[0];
    if (!firstRow[0]) {
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
      sheet.getRange(1, 1, 1, config.headers.length)
        .setFontWeight('bold')
        .setBackground('#C9A84C')
        .setFontColor('#1a1a2e');
      sheet.setFrozenRows(1);
    }
  });

  // Add default admin user if Users sheet is empty
  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow([generateId(), 'Admin', 'admin', '1234', 'TRUE']);
    usersSheet.appendRow([generateId(), 'Staff User', 'staff', '5678', 'TRUE']);
  }

  return { success: true, data: 'Sheets initialized successfully. Default users: Admin (PIN: 1234), Staff User (PIN: 5678)' };
}
