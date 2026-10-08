const router = require('express').Router();
const requireAuth = require('../middleware/auth');
const Product = require('../models/Product');
const { newProductId } = require('../utils/ids');
const { makeQrDataUrl, buildQrPdfBuffer } = require('../utils/qrSheet');

router.use(requireAuth);

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns '' / undefined / garbage into a safe number (or the fallback)
function toNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function badRequest(res, message) {
  return res.status(400).json({ message });
}

// Create a product and its QR code (QR only ever encodes the product id)
router.post('/', async (req, res, next) => {
  try {
    const { name, category, description, sku, brand, unit } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest(res, 'Product name is required');
    }

    const price = toNumber(req.body.price);
    const stock = toNumber(req.body.stock);
    const gst = toNumber(req.body.gst);
    const lowStockThreshold = toNumber(req.body.lowStockThreshold, 5);

    if (price < 0) return badRequest(res, 'Price cannot be negative');
    if (stock < 0) return badRequest(res, 'Stock cannot be negative');
    if (gst < 0 || gst > 100) return badRequest(res, 'GST must be between 0 and 100');

    // find an unused productId (collisions are astronomically unlikely, but be safe)
    let productId = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = newProductId();
      // eslint-disable-next-line no-await-in-loop
      const clash = await Product.exists({ userId: req.userId, productId: candidate });
      if (!clash) {
        productId = candidate;
        break;
      }
    }
    if (!productId) {
      return res.status(500).json({ message: 'Could not generate a unique product ID, please try again' });
    }

    const qrDataUrl = await makeQrDataUrl(productId);

    const product = await Product.create({
      userId: req.userId,
      productId,
      name: name.trim(),
      price,
      stock,
      category,
      gst,
      description,
      sku,
      brand,
      unit: unit || 'pc',
      lowStockThreshold,
      qrDataUrl,
      // whatever stock the product launches with is Batch 1
      batches: stock > 0 ? [{ batchNumber: 1, quantity: stock, addedAt: new Date() }] : [],
    });

    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

// List all of this user's products, newest first, with optional search
router.get('/', async (req, res, next) => {
  try {
    const { search } = req.query;
    const query = { userId: req.userId };
    if (search && typeof search === 'string' && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), 'i');
      query.$or = [{ name: rx }, { sku: rx }, { productId: rx }, { brand: rx }];
    }
    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json({ products });
  } catch (err) {
    next(err);
  }
});

// Look a product up by its scanned/typed product id - this is what powers
// both the scanner page and manual entry in billing.
router.get('/by-code/:productId', async (req, res, next) => {
  try {
    // be forgiving about case and stray whitespace when typed by hand
    const code = String(req.params.productId || '').trim().toUpperCase();
    const product = await Product.findOne({ userId: req.userId, productId: code });
    if (!product) return res.status(404).json({ message: 'No product matches that code' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

// Edit product details. Price/stock/etc can change freely - the QR code
// (and productId it encodes) is never touched here.
router.put('/:id', async (req, res, next) => {
  try {
    const updates = {};

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) {
        return badRequest(res, 'Product name cannot be empty');
      }
      updates.name = req.body.name.trim();
    }

    ['price', 'stock', 'gst', 'lowStockThreshold'].forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = toNumber(req.body[field]);
    });

    ['category', 'description', 'sku', 'brand', 'unit'].forEach((field) => {
      if (req.body[field] !== undefined && req.body[field] !== null) updates[field] = String(req.body[field]);
    });

    if (updates.price !== undefined && updates.price < 0) return badRequest(res, 'Price cannot be negative');
    if (updates.stock !== undefined && updates.stock < 0) return badRequest(res, 'Stock cannot be negative');
    if (updates.gst !== undefined && (updates.gst < 0 || updates.gst > 100)) {
      return badRequest(res, 'GST must be between 0 and 100');
    }

    const product = await Product.findOneAndUpdate({ _id: req.params.id, userId: req.userId }, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
});

// Adds new stock as a new numbered batch (Batch 1 is set at creation time
// above; this covers every restock after that - Batch 2, Batch 3, ...).
// Selling stock through a sale never touches batches, only this does.
router.post('/:id/restock', async (req, res, next) => {
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isFinite(quantity) || quantity < 1) {
      return badRequest(res, 'Enter a quantity of at least 1');
    }

    // Retry a couple of times in case two restocks race for the same batch number
    for (let attempt = 0; attempt < 3; attempt++) {
      // eslint-disable-next-line no-await-in-loop
      const existing = await Product.findOne({ _id: req.params.id, userId: req.userId });
      if (!existing) return res.status(404).json({ message: 'Product not found' });

      const nextBatchNumber =
        existing.batches.length > 0 ? Math.max(...existing.batches.map((b) => b.batchNumber)) + 1 : 1;

      // Only apply if the batch list hasn't changed since we read it
      // eslint-disable-next-line no-await-in-loop
      const product = await Product.findOneAndUpdate(
        { _id: req.params.id, userId: req.userId, batches: { $size: existing.batches.length } },
        {
          $inc: { stock: quantity },
          $push: { batches: { batchNumber: nextBatchNumber, quantity, addedAt: new Date() } },
        },
        { new: true }
      );
      if (product) return res.json({ product });
    }
    return res.status(409).json({ message: 'Another restock was in progress, please try again' });
  } catch (err) {
    next(err);
  }
});

// Streams back a printable PDF sheet with N copies of this product's QR label
router.get('/:id/qr-pdf', async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, userId: req.userId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const copies = Math.min(Math.max(parseInt(req.query.copies, 10) || 1, 1), 200);

    // Build fully in memory first so any failure still yields a clean JSON error
    const pdf = await buildQrPdfBuffer({ productId: product.productId, productName: product.name, copies });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.length);
    res.setHeader('Content-Disposition', `inline; filename="${product.productId}-labels.pdf"`);
    res.end(pdf);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
