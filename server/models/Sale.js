const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    priceAtSale: { type: Number, required: true }, // per-unit price when sold
    gstAtSale: { type: Number, default: 0 },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true },
    items: { type: [saleItemSchema], required: true, validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true },
    gstTotal: { type: Number, default: 0 },
    total: { type: Number, required: true },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Sale', saleSchema);
