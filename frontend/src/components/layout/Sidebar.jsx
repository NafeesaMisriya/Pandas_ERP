import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  History,
  FileText,
  BarChart3,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Store
} from 'lucide-react';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Billing / POS', path: '/billing', icon: ShoppingCart },
  { name: 'Products Master', path: '/products', icon: Package },
  { name: 'Purchase Entry', path: '/purchases', icon: Truck },
  { name: 'Purchase History', path: '/purchases/history', icon: History },
  { name: 'Invoices & Bills', path: '/bills', icon: FileText },
  { name: 'Sales Reports', path: '/reports', icon: BarChart3 },
  { name: 'Daily Z-Report', path: '/z-report', icon: CalendarCheck },
];

export const Sidebar = ({ collapsed, setCollapsed }) => {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-40 bg-navy-900 text-slate-300 transition-all duration-300 flex flex-col border-r border-navy-800 shadow-xl ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-navy-800 bg-navy-950">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="bg-white rounded-xl p-1 flex items-center justify-center shrink-0 shadow-md h-10 w-10 overflow-hidden">
            <img src="/logo.png" alt="PANDAS Logo" className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <span className="font-extrabold text-white text-base tracking-wider block">PANDAS</span>
              <span className="block text-[10px] text-emerald-400 font-bold tracking-wider uppercase">
                Nuts &amp; Chocolates
              </span>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 transition"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </button>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-3.5 py-3 rounded-xl font-medium text-sm transition-all duration-200 group ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'text-slate-300 hover:bg-navy-800/80 hover:text-white'
                }`
              }
              title={collapsed ? item.name : undefined}
            >
              <Icon className="w-5 h-5 shrink-0 transition group-hover:scale-105" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer Info */}
      {!collapsed && (
        <div className="p-4 border-t border-navy-800 bg-navy-950/60 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-slate-300">POS Online</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">v2.0 • PostgreSQL Connected</div>
        </div>
      )}
    </aside>
  );
};
