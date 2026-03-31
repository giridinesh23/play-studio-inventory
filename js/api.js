/**
 * Play Studio Bhutan - API Communication Layer
 * Handles all communication with Google Apps Script backend
 */

const API = (() => {
  let BASE_URL = localStorage.getItem('ps_api_url') || 'https://script.google.com/macros/s/AKfycbz90G8Q1UaKoRjU7DmHWyvBv8Rl9ewsy5fdJNpKIt7jTD3YFXLX7jkD0NUbBKWDsNXu/exec';

  function setBaseUrl(url) {
    BASE_URL = url.replace(/\/$/, '');
    localStorage.setItem('ps_api_url', BASE_URL);
  }

  function getBaseUrl() {
    return BASE_URL;
  }

  async function request(action, params = {}) {
    if (!BASE_URL) {
      throw new Error('API URL not configured. Please set it in Settings.');
    }

    params.action = action;

    try {
      // Use POST with text/plain to avoid CORS preflight
      const response = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params),
        redirect: 'follow'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      return data.data;
    } catch (error) {
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        // Try cache for read operations
        const cached = getCache(action, params);
        if (cached) {
          Toast.show('Using cached data (offline)', 'warning');
          return cached;
        }
        throw new Error('Network error. Check your connection.');
      }
      throw error;
    }
  }

  // Simple localStorage cache for offline reads
  function setCache(key, data) {
    try {
      localStorage.setItem('ps_cache_' + key, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
      // Storage full - clear old caches
      clearOldCaches();
    }
  }

  function getCache(action, params) {
    const key = action + '_' + JSON.stringify(params);
    try {
      const cached = localStorage.getItem('ps_cache_' + key);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Cache valid for 1 hour
        if (Date.now() - parsed.timestamp < 3600000) {
          return parsed.data;
        }
      }
    } catch (e) {}
    return null;
  }

  function clearOldCaches() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ps_cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  }

  // ============ Items ============

  async function getItems(filters = {}) {
    const data = await request('getItems', filters);
    setCache('getItems', data);
    return data;
  }

  async function getItem(idOrBarcode) {
    const param = idOrBarcode.startsWith('PSB-') ? { barcode: idOrBarcode } : { id: idOrBarcode };
    return await request('getItem', param);
  }

  async function addItem(itemData) {
    return await request('addItem', itemData);
  }

  async function updateItem(itemData) {
    return await request('updateItem', itemData);
  }

  async function deleteItem(id) {
    return await request('deleteItem', { id });
  }

  async function getNextBarcode() {
    return await request('getNextBarcode');
  }

  // ============ Users ============

  async function getUsers() {
    const data = await request('getUsers');
    setCache('getUsers', data);
    return data;
  }

  async function validatePin(name, pin) {
    return await request('validatePin', { name, pin });
  }

  async function addUser(userData) {
    return await request('addUser', userData);
  }

  async function updateUser(userData) {
    return await request('updateUser', userData);
  }

  // ============ Checkouts ============

  async function getCheckouts(filters = {}) {
    return await request('getCheckouts', filters);
  }

  async function addCheckout(checkoutData) {
    return await request('addCheckout', checkoutData);
  }

  async function returnItem(returnData) {
    return await request('returnItem', returnData);
  }

  // ============ Maintenance ============

  async function getMaintenanceLogs(filters = {}) {
    return await request('getMaintenanceLogs', filters);
  }

  async function addMaintenanceLog(logData) {
    return await request('addMaintenanceLog', logData);
  }

  async function resolveMaintenance(resolveData) {
    return await request('resolveMaintenance', resolveData);
  }

  // ============ Dashboard ============

  async function getDashboardStats() {
    const data = await request('getDashboardStats');
    setCache('getDashboardStats', data);
    return data;
  }

  // ============ Initialize ============

  async function initializeSheets() {
    return await request('initializeSheets');
  }

  return {
    setBaseUrl,
    getBaseUrl,
    getItems,
    getItem,
    addItem,
    updateItem,
    deleteItem,
    getNextBarcode,
    getUsers,
    validatePin,
    addUser,
    updateUser,
    getCheckouts,
    addCheckout,
    returnItem,
    getMaintenanceLogs,
    addMaintenanceLog,
    resolveMaintenance,
    getDashboardStats,
    initializeSheets
  };
})();
