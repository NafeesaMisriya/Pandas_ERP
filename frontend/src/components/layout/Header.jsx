import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Calendar, ShieldCheck, ShoppingCart, Bell, User } from 'lucide-react';

const routeTitles = {
  '/': 'Dashboard Overview',
  '/billing': 'Point of Sale (POS) Billing',
  '/products': 'Product Master & Inventory',
  '/purchases': 'Supplier Purchase Entry',
  '/purchases/history': 'Purchase Audit History',
  '/bills': 'Sales Invoices & Billing History',
  '/reports': 'Financial Reports & Analytics',
  '/z-report': 'Daily Z-Report Settlement',
};

export const Header = ({ collapsed }) => {
  const location = useLocation();
  const currentTitle = routeTitles[location.pathname] || 'PANDAS ERP';

  const todayStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <header
      className={`fixed top-0 right-0 h-16 z-30 bg-[#111111] border-b border-white/10 transition-all duration-300 flex items-center justify-between px-6 ${
        collapsed ? 'left-20' : 'left-64'
      }`}
    >
      <div className="flex items-center gap-3">
        <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">{currentTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* POS Register shortcut */}
        <Link
          to="/billing"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F5B900] text-[#111111] hover:bg-gold-400 text-xs font-bold transition shadow-sm active:scale-95"
        >
          <ShoppingCart className="w-4 h-4 text-[#111111]" />
          <span>POS Register</span>
        </Link>

        {/* Date pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-xs font-medium">
          <Calendar className="w-3.5 h-3.5 text-[#F5B900]" />
          <span>{todayStr}</span>
        </div>

        {/* Database status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/30">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">PostgreSQL</span> Live
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
        </button>

        {/* User Profile Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-xs"
          title="Administrator"
        >
          <User className="w-4 h-4 text-slate-600" />
        </div>
      </div>
    </header>
  );
};
