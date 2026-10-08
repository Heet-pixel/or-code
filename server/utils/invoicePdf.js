const PDFDocument = require('pdfkit');

function money(n) {
  return `Rs ${Number(n || 0).toFixed(2)}`;
}

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

// Builds the invoice fully in memory and resolves with a Buffer.
async function buildInvoicePdfBuffer(sale, shop) {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  const done = collect(doc);

  const colX = { name: 40, qty: 300, price: 360, sub: 450 };
  const bottomLimit = doc.page.height - 80;

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(shop.shopName || shop.name, 40, 40);
  doc.font('Helvetica').fontSize(10).fillColor('#555555').text(shop.email);
  doc.moveDown(1.2);

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#111111').text(`Invoice ${sale.invoiceNumber}`);
  doc.font('Helvetica').fontSize(9).fillColor('#555555').text(new Date(sale.createdAt).toLocaleString('en-IN'));
  if (sale.customerName) {
    doc.text(`Customer: ${sale.customerName}${sale.customerPhone ? ' - ' + sale.customerPhone : ''}`);
  }
  doc.moveDown(0.8);

  function drawHeader(y) {
    doc.font('Helvetica').fontSize(9).fillColor('#888888');
    doc.text('ITEM', colX.name, y, { lineBreak: false });
    doc.text('QTY', colX.qty, y, { lineBreak: false });
    doc.text('PRICE', colX.price, y, { lineBreak: false });
    doc.text('SUBTOTAL', colX.sub, y, { lineBreak: false });
    doc.moveTo(40, y + 14).lineTo(555, y + 14).lineWidth(0.5).strokeColor('#dddddd').stroke();
    return y + 22;
  }

  let y = drawHeader(doc.y);

  sale.items.forEach((item) => {
    doc.font('Helvetica').fontSize(10).fillColor('#111111');
    const nameHeight = doc.heightOfString(item.productName, { width: 240 });
    const rowHeight = Math.max(nameHeight, 12) + 8;

    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawHeader(40);
      doc.font('Helvetica').fontSize(10).fillColor('#111111');
    }

    doc.text(item.productName, colX.name, y, { width: 240 });
    doc.text(String(item.quantity), colX.qty, y, { lineBreak: false });
    doc.text(money(item.priceAtSale), colX.price, y, { lineBreak: false });
    doc.text(money(item.subtotal), colX.sub, y, { lineBreak: false });
    y += rowHeight;
  });

  // totals block needs ~70pt; start a new page if it won't fit
  if (y + 70 > bottomLimit) {
    doc.addPage();
    y = 40;
  }

  doc.moveTo(40, y + 2).lineTo(555, y + 2).lineWidth(0.5).strokeColor('#dddddd').stroke();
  y += 14;

  doc.font('Helvetica').fontSize(10).fillColor('#111111');
  doc.text(`Subtotal: ${money(sale.subtotal)}`, 330, y, { width: 225, align: 'right', lineBreak: false });
  y += 16;
  if (sale.gstTotal > 0) {
    doc.text(`GST: ${money(sale.gstTotal)}`, 330, y, { width: 225, align: 'right', lineBreak: false });
    y += 16;
  }
  doc.font('Helvetica-Bold').fontSize(13).text(`Total: ${money(sale.total)}`, 330, y, {
    width: 225,
    align: 'right',
    lineBreak: false,
  });

  // footer on every page
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#999999')
      .text(`Thank you for your purchase.  Page ${i - range.start + 1} of ${range.count}`, 40, doc.page.height - 60, {
        width: 515,
        align: 'center',
        lineBreak: false,
      });
  }

  doc.end();
  return done;
}

module.exports = { buildInvoicePdfBuffer };
