/**
 * Play Studio Bhutan - Barcode Generation & Print Module
 * Uses JsBarcode library (Code128)
 */

const BarcodeUtil = (() => {

  function generate(elementId, barcodeValue, options = {}) {
    if (typeof JsBarcode === 'undefined') {
      console.warn('JsBarcode not loaded');
      return;
    }

    try {
      JsBarcode(`#${elementId}`, barcodeValue, {
        format: 'CODE128',
        width: options.width || 2,
        height: options.height || 60,
        displayValue: true,
        fontSize: options.fontSize || 14,
        font: 'monospace',
        textMargin: 4,
        margin: 10,
        background: '#ffffff',
        lineColor: '#000000'
      });
    } catch (e) {
      console.error('Barcode generation error:', e);
    }
  }

  function renderPreview(containerId, barcodeValue, itemName) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <svg id="barcode-preview-svg"></svg>
      <div class="barcode-label">${itemName || ''}</div>
    `;

    generate('barcode-preview-svg', barcodeValue);
  }

  return { generate, renderPreview };
})();
