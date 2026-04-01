/**
 * Play Studio Bhutan - Inventory Management System
 * Google Apps Script Backend
 *
 * Deploy as Web App:
 * 1. Create a Google Sheet with tabs: Items, Checkouts, Maintenance, Users, CheckInLog
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
  USERS: 'Users',
  CHECKIN_LOG: 'CheckInLog'
};

const ITEM_HEADERS = ['id', 'name', 'category', 'serial_number', 'purchase_date', 'purchase_cost', 'condition', 'quantity', 'barcode', 'notes'];
const CHECKOUT_HEADERS = ['id', 'event_id', 'item_id', 'item_name', 'quantity_out', 'client_name', 'staff_name', 'checkout_date', 'expected_return_date', 'return_date', 'notes', 'status', 'disposition'];
const MAINTENANCE_HEADERS = ['id', 'item_id', 'item_name', 'issue', 'logged_by', 'date_logged', 'date_resolved', 'status', 'notes'];
const USER_HEADERS = ['id', 'name', 'role', 'pin', 'active'];
const CHECKIN_LOG_HEADERS = ['id', 'event_id', 'item_id', 'item_name', 'quantity', 'disposition', 'destination_event_id', 'checked_in_by', 'date', 'notes'];

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
      getItemsWithAvailability: () => getItemsWithAvailability(allParams),
      addItem: () => addItem(allParams),
      updateItem: () => updateItem(allParams),
      deleteItem: () => deleteItem(allParams),
      getNextBarcode: () => getNextBarcode(),

      // Users
      getUsers: () => getUsers(),
      validatePin: () => validatePin(allParams),
      addUser: () => addUser(allParams),
      updateUser: () => updateUser(allParams),

      // Legacy single-item checkouts
      getCheckouts: () => getCheckouts(allParams),
      addCheckout: () => addCheckout(allParams),
      returnItem: () => returnItem(allParams),

      // Event-based checkouts
      getEventCheckouts: () => getEventCheckouts(allParams),
      getEventDetail: () => getEventDetail(allParams),
      addEventCheckout: () => addEventCheckout(allParams),
      checkinEvent: () => checkinEvent(allParams),

      // Maintenance
      getMaintenanceLogs: () => getMaintenanceLogs(allParams),
      addMaintenanceLog: () => addMaintenanceLog(allParams),
      resolveMaintenance: () => resolveMaintenance(allParams),

      // Dashboard
      getDashboardStats: () => getDashboardStats(),

      // Setup
      initializeSheets: () => initializeSheets(),
      checkInitialized: () => checkInitialized(),

      // PIN Management
      updatePin: () => updatePin(allParams)
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

function getItemsWithAvailability(params) {
  const items = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);
  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);

  // Build a map of active checkout quantities per item
  const activeQtyMap = {};
  const eventRefMap = {};
  checkouts.forEach(c => {
    if (c.status === 'Checked Out' || c.status === 'Active') {
      const itemId = String(c.item_id);
      activeQtyMap[itemId] = (activeQtyMap[itemId] || 0) + (Number(c.quantity_out) || 1);
      // Track the most recent event reference
      if (c.client_name) {
        eventRefMap[itemId] = c.client_name;
      }
    }
  });

  const enriched = items.map(item => {
    const totalQty = Number(item.quantity) || 1;
    const outQty = activeQtyMap[String(item.id)] || 0;
    const availableQty = Math.max(0, totalQty - outQty);

    let status = 'available';
    if (item.condition === 'Under Repair') {
      status = 'damaged';
    } else if (availableQty === 0 && outQty > 0) {
      status = 'out';
    } else if (outQty > 0) {
      status = 'partial'; // some out, some available
    }

    return Object.assign({}, item, {
      availableQty: availableQty,
      outQty: outQty,
      status: status,
      eventRef: eventRefMap[String(item.id)] || ''
    });
  });

  let filtered = enriched;
  if (params.status) {
    if (params.status === 'available') {
      filtered = filtered.filter(i => i.status === 'available' || i.status === 'partial');
    } else {
      filtered = filtered.filter(i => i.status === params.status);
    }
  }
  if (params.category) {
    filtered = filtered.filter(i => i.category === params.category);
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
  if (params.role && params.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

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
  if (params.role && params.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

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
  if (params.role && params.role !== 'admin') {
    return { success: false, error: 'Unauthorized: Admin access required' };
  }

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

// ============ LEGACY SINGLE-ITEM CHECKOUTS ============

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
    const eventId = params.event_id || id; // Use own id as event_id for legacy single-item checkouts

    const row = [
      id,
      eventId,
      params.item_id || '',
      params.item_name || '',
      params.quantity_out || 1,
      params.client_name || '',
      params.staff_name || '',
      params.checkout_date || new Date().toISOString().split('T')[0],
      params.expected_return_date || '',
      '',  // return_date empty
      params.notes || '',
      'Checked Out',
      ''   // disposition empty
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

    // Update return_date, status, disposition
    const currentRow = sheet.getRange(rowIndex, 1, 1, CHECKOUT_HEADERS.length).getValues()[0];
    currentRow[9] = returnDate;  // return_date
    currentRow[11] = 'Returned'; // status
    currentRow[12] = 'returned'; // disposition
    sheet.getRange(rowIndex, 1, 1, CHECKOUT_HEADERS.length).setValues([currentRow]);

    const itemId = currentRow[2]; // item_id

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
          item_name: currentRow[3],
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

// ============ EVENT-BASED CHECKOUTS ============

function getEventCheckouts(params) {
  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);

  // Group by event_id
  const eventMap = {};
  checkouts.forEach(c => {
    const eid = String(c.event_id || c.id);
    if (!eventMap[eid]) {
      eventMap[eid] = {
        event_id: eid,
        client_name: c.client_name,
        staff_name: c.staff_name,
        checkout_date: c.checkout_date,
        expected_return_date: c.expected_return_date,
        notes: c.notes,
        items: [],
        total_items: 0,
        returned_count: 0
      };
    }
    eventMap[eid].items.push(c);
    eventMap[eid].total_items += Number(c.quantity_out) || 1;
    if (c.status === 'Returned') {
      eventMap[eid].returned_count += Number(c.quantity_out) || 1;
    }
  });

  // Compute status for each event
  let events = Object.values(eventMap).map(evt => {
    let status = 'Active';
    if (evt.returned_count >= evt.total_items) {
      status = 'Returned';
    } else if (evt.returned_count > 0) {
      status = 'Partial';
    }
    evt.status = status;
    evt.item_count = evt.items.length;
    return evt;
  });

  // Sort by checkout_date descending
  events.sort((a, b) => {
    const da = new Date(b.checkout_date || 0);
    const db = new Date(a.checkout_date || 0);
    return da - db;
  });

  // Filter by status
  if (params.status) {
    events = events.filter(e => e.status === params.status);
  }

  return { success: true, data: events };
}

function getEventDetail(params) {
  if (!params.event_id) {
    return { success: false, error: 'event_id is required' };
  }

  const checkouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);
  const eventItems = checkouts.filter(c => String(c.event_id) === String(params.event_id));

  if (!eventItems.length) {
    return { success: false, error: 'Event not found' };
  }

  const first = eventItems[0];
  let totalItems = 0;
  let returnedCount = 0;
  eventItems.forEach(c => {
    totalItems += Number(c.quantity_out) || 1;
    if (c.status === 'Returned') {
      returnedCount += Number(c.quantity_out) || 1;
    }
  });

  let status = 'Active';
  if (returnedCount >= totalItems) {
    status = 'Returned';
  } else if (returnedCount > 0) {
    status = 'Partial';
  }

  return {
    success: true,
    data: {
      event_id: String(params.event_id),
      client_name: first.client_name,
      staff_name: first.staff_name,
      checkout_date: first.checkout_date,
      expected_return_date: first.expected_return_date,
      notes: first.notes,
      status: status,
      total_items: totalItems,
      returned_count: returnedCount,
      items: eventItems
    }
  };
}

function addEventCheckout(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const items = params.items;
    if (!items || !items.length) {
      return { success: false, error: 'No items selected' };
    }
    if (!params.client_name) {
      return { success: false, error: 'Event/client name is required' };
    }

    // Validate availability
    const allItems = getSheetData(SHEET_NAMES.ITEMS, ITEM_HEADERS);
    const allCheckouts = getSheetData(SHEET_NAMES.CHECKOUTS, CHECKOUT_HEADERS);

    // Build active qty map
    const activeQtyMap = {};
    allCheckouts.forEach(c => {
      if (c.status === 'Checked Out' || c.status === 'Active') {
        const itemId = String(c.item_id);
        activeQtyMap[itemId] = (activeQtyMap[itemId] || 0) + (Number(c.quantity_out) || 1);
      }
    });

    // Validate each item
    for (let i = 0; i < items.length; i++) {
      const reqItem = items[i];
      const invItem = allItems.find(it => String(it.id) === String(reqItem.item_id));
      if (!invItem) {
        return { success: false, error: 'Item not found: ' + reqItem.item_name };
      }
      const totalQty = Number(invItem.quantity) || 1;
      const outQty = activeQtyMap[String(reqItem.item_id)] || 0;
      const available = totalQty - outQty;
      const requested = Number(reqItem.quantity_out) || 1;
      if (requested > available) {
        return { success: false, error: 'Not enough stock for ' + invItem.name + ' (available: ' + available + ', requested: ' + requested + ')' };
      }
    }

    // Create checkout rows
    const sheet = getSheet(SHEET_NAMES.CHECKOUTS);
    const eventId = generateId();
    const checkoutDate = params.checkout_date || new Date().toISOString().split('T')[0];
    const createdRows = [];

    items.forEach(reqItem => {
      const rowId = generateId();
      const row = [
        rowId,
        eventId,
        reqItem.item_id || '',
        reqItem.item_name || '',
        Number(reqItem.quantity_out) || 1,
        params.client_name || '',
        params.staff_name || '',
        checkoutDate,
        params.expected_return_date || '',
        '',  // return_date
        params.notes || '',
        'Checked Out',
        ''   // disposition
      ];
      sheet.appendRow(row);
      createdRows.push(row);
    });

    return {
      success: true,
      data: {
        event_id: eventId,
        client_name: params.client_name,
        item_count: items.length,
        checkout_date: checkoutDate
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function checkinEvent(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    if (!params.event_id) {
      return { success: false, error: 'event_id is required' };
    }
    if (!params.items || !params.items.length) {
      return { success: false, error: 'No items to check in' };
    }

    const sheet = getSheet(SHEET_NAMES.CHECKOUTS);
    const checkoutData = sheet.getDataRange().getValues();
    const today = new Date().toISOString().split('T')[0];

    const checkinLogSheet = getSheet(SHEET_NAMES.CHECKIN_LOG);

    params.items.forEach(ci => {
      // Find the checkout row by id
      let rowIdx = -1;
      for (let i = 1; i < checkoutData.length; i++) {
        if (String(checkoutData[i][0]) === String(ci.checkout_row_id)) {
          rowIdx = i + 1; // 1-indexed
          break;
        }
      }
      if (rowIdx === -1) return;

      const currentRow = sheet.getRange(rowIdx, 1, 1, CHECKOUT_HEADERS.length).getValues()[0];
      const itemId = String(currentRow[2]);
      const itemName = String(currentRow[3]);

      // Update checkout row
      currentRow[9] = today;              // return_date
      currentRow[11] = 'Returned';        // status
      currentRow[12] = ci.disposition;    // disposition
      sheet.getRange(rowIdx, 1, 1, CHECKOUT_HEADERS.length).setValues([currentRow]);

      // Append to CheckInLog
      if (checkinLogSheet) {
        const logRow = [
          generateId(),
          params.event_id,
          itemId,
          itemName,
          ci.quantity || currentRow[4],
          ci.disposition,
          ci.destination_event_id || '',
          params.staff_name || '',
          today,
          ci.notes || ''
        ];
        checkinLogSheet.appendRow(logRow);
      }

      // Handle disposition effects
      if (ci.disposition === 'damaged') {
        // Mark item as Under Repair and create maintenance log
        const itemSheet = getSheet(SHEET_NAMES.ITEMS);
        const itemRow = findRowIndex(SHEET_NAMES.ITEMS, itemId);
        if (itemRow !== -1) {
          itemSheet.getRange(itemRow, 7).setValue('Under Repair');
        }
        addMaintenanceLog({
          item_id: itemId,
          item_name: itemName,
          issue: 'Damaged on return from event: ' + (params.client_name || params.event_id),
          logged_by: params.staff_name || '',
          notes: ci.notes || 'Logged during event check-in'
        });
      } else if (ci.disposition === 'sent_to_event' && ci.destination_event_id) {
        // Create a new checkout row under the destination event
        const destSheet = getSheet(SHEET_NAMES.CHECKOUTS);
        const newRowId = generateId();
        const newRow = [
          newRowId,
          ci.destination_event_id,
          itemId,
          itemName,
          ci.quantity || currentRow[4],
          ci.destination_event_name || '',
          params.staff_name || '',
          today,
          '',  // expected_return_date
          '',  // return_date
          'Redirected from event ' + params.event_id,
          'Checked Out',
          ''   // disposition
        ];
        destSheet.appendRow(newRow);
      }
      // 'returned' and 'missing' need no extra action beyond the checkout row update
    });

    return { success: true, data: { event_id: params.event_id, checked_in: params.items.length } };
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

  // Compute checked out and under repair from active checkouts
  const activeQtyMap = {};
  checkouts.forEach(c => {
    if (c.status === 'Checked Out' || c.status === 'Active') {
      const itemId = String(c.item_id);
      activeQtyMap[itemId] = (activeQtyMap[itemId] || 0) + (Number(c.quantity_out) || 1);
    }
  });

  const itemsWithActiveCheckout = Object.keys(activeQtyMap).length;
  const underRepair = items.filter(i => i.condition === 'Under Repair').length;

  // Count active events
  const eventIds = {};
  checkouts.forEach(c => {
    if (c.status === 'Checked Out' || c.status === 'Active') {
      eventIds[String(c.event_id || c.id)] = true;
    }
  });
  const activeEvents = Object.keys(eventIds).length;

  const today = new Date().toISOString().split('T')[0];
  const activeCheckouts = checkouts.filter(c => c.status === 'Checked Out' || c.status === 'Active');

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
      checkedOut: itemsWithActiveCheckout,
      underRepair,
      activeEvents,
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
    { name: SHEET_NAMES.USERS, headers: USER_HEADERS },
    { name: SHEET_NAMES.CHECKIN_LOG, headers: CHECKIN_LOG_HEADERS }
  ];

  sheetsConfig.forEach(config => {
    let sheet = ss.getSheetByName(config.name);
    if (!sheet) {
      sheet = ss.insertSheet(config.name);
    }

    // Set headers if first row is empty or needs update
    const firstRow = sheet.getRange(1, 1, 1, config.headers.length).getValues()[0];
    if (!firstRow[0] || (config.name === SHEET_NAMES.CHECKOUTS && firstRow.length < config.headers.length)) {
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
      sheet.getRange(1, 1, 1, config.headers.length)
        .setFontWeight('bold')
        .setBackground('#C9A84C')
        .setFontColor('#1a1a2e');
      sheet.setFrozenRows(1);
    }
  });

  // Migrate existing Checkouts sheet if it has old format (10 columns instead of 13)
  const checkoutSheet = ss.getSheetByName(SHEET_NAMES.CHECKOUTS);
  if (checkoutSheet) {
    const headerRow = checkoutSheet.getRange(1, 1, 1, 13).getValues()[0];
    if (headerRow[1] !== 'event_id') {
      // Old format detected — set new headers
      checkoutSheet.getRange(1, 1, 1, CHECKOUT_HEADERS.length).setValues([CHECKOUT_HEADERS]);
      checkoutSheet.getRange(1, 1, 1, CHECKOUT_HEADERS.length)
        .setFontWeight('bold')
        .setBackground('#C9A84C')
        .setFontColor('#1a1a2e');

      // Migrate existing data rows
      const lastRow = checkoutSheet.getLastRow();
      if (lastRow > 1) {
        for (let r = 2; r <= lastRow; r++) {
          var oldRow = checkoutSheet.getRange(r, 1, 1, 10).getValues()[0];
          // Old format: id, item_id, item_name, client_name, staff_name, checkout_date, expected_return_date, return_date, notes, status
          // New format: id, event_id, item_id, item_name, quantity_out, client_name, staff_name, checkout_date, expected_return_date, return_date, notes, status, disposition
          var newRow = [
            oldRow[0],          // id
            oldRow[0],          // event_id = same as id for legacy
            oldRow[1],          // item_id
            oldRow[2],          // item_name
            1,                  // quantity_out default 1
            oldRow[3],          // client_name
            oldRow[4],          // staff_name
            oldRow[5],          // checkout_date
            oldRow[6],          // expected_return_date
            oldRow[7],          // return_date
            oldRow[8],          // notes
            oldRow[9],          // status
            oldRow[9] === 'Returned' ? 'returned' : ''  // disposition
          ];
          checkoutSheet.getRange(r, 1, 1, CHECKOUT_HEADERS.length).setValues([newRow]);
        }
      }
    }
  }

  // Add default admin user if Users sheet is empty
  const usersSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (usersSheet.getLastRow() <= 1) {
    usersSheet.appendRow([generateId(), 'Admin', 'admin', '1234', 'TRUE']);
    usersSheet.appendRow([generateId(), 'Staff User', 'staff', '5678', 'TRUE']);
  }

  return { success: true, data: 'Sheets initialized successfully. Default users: Admin (PIN: 1234), Staff User (PIN: 5678)' };
}

// ============ CHECK INITIALIZED ============

function checkInitialized() {
  const sheet = getSheet(SHEET_NAMES.USERS);
  if (!sheet) {
    return { success: true, data: { initialized: false } };
  }
  const lastRow = sheet.getLastRow();
  return { success: true, data: { initialized: lastRow > 1 } };
}

// ============ PIN MANAGEMENT ============

function updatePin(params) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getSheet(SHEET_NAMES.USERS);
    const rowIndex = findRowIndex(SHEET_NAMES.USERS, params.userId);

    if (rowIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    const currentRow = sheet.getRange(rowIndex, 1, 1, USER_HEADERS.length).getValues()[0];

    // If self-change (not admin), verify current PIN
    if (params.currentPin) {
      if (String(currentRow[3]) !== String(params.currentPin)) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    }

    // Validate new PIN
    if (!params.newPin || String(params.newPin).length !== 4 || !/^\d{4}$/.test(String(params.newPin))) {
      return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    // Update PIN (column 4)
    sheet.getRange(rowIndex, 4).setValue(String(params.newPin));

    return { success: true, data: 'PIN updated successfully' };
  } finally {
    lock.releaseLock();
  }
}
