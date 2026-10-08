const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema(
  {
    batchNumber: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: String, required: true }, // e.g. PRD-8F92K31A, encoded in the QR
    name: { type: String, required: true, trim: true },
    price: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    category: { type: String, trim: true, default: '' },
    gst: { type: Number, default: 0, min: 0, max: 100 }, // percent
    description: { type: String, default: '' },
    sku: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    unit: { type: String, trim: true, default: 'pc' },
    lowStockThreshold: { type: Number, default: 5 },
    qrDataUrl: { type: String, default: '' }, // cached PNG data-url of the QR
    // Batch 1 is whatever stock the product was created with; every later
    // stock addition (a restock) becomes Batch 2, Batch 3, and so on. This
    // is purely a record of *additions* - selling stock never touches it.
    batches: { type: [batchSchema], default: [] },
  },
  { timestamps: true }
);

productSchema.index({ userId: 1, productId: 1 }, { unique: true });
productSchema.index({ userId: 1, name: 'text', sku: 'text', brand: 'text' });

module.exports = mongoose.model('Product', productSchema);
