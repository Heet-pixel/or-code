import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ScanLine,
  Receipt,
  BarChart3,
  LogOut,
  Plus,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { PageTitleProvider, usePageTitleValue } from '../context/PageTitleContext.jsx';

const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/scan', label: 'Scan', icon: ScanLine, primary: true },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/sales', label: 'Sales', icon: BarChart3 },
];

const SIDEBAR_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/create', label: 'Create QR', icon: Plus },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/billing', label: 'Billing', icon: Receipt },
  { to: '/sales', label: 'Sales', icon: BarChart3 },
];

const TITLES = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/create': 'Create QR',
  '/scan': 'Scan product',
  '/billing': 'Billing',
  '/sales': 'Sales',
};




export default function Layout() {
  return (
    <PageTitleProvider>
      <LayoutInner />
    </PageTitleProvider>
  );
}

function LayoutInner() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const { title, setTitle } = usePageTitleValue();

  useEffect(() => {
    setTitle(TITLES[location.pathname] || (location.pathname.startsWith('/products/') ? 'Product' : 'SmartQR'));
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClickAway(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const isSubPage = location.pathname.startsWith('/products/') || location.pathname === '/create';
  const initial = (user?.shopName || user?.name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Smart<span>QR</span>
        </div>
        {SIDEBAR_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <item.icon size={17} strokeWidth={2.2} /> {item.label}
          </NavLink>
        ))}
        <button className="signout" onClick={logout}>
          <LogOut size={15} strokeWidth={2.2} /> Log out
        </button>
      </aside>

      <div className="app-col">
        <header className="appbar">
          {isSubPage ? (
            <button className="appbar-back" onClick={() => history.back()} aria-label="Back">
              <ChevronLeft size={22} />
            </button>
          ) : (
            <div className="appbar-brand">
              Smart<span>QR</span>
            </div>
          )}
          <div className="appbar-title">{title}</div>
          <div className="appbar-account" ref={menuRef}>
            <button className="avatar" onClick={() => setMenuOpen((v) => !v)} aria-label="Account menu">
              {initial}
            </button>
            {menuOpen && (
              <div className="account-menu">
                <div className="account-menu-name">{user?.shopName || user?.name}</div>
                <div className="account-menu-email">{user?.email}</div>
                <button onClick={logout}>
                  <LogOut size={15} strokeWidth={2.2} /> Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="main">
          <Outlet />
        </main>
      </div>

      <nav className="tabbar">
        {NAV_ITEMS.map((item) =>
          item.primary ? (
            <NavLink key={item.to} to={item.to} className="tab-fab-wrap">
              <span className="tab-fab">
                <item.icon size={22} strokeWidth={2.4} />
              </span>
            </NavLink>
          ) : (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              <item.icon size={20} strokeWidth={2.1} />
              <span>{item.label}</span>
            </NavLink>
          )
        )}
      </nav>
    </div>
  );
}
