import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { openPdf } from '../api';

const empty = {
  name: '',
  price: '',
  stock: '',
  category: '',
  gst: '',
  description: '',
  sku: '',
  brand: '',
  unit: 'pc',
};

export default function CreateProduct() {
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [copies, setCopies] = useState(10);

  function set(field) {
    return (e) => setForm({ ...form, [field]: e.target.value });
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Product name is required');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/products', {
        ...form,
        price: form.price ? Number(form.price) : 0,
        stock: form.stock ? Number(form.stock) : 0,
        gst: form.gst ? Number(form.gst) : 0,
      });
      setCreated(res.data.product);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create the product');
    } finally {
      setBusy(false);
    }
  }

  function downloadPdf() {
    openPdf(`/products/${created._id}/qr-pdf?copies=${copies}`, `${created.productId}-labels.pdf`);
  }

  if (created) {
    return (
      <div>
        <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
          <div className="qr-tag" style={{ marginBottom: 20 }}>
            <img src={created.qrDataUrl} alt="QR code" />
            <div className="pid">{created.productId}</div>
            <div style={{ fontWeight: 600 }}>{created.name}</div>
          </div>

          <p style={{ fontSize: 13, color: 'var(--slate)', marginBottom: 16 }}>
            This QR code only stores the product ID, not the price - so you can update pricing later without reprinting it.
          </p>

          <div className="field">
            <label htmlFor="copies">How many QR code copies do you want?</label>
            <input
              id="copies"
              type="number"
              min={1}
              max={200}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />
          </div>
          <button className="btn btn-primary btn-block" onClick={downloadPdf}>
            Generate PDF
          </button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 10 }} onClick={() => navigate('/products')}>
            Go to products
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={onSubmit} className="card" style={{ maxWidth: 520, margin: '0 auto', paddingBottom: 24 }}>
        <div className="field">
          <label htmlFor="name">Product name *</label>
          <input id="name" required value={form.name} onChange={set('name')} autoFocus />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="price">Price</label>
            <input id="price" type="number" min="0" step="0.01" inputMode="decimal" value={form.price} onChange={set('price')} />
          </div>
          <div className="field">
            <label htmlFor="stock">Stock quantity</label>
            <input id="stock" type="number" min="0" inputMode="numeric" value={form.stock} onChange={set('stock')} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="category">Category</label>
            <input id="category" value={form.category} onChange={set('category')} />
          </div>
          <div className="field">
            <label htmlFor="gst">GST %</label>
            <input id="gst" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.gst} onChange={set('gst')} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="sku">SKU / product code</label>
            <input id="sku" value={form.sku} onChange={set('sku')} />
          </div>
          <div className="field">
            <label htmlFor="brand">Brand</label>
            <input id="brand" value={form.brand} onChange={set('brand')} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="unit">Unit</label>
          <input id="unit" value={form.unit} onChange={set('unit')} placeholder="pc, kg, box..." />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" rows={3} value={form.description} onChange={set('description')} />
        </div>

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating...' : 'Save & generate QR code'}
        </button>
      </form>
    </div>
  );
}
