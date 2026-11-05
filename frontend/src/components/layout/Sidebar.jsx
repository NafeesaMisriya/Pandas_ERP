import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  History,
  FileText,
  BarChart3,
  CalendarCheck,
  Receipt,
  Users,
  Building2,
  ChevronLeft,
  Activity,
  CreditCard,
  Lock,
  Unlock,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Billing / POS', path: '/billing', icon: ShoppingCart },
  { name: 'Products Master', path: '/products', icon: Package },
  { name: 'Inventory & Stock', path: '/inventory', icon: Boxes },
  { name: 'Purchase Entry', path: '/purchases', icon: Truck },
  { name: 'Purchase History', path: '/purchases/history', icon: History },
  { name: 'Invoices & Bills', path: '/bills', icon: FileText },
  { name: 'Customers', path: '/customers', icon: Users },
  { name: 'Suppliers', path: '/suppliers', icon: Building2 },
  { name: 'Accounts Payable', path: '/payables', icon: CreditCard, adminOnly: true },
  { name: 'Sales Reports', path: '/reports', icon: BarChart3, adminOnly: true },
  { name: 'Daily Z-Report', path: '/z-report', icon: CalendarCheck, adminOnly: true },
  { name: 'Expenses', path: '/expenses', icon: Receipt, adminOnly: true },
  { name: 'Profit & Loss', path: '/profit-loss', icon: Activity, adminOnly: true },
];

export const Sidebar = ({ collapsed, setCollapsed }) => {
  const toast = useToast();
  const { isAdmin, mode, openLoginModal, lockAdmin } = useAuth();

  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-40 bg-[#111111] text-white transition-all duration-300 flex flex-col border-r border-white/10 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header: Psym.png + PANDAS */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 bg-[#111111]">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto flex items-center justify-center h-10 w-10 rounded-xl overflow-hidden hover:ring-2 hover:ring-[#F5B900]/50 transition"
            title="PANDAS – Click to expand"
          >
            <img
              src="/Psym.png"
              alt="P"
              className="h-9 w-9 object-contain"
            />
          </button>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <img
                src="/Psym.png"
                alt="P"
                className="h-9 w-9 object-contain shrink-0"
              />
              <span className="text-xl font-black tracking-wider text-white font-serif">
                PANDAS
              </span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition shrink-0"
              title="Collapse sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1 scrollbar-none">
        {navItems
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
          const Icon = item.icon;

          if (item.placeholder) {
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => toast.info(`${item.name} module is scheduled for the upcoming release.`)}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-medium text-sm text-white/90 hover:bg-white/10 hover:text-white transition-all duration-200 group text-left"
                title={collapsed ? item.name : undefined}
              >
                <Icon className="w-[18px] h-[18px] shrink-0 text-white/80 group-hover:text-white" />
                {!collapsed && <span className="truncate">{item.name}</span>}
              </button>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group ${
                  isActive
                    ? 'bg-[#F5B900] text-[#111111] font-black shadow-sm'
                    : 'text-white/90 hover:bg-white/10 hover:text-white'
                }`
              }
              title={collapsed ? item.name : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 ${
                      isActive ? 'text-[#111111]' : 'text-white/80 group-hover:text-white'
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                </>
              )}
            </NavLink>
          );
        })}

        {/* Cashier Mode Quick Unlock Link in Sidebar */}
        {!isAdmin && (
          <button
            type="button"
            onClick={openLoginModal}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 mt-2 rounded-xl font-semibold text-xs text-[#F5B900] bg-[#F5B900]/10 hover:bg-[#F5B900]/20 border border-[#F5B900]/30 transition group text-left"
            title={collapsed ? "Admin Access" : undefined}
          >
            <ShieldCheck className="w-[18px] h-[18px] shrink-0 text-[#F5B900]" />
            {!collapsed && <span className="truncate">Admin Access</span>}
          </button>
        )}
      </nav>

      {/* Footer Info */}
      {!collapsed && (
        <div className="p-4 border-t border-white/10 text-xs text-slate-400 bg-[#111111]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-white">POS Online</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">PostgreSQL Connected</div>
        </div>
      )}
    </aside>
  );
};
