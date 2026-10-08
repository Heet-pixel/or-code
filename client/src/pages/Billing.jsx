import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import api, { openPdf } from '../api';
import { cameraErrorMessage, makeScanGate } from '../camera';

function rupees(n) {
  return `\u20B9${Number(n || 0).toFixed(2)}`;
}

export default function Billing() {
  const location = useLocation();
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const gateRef = useRef(makeScanGate());
  const handledStateRef = useRef(false);
  const cartRef = useRef([]);
  const [cart, setCart] = useState([]); // { product, quantity }
  const [manualCode, setManualCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [completing, setCompleting] = useState(false);

  // keep a ref copy of the cart so async callbacks (the scanner) see the latest value
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  useEffect(() => {
    const scanner = new Html5Qrcode('billing-qr-reader');
    scannerRef.current = scanner;
    return () => {
      try {
        if (scanner.isScanning) {
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {});
        }
      } catch {
        /* already torn down */
      }
    };
  }, []);

  // "Add to bill" from the Scan page. Guarded so React StrictMode's double
  // effect run in development can't add the product twice, and the router
  // state is cleared so a page refresh doesn't add it again.
  useEffect(() => {
    const code = location.state?.addProductId;
    if (code && !handledStateRef.current) {
      handledStateRef.current = true;
      addByCode(code);
      navigate('/billing', { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addByCode(rawCode) {
    const code = String(rawCode || '').trim();
    if (!code) return;
    setError('');
    try {
      const res = await api.get(`/products/by-code/${encodeURIComponent(code)}`);
      addToCart(res.data.product);
    } catch (err) {
      setError(err.response?.data?.message || 'Product not found');
    }
  }

  function addToCart(product) {
    const existing = cartRef.current.find((l) => l.product.productId === product.productId);
    const currentQty = existing ? existing.quantity : 0;

    if (product.stock < 1) {
      setError(`${product.name} is out of stock`);
      return;
    }
    if (currentQty + 1 > product.stock) {
      setError(`Only ${product.stock} unit(s) of ${product.name} in stock`);
      return;
    }

    setCart((prev) => {
      const found = prev.find((l) => l.product.productId === product.productId);
      if (found) {
        // refresh the product snapshot too, so price/stock shown stay current
        return prev.map((l) =>
          l.product.productId === product.productId ? { product, quantity: l.quantity + 1 } : l
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function changeQty(productId, delta) {
    setError('');
    setCart((prev) =>
      prev.map((l) =>
        l.product.productId === productId
          ? { ...l, quantity: Math.max(1, Math.min(l.quantity + delta, l.product.stock)) }
          : l
      )
    );
  }

  function removeLine(productId) {
    setCart((prev) => prev.filter((l) => l.product.productId !== productId));
  }

  async function startScan() {
    setError('');
    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (text) => {
          const code = text.trim();
          // one scan = one add, even though the camera keeps seeing the code
          if (gateRef.current(code)) addByCode(code);
        },
        () => {} // per-frame "no QR found" - ignore
      );
      setScanning(true);
    } catch (err) {
      setError(cameraErrorMessage(err));
    }
  }

  async function stopScan() {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch {
      /* ignore */
    }
    setScanning(false);
  }

  const subtotal = cart.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const gstTotal = cart.reduce((s, l) => s + (l.product.price * l.quantity * (l.product.gst || 0)) / 100, 0);
  const total = subtotal + gstTotal;

  async function completeBill() {
    if (cart.length === 0 || completing) return;
    setCompleting(true);
    setError('');

    let sale;
    try {
      const res = await api.post('/sales', {
        items: cart.map((l) => ({ productId: l.product.productId, quantity: l.quantity })),
        customerName,
      });
      sale = res.data.sale;
    } catch (err) {
      setError(err.response?.data?.message || 'Could not complete the bill');
      setCompleting(false);
      return;
    }

    // the sale is already recorded and stock already deducted at this point -
    // whatever happens with the invoice download below is a separate concern
    setCart([]);
    setCustomerName('');
    setCompleting(false);
    try {
      await openPdf(`/sales/${sale._id}/invoice-pdf`, `${sale.invoiceNumber}.pdf`);
    } catch {
      // openPdf already showed its own alert describing the download failure
    }
    navigate('/sales');
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="pos-layout">
        <div className="card">
          <h3 style={{ marginBottom: 12 }}>Add products</h3>
          <div id="billing-qr-reader" style={{ maxWidth: 320 }} />
          {!scanning ? (
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={startScan}>
              Scan QR code
            </button>
          ) : (
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={stopScan}>
              Stop scanning
            </button>
          )}

          <div className="field" style={{ marginTop: 16, maxWidth: 320 }}>
            <label htmlFor="manual">Add by product ID</label>
            <input
              id="manual"
              placeholder="PRD-8F92K31A"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCode.trim()) {
                  addByCode(manualCode.trim());
                  setManualCode('');
                }
              }}
            />
          </div>
        </div>

        <div className="card cart">
          <h3 style={{ marginBottom: 4 }}>Current bill</h3>
          {cart.length === 0 && <p style={{ color: 'var(--slate)', fontSize: 14 }}>Scan or add a product to start a bill.</p>}

          {cart.map((line) => (
            <div className="cart-line" key={line.product.productId}>
              <div className="info">
                <div className="name">{line.product.name}</div>
                <div className="pid">{line.product.productId}</div>
              </div>
              <div className="qty-stepper">
                <button onClick={() => changeQty(line.product.productId, -1)}>&minus;</button>
                <span>{line.quantity}</span>
                <button onClick={() => changeQty(line.product.productId, 1)}>+</button>
              </div>
              <div style={{ width: 70, textAlign: 'right', fontSize: 14 }}>{rupees(line.product.price * line.quantity)}</div>
              <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeLine(line.product.productId)}>
                &times;
              </button>
            </div>
          ))}

          {cart.length > 0 && (
            <>
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="customer">Customer name (optional)</label>
                <input id="customer" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>

              <div className="checkout-footer">
                <div className="checkout-totals">
                  <div className="cart-total-row">
                    <span>Subtotal</span>
                    <span>{rupees(subtotal)}</span>
                  </div>
                  {gstTotal > 0 && (
                    <div className="cart-total-row">
                      <span>GST</span>
                      <span>{rupees(gstTotal)}</span>
                    </div>
                  )}
                  <div className="cart-total-row grand">
                    <span>Total</span>
                    <span>{rupees(total)}</span>
                  </div>
                </div>

                <button className="btn btn-primary btn-block" onClick={completeBill} disabled={completing}>
                  {completing ? 'Completing...' : `Complete bill \u00b7 ${rupees(total)}`}
                </button>
                <button className="btn btn-ghost btn-block checkout-clear" onClick={() => setCart([])}>
                  Clear cart
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
