/**
 * Play Studio Bhutan - Barcode Scanner Module
 * Uses html5-qrcode library for camera-based scanning
 */

const Scanner = (() => {
  let html5QrCode = null;
  let isScanning = false;

  function start() {
    const readerEl = document.getElementById('scanner-reader');
    if (!readerEl) return;

    // Clean up previous instance
    stop();

    if (typeof Html5Qrcode === 'undefined') {
      Toast.show('Scanner library not loaded', 'error');
      return;
    }

    html5QrCode = new Html5Qrcode('scanner-reader');

    html5QrCode.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        qrbox: { width: 250, height: 100 },
        aspectRatio: 1.0
      },
      onScanSuccess,
      () => {} // ignore scan failures
    ).then(() => {
      isScanning = true;
    }).catch(err => {
      console.warn('Camera error:', err);
      Toast.show('Camera access denied. Use manual entry below.', 'warning');
    });
  }

  function stop() {
    if (html5QrCode && isScanning) {
      html5QrCode.stop().then(() => {
        html5QrCode.clear();
        isScanning = false;
      }).catch(() => {
        isScanning = false;
      });
    }
  }

  async function onScanSuccess(decodedText) {
    // Stop scanning immediately to prevent multiple triggers
    stop();

    // Vibrate feedback if available
    if (navigator.vibrate) navigator.vibrate(100);

    Toast.show(`Scanned: ${decodedText}`, 'success');

    try {
      const result = await API.getItem(decodedText);
      navigate('item-detail', { id: result.item.id });
    } catch (e) {
      Toast.show(`Item not found: ${decodedText}`, 'error');
      // Restart scanner after brief delay
      setTimeout(() => start(), 2000);
    }
  }

  function manualLookup() {
    const input = document.getElementById('scanner-manual-input');
    const code = input?.value?.trim();

    if (!code) {
      Toast.show('Enter a barcode or item name', 'warning');
      return;
    }

    stop();
    onScanSuccess(code);
  }

  return { start, stop, manualLookup };
})();
