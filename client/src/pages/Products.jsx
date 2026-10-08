import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Plus, ChevronRight } from 'lucide-react';
import api from '../api';

function stockBadge(product) {
  if (product.stock <= 0) return <span className="badge out">Out of stock</span>;
  if (product.stock <= product.lowStockThreshold) return <span className="badge low">{product.stock} left</span>;
  return <span className="badge ok">{product.stock} in stock</span>;
}

export default function Products() {
  const [products, setProducts] = useState(null);
  const [search, setSearch] = useState('');

  function load(q = '') {
    api
      .get('/products', { params: q ? { search: q } : {} })
      .then((res) => setProducts(res.data.products))
      .catch(() => setProducts((prev) => prev || []));
  }

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="page-with-fab">
      <div className="search-bar">
        <Search size={17} strokeWidth={2} />
        <input placeholder="Search by name, SKU or product ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {products && products.length === 0 && (
        <div className="empty-state">
          <h3>No products yet</h3>
          <p>Create your first product to generate its QR code.</p>
          <Link to="/create" className="btn btn-primary" style={{ marginTop: 12, display: 'inline-block' }}>
            + New product
          </Link>
        </div>
      )}

      <div className="row-list">
        {products?.map((p) => (
          <Link key={p._id} to={`/products/${p._id}`} className="row-item">
            <img className="row-thumb" src={p.qrDataUrl} alt="" width={44} height={44} />
            <div className="row-body">
              <div className="row-title">{p.name}</div>
              <div className="row-sub mono">{p.productId}</div>
            </div>
            <div className="row-end">
              <div className="row-price">&#8377;{p.price}</div>
              {stockBadge(p)}
            </div>
            <ChevronRight size={18} className="row-chevron" strokeWidth={2} />
          </Link>
        ))}
      </div>

      <Link to="/create" className="fab" aria-label="Create product">
        <Plus size={24} strokeWidth={2.4} />
      </Link>
    </div>
  );
}
