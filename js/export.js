/**
 * Play Studio Bhutan - Export Module
 * PDF export via jsPDF, Excel export via SheetJS
 */

const ExportUtil = (() => {

  function toPDF(title, headers, rows) {
    if (typeof jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      Toast.show('PDF library not loaded', 'error');
      return;
    }

    const { jsPDF: JSPDF } = window.jspdf || { jsPDF: window.jsPDF };
    const doc = new JSPDF();

    // Header
    doc.setFontSize(18);
    doc.setTextColor(26, 26, 46);
    doc.text('Play Studio Bhutan', 14, 20);

    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(title, 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(`Generated: ${new Date().toLocaleDateString()} | ${rows.length} records`, 14, 37);

    // Table
    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        head: [headers],
        body: rows,
        startY: 42,
        theme: 'grid',
        headStyles: {
          fillColor: [201, 168, 76],
          textColor: [26, 26, 46],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [50, 50, 50]
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245]
        },
        margin: { left: 14, right: 14 }
      });
    } else {
      // Fallback without autotable
      let y = 45;
      doc.setFontSize(8);
      doc.setTextColor(0);

      // Headers
      headers.forEach((h, i) => {
        doc.text(h, 14 + i * 35, y);
      });
      y += 6;

      rows.forEach(row => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        row.forEach((cell, i) => {
          doc.text(String(cell || ''), 14 + i * 35, y);
        });
        y += 5;
      });
    }

    doc.save(`${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
    Toast.show('PDF downloaded', 'success');
  }

  function toExcel(title, headers, rows) {
    if (typeof XLSX === 'undefined') {
      Toast.show('Excel library not loaded', 'error');
      return;
    }

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = headers.map(() => ({ wch: 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));

    XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
    Toast.show('Excel downloaded', 'success');
  }

  return { toPDF, toExcel };
})();
