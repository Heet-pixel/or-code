const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const User = require('../models/User');
const { newInvoiceNumber } = require('../utils/ids');
const { buildInvoicePdfBuffer } = require('../utils/invoicePdf');

router.use(requireAuth);

// Completes a bill: validates stock, decrements it atomically per line item,
// and snapshots the price/gst charged so later price edits never rewrite history.
router.post('/', async (req, res, next) => {
  const { items, customerName, customerPhone } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Cart is empty' });
  }

  // Validate and merge duplicate lines for the same product
  const merged = new Map();
  for (const line of items) {
    const qty = Number(line && line.quantity);
    if (!line || typeof line.productId !== 'string' || !line.productId.trim() || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: 'Each cart line needs a productId and a whole-number quantity of at least 1' });
    }
    const code = line.productId.trim().toUpperCase();
    merged.set(code, (merged.get(code) || 0) + qty);
  }

  const decremented = []; // for rollback if a later item fails

  try {
    const lineItems = [];

    for (const [code, qty] of merged) {
      // Only decrement stock if enough is available - this is the guard against overselling
      // eslint-disable-next-line no-await-in-loop
      const product = await Product.findOneAndUpdate(
        { userId: req.userId, productId: code, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true }
      );

      if (!product) {
        // eslint-disable-next-line no-await-in-loop
        const existing = await Product.findOne({ userId: req.userId, productId: code });
        if (!existing) {
          throw Object.assign(new Error(`Product ${code} not found`), { status: 404 });
        }
        throw Object.assign(
          new Error(`Only ${existing.stock} unit(s) of "${existing.name}" are available`),
          { status: 409 }
        );
      }

      decremented.push({ productId: code, qty });

      // subtotal is price x qty only - GST is broken out separately at the
      // sale level below, so line subtotals always add up to sale.subtotal
      lineItems.push({
        productId: product.productId,
        productName: product.name,
        quantity: qty,
        priceAtSale: product.price,
        gstAtSale: product.gst || 0,
        subtotal: Number((product.price * qty).toFixed(2)),
      });
    }

    const subtotal = lineItems.reduce((sum, i) => sum + i.priceAtSale * i.quantity, 0);
    const gstTotal = lineItems.reduce((sum, i) => sum + (i.priceAtSale * i.quantity * i.gstAtSale) / 100, 0);
    const total = Number((subtotal + gstTotal).toFixed(2));

    // invoice numbers are random-suffixed; retry on the (very rare) collision
    let sale;
    for (let attempt = 0; attempt < 5 && !sale; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        sale = await Sale.create({
          userId: req.userId,
          invoiceNumber: newInvoiceNumber(),
          items: lineItems,
          subtotal: Number(subtotal.toFixed(2)),
          gstTotal: Number(gstTotal.toFixed(2)),
          total,
          customerName: typeof customerName === 'string' ? customerName.trim() : '',
          customerPhone: typeof customerPhone === 'string' ? customerPhone.trim() : '',
        });
      } catch (err) {
        if (!(err.code === 11000 && attempt < 4)) throw err;
      }
    }

    res.status(201).json({ sale });
  } catch (err) {
    // undo any stock we already took before the failure
    for (const d of decremented) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await Product.updateOne({ userId: req.userId, productId: d.productId }, { $inc: { stock: d.qty } });
      } catch (rollbackErr) {
        console.error('Stock rollback failed for', d.productId, rollbackErr);
      }
    }
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { from, to, limit } = req.query;
    const query = { userId: req.userId };
    if (from || to) {
      query.createdAt = {};
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to) : null;
      if (f && !Number.isNaN(f.getTime())) query.createdAt.$gte = f;
      if (t && !Number.isNaN(t.getTime())) query.createdAt.$lte = t;
      if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
    }
    const sales = await Sale.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(limit, 10) || 200, 500));
    res.json({ sales });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, userId: req.userId });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json({ sale });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/invoice-pdf', async (req, res, next) => {
  try {
    const sale = await Sale.findOne({ _id: req.params.id, userId: req.userId });
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    const shop = await User.findById(req.userId);
    if (!shop) return res.status(404).json({ message: 'Account not found' });

    const pdf = await buildInvoicePdfBuffer(sale, shop);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `inline; filename="${sale.invoiceNumber}.pdf"`);
    res.end(pdf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
