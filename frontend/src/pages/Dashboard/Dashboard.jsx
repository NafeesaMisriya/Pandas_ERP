import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  Package,
  AlertTriangle,
  XCircle,
  ShoppingCart,
  Truck,
  CalendarCheck,
  ArrowRight,
  IndianRupee,
  Layers,
  MapPin,
  Phone,
  Store,
  Clock,
  CheckCircle2,
  FileText,
  Printer,
  FileDown,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { dashboardApi } from '../../services/api';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';

export const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await dashboardApi.getStats();
      setStats(res.data);
      setError(null);
    } catch (err) {
      console.error('Failed to load dashboard statistics', err);
      setError('Unable to load statistics. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <Loading text="Fetching live store metrics..." fullHeight />;

  if (error) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-center animate-fadeIn">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
        <h3 className="text-lg font-bold">Connection Issue</h3>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-4 px-5 py-2.5 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700 transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // Core KPI cards — all white backgrounds with gold accents matching reference design
  const summaryCards = [
    {
      title: "TODAY'S GROSS SALES",
      value: `₹${(stats?.today_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      subtitle: `${stats?.today_bills || 0} completed invoices today`,
      icon: ShoppingCart,
      isPrimary: true,
      iconColor: 'text-[#F5B900]',
      iconBg: 'bg-amber-50 border border-amber-200 text-[#F5B900]',
      cardBorder: 'border-2 border-amber-300/80 shadow-xs hover:border-[#F5B900]',
      action: () => navigate('/bills'),
      actionText: 'View Invoices',
    },
    {
      title: 'LOW STOCK ALERTS',
      value: `${stats?.low_stock_count || 0} items`,
      subtitle: 'Between 1 and 5 units remaining',
      icon: AlertTriangle,
      isPrimary: false,
      iconColor: 'text-[#F5B900]',
      iconBg: 'bg-amber-50 border border-amber-200 text-[#F5B900]',
      cardBorder: 'border border-slate-200/90 shadow-xs hover:border-amber-300',
      action: () => navigate('/products?filter=low-stock'),
      actionText: 'Filter Low Stock',
    },
    {
      title: 'OUT OF STOCK ITEMS',
      value: `${stats?.out_of_stock_count || 0} ${stats?.out_of_stock_count === 1 ? 'item' : 'items'}`,
      subtitle: '0 units remaining on shelves',
      icon: XCircle,
      isPrimary: false,
      iconColor: 'text-rose-500',
      iconBg: 'bg-rose-50 border border-rose-200 text-rose-500',
      cardBorder: 'border border-slate-200/90 shadow-xs hover:border-rose-300',
      action: () => navigate('/products?filter=out-of-stock'),
      actionText: 'Filter Out of Stock',
    },
    {
      title: 'TOTAL CATALOG SKUS',
      value: `${stats?.total_products || 0} products`,
      subtitle: 'Across all active categories',
      icon: Layers,
      isPrimary: false,
      iconColor: 'text-[#F5B900]',
      iconBg: 'bg-amber-50 border border-amber-200 text-[#F5B900]',
      cardBorder: 'border border-slate-200/90 shadow-xs hover:border-amber-300',
      action: () => navigate('/products'),
      actionText: 'Manage Catalog',
    },
  ];

  // Inventory distribution metrics
  const totalProducts = stats?.total_products || 0;
  const outOfStock = stats?.out_of_stock_count || 0;
  const lowStock = stats?.low_stock_count || 0;
  const inStock = Math.max(0, totalProducts - outOfStock - lowStock);
  const inStockPercent = totalProducts > 0 ? Math.round((inStock / totalProducts) * 100) : 100;

  // Department breakdown calculation
  const totalCategorySales = stats?.category_sales?.reduce((acc, c) => acc + c.total, 0) || 1;

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* 1. Shop Information Banner – Matching Reference Image */}
      <div className="bg-white rounded-2xl border border-amber-200/70 shadow-sm p-5 md:p-6 relative overflow-hidden">
        {/* Subtle decorative gold wave in bottom right */}
        <div className="absolute right-0 bottom-0 w-96 h-16 pointer-events-none opacity-40 bg-gradient-to-l from-amber-200/50 via-amber-100/20 to-transparent rounded-tl-full" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Left: Complete PANDAS logo + separator + Shop Information */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-4">
            {/* Complete original logo using logo.png */}
            <div className="flex items-center shrink-0">
              <img
                src="/logo.png"
                alt="PANDAS"
                className="h-12 md:h-14 w-auto object-contain"
              />
            </div>

            {/* Subtle vertical gold separator */}
            <div className="hidden sm:block h-12 w-px bg-amber-300/70 mx-1" />

            {/* Business Details */}
            <div className="space-y-0.5">
              <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                Nuts &amp; Chocolates
              </h1>

              <p className="text-xs text-slate-500 font-medium">
                Retail Operations &amp; Store Management System
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-[#F5B900] shrink-0" />
                  <span>Near Bus Stop, Kottappuram</span>
                </span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#F5B900] shrink-0" />
                  <span>+91-9847345005</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Quick Action Shortcuts */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0">
            <Link
              to="/billing"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl text-xs font-bold shadow-sm transition-all duration-150 active:scale-[0.98]"
            >
              <ShoppingCart className="w-4 h-4 text-[#111111]" />
              <span>Open POS Terminal</span>
            </Link>

            <Link
              to="/purchases"
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold shadow-xs transition-all duration-150 active:scale-[0.98]"
            >
              <Truck className="w-4 h-4 text-slate-700" />
              <span>Record Purchase</span>
            </Link>

            <Link
              to="/z-report"
              className="flex items-center gap-2 px-4 py-2.5 bg-[#111111] hover:bg-black text-white rounded-xl text-xs font-bold shadow-sm transition-all duration-150 active:scale-[0.98]"
            >
              <CalendarCheck className="w-4 h-4 text-[#F5B900]" />
              <span>Daily Z-Report</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. Section Heading */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-200/80">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight">Business Overview</h2>
          <p className="text-xs text-slate-500">Real-time sales performance, inventory monitoring and register audits</p>
        </div>
      </div>

      {/* 3. KPI Summary Cards – All White Backgrounds with Gold Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              onClick={card.action}
              className={`bg-white rounded-2xl p-4 md:p-5 ${card.cardBorder} cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 group flex flex-col justify-between`}
              title={`Click to ${card.actionText}`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl ${card.iconBg}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                  {card.title}
                </span>

                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="text-2xl font-black tracking-tight text-slate-900">
                    {card.value}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[11px] truncate mr-1 text-slate-500">
                  {card.subtitle}
                </span>
                <span className="text-[#F5B900] font-bold flex items-center gap-0.5 text-xs shrink-0 group-hover:translate-x-0.5 transition-transform">
                  <ChevronRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Middle Section: Inventory Alerts & Sales Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Inventory Stock Alerts */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-[#F5B900] border border-amber-200">
                <Package className="w-4 h-4 text-[#F5B900]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Inventory Attention &amp; Stock Health</h3>
                <p className="text-[11px] text-slate-500">Live monitoring of depletion thresholds</p>
              </div>
            </div>

            <Link
              to="/products?filter=low-stock"
              className="text-xs font-bold text-[#F5B900] hover:text-gold-700 flex items-center gap-1 group"
            >
              <span>View All Alerts</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Visual Stock Health Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                In Stock: <strong>{inStock} items</strong> ({inStockPercent}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Low: <strong>{lowStock}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Out of Stock: <strong>{outOfStock}</strong>
              </span>
            </div>

            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all duration-500"
                style={{ width: `${(inStock / Math.max(totalProducts, 1)) * 100}%` }}
                title={`In Stock: ${inStock}`}
              />
              <div
                className="bg-amber-500 transition-all duration-500"
                style={{ width: `${(lowStock / Math.max(totalProducts, 1)) * 100}%` }}
                title={`Low Stock: ${lowStock}`}
              />
              <div
                className="bg-rose-500 transition-all duration-500"
                style={{ width: `${(outOfStock / Math.max(totalProducts, 1)) * 100}%` }}
                title={`Out of Stock: ${outOfStock}`}
              />
            </div>
          </div>

          {/* Attention-Needed Products Table */}
          <div className="overflow-x-auto">
            {stats?.critical_products && stats.critical_products.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-amber-100 text-slate-500 font-bold uppercase tracking-wider text-[11px] bg-amber-50/40">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Current Stock</th>
                    <th className="py-2.5 px-3">Stock Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.critical_products.map((item) => {
                    const isZero = item.stock <= 0;
                    return (
                      <tr
                        key={item.item_code}
                        className={`transition-colors ${isZero ? 'bg-rose-50/40 hover:bg-rose-50/80' : 'hover:bg-slate-50/80'
                          }`}
                      >
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 block">{item.item_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">SKU: {item.item_code}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{item.category}</td>
                        <td className="py-2.5 px-3">
                          <span className={`font-black text-sm ${isZero ? 'text-rose-600' : 'text-amber-600'}`}>
                            {item.stock}
                          </span>{' '}
                          <span className="text-[11px] text-slate-400">{item.unit || 'pc'}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          {isZero ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Out of Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Low Stock (≤5)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => navigate('/purchases')}
                            className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition active:scale-95"
                            title="Create purchase order for this item"
                          >
                            Inward PO
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                <CheckCircle2 className="w-7 h-7 mx-auto text-emerald-500 mb-2" />
                <p className="font-bold text-slate-700 text-xs">Healthy Inventory Levels</p>
                <p className="text-[11px] text-slate-500 mt-0.5">All products are currently above minimum safety thresholds.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Department Sales Analytics */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-5 md:p-6 border border-slate-200/80 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-50 text-[#F5B900] border border-amber-200">
                <Layers className="w-4 h-4 text-[#F5B900]" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Department Revenue Share</h3>
                <p className="text-[11px] text-slate-500">Sales contribution by category</p>
              </div>
            </div>

            <Link
              to="/reports"
              className="text-xs font-bold text-[#F5B900] hover:text-gold-700 flex items-center gap-1 group"
            >
              <span>Full Reports</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          <div className="space-y-4">
            {stats?.category_sales?.length > 0 ? (
              stats.category_sales.map((cat, idx) => {
                const percent = Math.round((cat.total / totalCategorySales) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#F5B900]" />
                        <span className="text-slate-800 font-bold">{cat.category}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-900 font-black">
                          ₹{cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-slate-400 text-[11px] ml-1.5 font-semibold">({percent}%)</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#F5B900] rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                No departmental sales data recorded yet.
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Aggregated Gross Sales:</span>
            <span className="font-black text-slate-900 text-base">
              ₹{(stats?.total_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Recent Register Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600 border border-slate-200">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-navy-900 text-sm">Recent Sales Invoices</h3>
              <p className="text-[11px] text-slate-500">Latest completed register transactions</p>
            </div>
          </div>

          <Link
            to="/bills"
            className="text-xs font-bold text-gold-600 hover:text-gold-700 flex items-center gap-1 group"
          >
            <span>View All Invoices</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {stats?.recent_bills && stats.recent_bills.length > 0 ? (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.recent_bills.map((bill) => (
                  <tr key={bill.invoice_no} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      <Link to="/bills" className="hover:text-gold-600 hover:underline">
                        {bill.invoice_no}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{bill.customer_name}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {bill.created_at ? new Date(bill.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-700">
                        {bill.payment_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-black text-slate-900">
                      ₹{bill.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={bill.status === 'PAID' ? 'success' : 'danger'} size="sm">
                        {bill.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/bill/${bill.invoice_no}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                          title="View / Print Invoice"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </a>
                        <a
                          href={`/bill/${bill.invoice_no}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition"
                          title="Download PDF Archive"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              No recent customer invoices recorded today.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
