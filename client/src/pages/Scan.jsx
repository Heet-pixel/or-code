import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Link } from 'react-router-dom';
import api from '../api';
import { cameraErrorMessage, makeScanGate } from '../camera';

export default function Scan() {
  const scannerRef = useRef(null);
  const gateRef = useRef(makeScanGate());
  const [running, setRunning] = useState(false);
  const [product, setProduct] = useState(null);
  const [error, setError] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
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
        /* scanner already torn down */
      }
    };
  }, []);

  async function lookup(code) {
    if (!code) return;
    setError('');
    try {
      const res = await api.get(`/products/by-code/${encodeURIComponent(code)}`);
      setProduct(res.data.product);
    } catch (err) {
      setProduct(null);
      setError(err.response?.data?.message || 'Could not find that product');
    }
  }

  async function start() {
    setError('');
    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          const code = decodedText.trim();
          if (gateRef.current(code)) lookup(code);
        },
        () => {} // per-frame "no QR found" - ignore
      );
      setRunning(true);
    } catch (err) {
      setError(cameraErrorMessage(err));
    }
  }

  async function stop() {
    try {
      if (scannerRef.current?.isScanning) await scannerRef.current.stop();
    } catch {
      /* ignore */
    }
    setRunning(false);
  }

  return (
    <div>
      <div className="grid scan-split">
        <div className="card">
          <div id="qr-reader" style={{ width: '100%', minHeight: running ? 'auto' : 0 }} />
          {!running ? (
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={start}>
              Start camera
            </button>
          ) : (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={stop}>
              Stop camera
            </button>
          )}

          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="manual">Or enter product code manually</label>
            <input
              id="manual"
              placeholder="PRD-8F92K31A"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup(manualCode.trim())}
            />
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => lookup(manualCode.trim())}>
            Look up
          </button>
        </div>

        <div className="card">
          {error && <div className="error-banner">{error}</div>}

          {!product && !error && (
            <p style={{ color: 'var(--slate)' }}>Scan a QR label or type a code to see the latest product info.</p>
          )}

          {product && (
            <div className="scan-result">
              <img src={product.qrDataUrl} alt="" width={90} height={90} />
              <div className="info">
                <h3>{product.name}</h3>
                <div className="price">&#8377;{product.price}</div>
                <p style={{ color: 'var(--slate)', fontSize: 13 }}>Available stock: {product.stock}</p>
                <Link
                  to="/billing"
                  state={{ addProductId: product.productId }}
                  className="btn btn-primary"
                  style={{ marginTop: 10, display: 'inline-block', textDecoration: 'none' }}
                >
                  Add to bill
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
