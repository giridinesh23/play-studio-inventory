/**
 * Play Studio Bhutan - Barcode Scanner Module
 * Uses html5-qrcode library for camera-based scanning
 */

const Scanner = (() => {
  let html5QrCode = null;
  let isScanning = false;

  async function start() {
    const readerEl = document.getElementById('scanner-reader');
    if (!readerEl) return;

    // Clean up previous instance — AWAIT completion
    await stop();

    if (typeof Html5Qrcode === 'undefined') {
      Toast.show('Scanner library not loaded', 'error');
      return;
    }

    try {
      html5QrCode = new Html5Qrcode('scanner-reader');

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          aspectRatio: 1.0
        },
        onScanSuccess,
        () => {} // ignore scan failures
      );
      isScanning = true;
    } catch (err) {
      console.warn('Camera error:', err);
      Toast.show('Camera access denied or unavailable. Use manual entry.', 'warning');
    }
  }

  async function stop() {
    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (e) {
        // ignore stop errors
      }
      isScanning = false;
    }
    html5QrCode = null;
  }

  async function onScanSuccess(decodedText) {
    // Stop scanning immediately to prevent multiple triggers
    await stop();

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
