import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import api, { openPdf } from '../api';

function rupees(n) {
  return `\u20B9${Number(n || 0).toFixed(2)}`;
}

export default function Sales() {
  const [sales, setSales] = useState(null);

  useEffect(() => {
    api.get('/sales').then((res) => setSales(res.data.sales));
  }, []);

  if (!sales) return <p>Loading sales...</p>;

  return (
    <div>
      {sales.length === 0 ? (
        <div className="empty-state">
          <h3>No sales yet</h3>
          <p>Completed bills will show up here with a downloadable invoice.</p>
        </div>
      ) : (
        <div className="sale-list">
          {sales.map((s) => (
            <button key={s._id} className="sale-card" onClick={() => openPdf(`/sales/${s._id}/invoice-pdf`, `${s.invoiceNumber}.pdf`)}>
              <div className="sale-card-icon">
                <FileText size={18} strokeWidth={2} />
              </div>
              <div className="sale-card-body">
                <div className="sale-card-top">
                  <span className="mono">{s.invoiceNumber}</span>
                  <span className="sale-card-total">{rupees(s.total)}</span>
                </div>
                <div className="sale-card-meta">
                  {new Date(s.createdAt).toLocaleString()} &middot; {s.items.reduce((n, i) => n + i.quantity, 0)} item(s)
                  {s.customerName ? ` \u00b7 ${s.customerName}` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
