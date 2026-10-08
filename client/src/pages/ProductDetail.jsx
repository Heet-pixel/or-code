import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { openPdf } from '../api';
import { usePageTitle } from '../context/PageTitleContext.jsx';

const FIELDS = [
  ['name', 'Product name', 'text'],
  ['price', 'Price', 'number'],
  ['stock', 'Stock quantity', 'number'],
  ['category', 'Category', 'text'],
  ['gst', 'GST %', 'number'],
  ['sku', 'SKU / product code', 'text'],
  ['brand', 'Brand', 'text'],
  ['unit', 'Unit', 'text'],
];

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [copies, setCopies] = useState(10);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [restockQty, setRestockQty] = useState('');
  const [restocking, setRestocking] = useState(false);

  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoadError('');
    api
      .get(`/products/${id}`)
      .then((res) => {
        setProduct(res.data.product);
        setForm(res.data.product);
      })
      .catch((err) => setLoadError(err.response?.data?.message || 'Could not load this product'));
  }, [id]);

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await api.put(`/products/${id}`, form);
      setProduct(res.data.product);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save changes');
    } finally {
      setSaving(false);
    }
  }

  async function addBatch() {
    const quantity = Number(restockQty);
    if (!quantity || quantity < 1) {
      setError('Enter a quantity of at least 1');
      return;
    }
    setRestocking(true);
    setError('');
    try {
      const res = await api.post(`/products/${id}/restock`, { quantity });
      setProduct(res.data.product);
      setForm(res.data.product);
      setRestockQty('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add stock');
    } finally {
      setRestocking(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${id}`);
      navigate('/products');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not delete the product');
    }
  }

  usePageTitle(product?.name);

  if (loadError) return <div className="error-banner">{loadError}</div>;
  if (!product) return <p>Loading...</p>;

  return (
    <div>
      <div className="page-actions">
        {!editing && (
          <button className="btn btn-ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button className="btn btn-danger" onClick={remove}>
          Delete
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid detail-split">
        <div className="card">
          {editing ? (
            <>
              {FIELDS.map(([key, label, type]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{label}</label>
                  <input
                    id={key}
                    type={type}
                    step={type === 'number' ? 'any' : undefined}
                    value={form[key] ?? ''}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
              <div className="field">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  rows={3}
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" onClick={save} disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setForm(product);
                    setEditing(false);
                  }}
                >
                  Cancel
                </button>
              </div>
              <p className="hint" style={{ marginTop: 10 }}>
                Note: editing details never changes the QR code - it always keeps pointing at the same product.
              </p>
            </>
          ) : (
            <dl className="spec-list">
              <dt style={{ color: 'var(--slate)' }}>Product ID</dt>
              <dd className="mono">{product.productId}</dd>
              <dt style={{ color: 'var(--slate)' }}>Price</dt>
              <dd>&#8377;{product.price}</dd>
              <dt style={{ color: 'var(--slate)' }}>Stock</dt>
              <dd>
                {product.stock} {product.unit}
                {product.batches?.length > 0 && (
                  <span style={{ color: 'var(--slate)', fontSize: 12 }}> &middot; Batch {product.batches[product.batches.length - 1].batchNumber}</span>
                )}
              </dd>
              <dt style={{ color: 'var(--slate)' }}>Category</dt>
              <dd>{product.category || '-'}</dd>
              <dt style={{ color: 'var(--slate)' }}>GST</dt>
              <dd>{product.gst}%</dd>
              <dt style={{ color: 'var(--slate)' }}>SKU</dt>
              <dd>{product.sku || '-'}</dd>
              <dt style={{ color: 'var(--slate)' }}>Brand</dt>
              <dd>{product.brand || '-'}</dd>
              <dt style={{ color: 'var(--slate)' }}>Description</dt>
              <dd>{product.description || '-'}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <div className="qr-tag" style={{ marginBottom: 16 }}>
            <img src={product.qrDataUrl} alt="QR code" />
            <div className="pid">{product.productId}</div>
          </div>
          <div className="field">
            <label htmlFor="copies">Copies to print</label>
            <input id="copies" type="number" min={1} max={200} value={copies} onChange={(e) => setCopies(e.target.value)} />
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => openPdf(`/products/${id}/qr-pdf?copies=${copies}`, `${product.productId}-labels.pdf`)}
          >
            Generate QR PDF
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginBottom: 4 }}>Stock batches</h3>
        <p className="hint" style={{ marginBottom: 14 }}>
          Every time you add stock, it's recorded as its own numbered batch - selling stock never changes this history.
        </p>

        <div className="field-row" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="restockQty">Add stock quantity</label>
            <input
              id="restockQty"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 1000"
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={addBatch} disabled={restocking}>
            {restocking ? 'Adding...' : `Add as Batch ${(product.batches?.length || 0) + 1}`}
          </button>
        </div>

        {product.batches?.length > 0 ? (
          <div className="row-list flush" style={{ marginTop: 4 }}>
            {[...product.batches]
              .sort((a, b) => b.batchNumber - a.batchNumber)
              .map((b) => (
                <div className="row-item" key={b.batchNumber}>
                  <div className="row-body">
                    <div className="row-title">Batch {b.batchNumber}</div>
                    <div className="row-sub">{new Date(b.addedAt).toLocaleString()}</div>
                  </div>
                  <div className="row-end">
                    <div className="row-price">+{b.quantity}</div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p style={{ color: 'var(--slate)', fontSize: 13 }}>No batches recorded yet.</p>
        )}
      </div>
    </div>
  );
}
