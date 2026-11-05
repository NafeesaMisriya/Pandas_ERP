import React from 'react';
import { useLocation } from 'react-router-dom';
import { Clock, ShieldCheck } from 'lucide-react';

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
      className={`fixed top-0 right-0 h-16 z-30 bg-white border-b border-slate-200 transition-all duration-300 flex items-center justify-between px-6 shadow-sm ${
        collapsed ? 'left-20' : 'left-64'
      }`}
    >
      <div>
        <h1 className="text-lg font-bold text-slate-800 tracking-tight">{currentTitle}</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Date pill */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{todayStr}</span>
        </div>

        {/* Database status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>PostgreSQL Live</span>
        </div>
      </div>
    </header>
  );
};
