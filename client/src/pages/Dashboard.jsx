import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

function rupees(n) {
  return `\u20B9${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Could not load dashboard'));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <p>Loading your dashboard...</p>;

  const chartData = {
    labels: data.dailyRevenue.map((d) => d._id.slice(5)),
    datasets: [
      {
        label: 'Revenue',
        data: data.dailyRevenue.map((d) => d.revenue),
        backgroundColor: '#0fa37f',
        borderRadius: 4,
      },
    ],
  };

  return (
    <div>
      <div className="grid stat-grid">
        <div className="stat">
          <div className="label">Total products</div>
          <div className="value">{data.totalProducts}</div>
        </div>
        <div className="stat">
          <div className="label">Total stock</div>
          <div className="value">{data.totalStock}</div>
        </div>
        <div className="stat">
          <div className="label">Today's sales</div>
          <div className="value">{rupees(data.today.revenue)}</div>
        </div>
        <div className="stat">
          <div className="label">Total revenue (30d)</div>
          <div className="value">{rupees(data.monthly.revenue)}</div>
        </div>
        <div className={`stat ${data.lowStockProducts.length ? 'warn' : ''}`}>
          <div className="label">Low stock items</div>
          <div className="value">{data.lowStockProducts.length}</div>
        </div>
      </div>

      <div className="grid dash-split">
        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Revenue, last 7 days</h3>
          {data.dailyRevenue.length ? (
            <Bar data={chartData} options={{ plugins: { legend: { display: false } } }} height={220} />
          ) : (
            <p style={{ color: 'var(--slate)' }}>No sales yet this week.</p>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 14 }}>Best sellers (30d)</h3>
          {data.bestSellers.length === 0 && <p style={{ color: 'var(--slate)' }}>Nothing sold yet.</p>}
          {data.bestSellers.map((p) => (
            <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
              <span>{p.name}</span>
              <span style={{ color: 'var(--slate)' }}>{p.unitsSold} sold</span>
            </div>
          ))}
        </div>
      </div>

      {data.lowStockProducts.length > 0 && (
        <div className="card" style={{ marginTop: 16, padding: '8px 0' }}>
          <h3 style={{ margin: '6px 16px 8px' }}>Running low</h3>
          <div className="row-list flush">
            {data.lowStockProducts.map((p) => (
              <Link key={p._id} to={`/products/${p._id}`} className="row-item">
                <div className="row-body">
                  <div className="row-title">{p.name}</div>
                </div>
                <div className="row-end">
                  <span className="badge low">{p.stock} left</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
