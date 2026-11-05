import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  Receipt,
  Package,
  AlertTriangle,
  ShoppingCart,
  Truck,
  CalendarCheck,
  ArrowRight,
  IndianRupee,
  Layers
} from 'lucide-react';
import { dashboardApi } from '../../services/api';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';

export const Dashboard = () => {
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
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
        <h3 className="text-lg font-bold">Connection Issue</h3>
        <p className="text-sm mt-1">{error}</p>
        <button
          onClick={fetchStats}
          className="mt-4 px-4 py-2 bg-rose-600 text-white rounded-lg font-medium hover:bg-rose-700 transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const kpis = [
    {
      title: "Today's Gross Sales",
      value: `₹${(stats?.today_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      subtitle: `${stats?.today_bills || 0} completed invoices today`,
      icon: IndianRupee,
      color: 'emerald',
      bg: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: "Today's Bills",
      value: stats?.today_bills || 0,
      subtitle: 'Checkout receipts processed',
      icon: Receipt,
      color: 'blue',
      bg: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Active Products',
      value: stats?.total_products || 0,
      subtitle: 'Catalog SKUs available',
      icon: Package,
      color: 'indigo',
      bg: 'bg-indigo-50 text-indigo-600',
    },
    {
      title: 'Low Stock Warnings',
      value: stats?.low_stock_count || 0,
      subtitle: 'Items at or below 5 units',
      icon: AlertTriangle,
      color: 'amber',
      bg: 'bg-amber-50 text-amber-600',
    },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner & Quick Actions */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white p-2 rounded-2xl shadow-md shrink-0 flex items-center justify-center">
            <img src="/logo.png" alt="PANDAS Nuts & Chocolates" className="h-14 object-contain" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-widest text-emerald-400 font-bold">
              Near Bus Stop, Kottappuram • +91-9847345005
            </span>
            <h2 className="text-2xl font-extrabold mt-0.5 tracking-tight">PANDAS – Nuts &amp; Chocolates</h2>
            <p className="text-slate-300 text-sm mt-0.5">
              Live Store Operations, Point of Sale &amp; Inventory Management
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/billing"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-md transition"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Open POS Terminal</span>
          </Link>
          <Link
            to="/purchases"
            className="flex items-center gap-2 px-4 py-2.5 bg-navy-700 hover:bg-navy-600 text-white rounded-xl font-semibold border border-navy-600 transition"
          >
            <Truck className="w-4 h-4" />
            <span>Record Purchase</span>
          </Link>
          <Link
            to="/z-report"
            className="flex items-center gap-2 px-4 py-2.5 bg-navy-700 hover:bg-navy-600 text-white rounded-xl font-semibold border border-navy-600 transition"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Daily Z-Report</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {kpi.title}
                </span>
                <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-slate-900 tracking-tight">{kpi.value}</span>
                <p className="text-xs text-slate-500 mt-1">{kpi.subtitle}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Performance & Lifetime Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Sales distribution */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Department Sales Breakdown</h3>
              <p className="text-xs text-slate-500">Revenue contribution per product category</p>
            </div>
            <Link to="/reports" className="text-xs text-emerald-600 font-semibold hover:underline flex items-center gap-1">
              Full Report <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {stats?.category_sales?.length > 0 ? (
              stats.category_sales.map((cat, idx) => {
                const maxVal = Math.max(...stats.category_sales.map((c) => c.total), 1);
                const percent = Math.round((cat.total / maxVal) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700 font-semibold">{cat.category}</span>
                      <span className="text-slate-900 font-bold">
                        ₹{cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">
                No sales records found for category distribution.
              </div>
            )}
          </div>
        </div>

        {/* Lifetime Store Summary */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-4 border-b border-slate-100">
              <Layers className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-base">Store Lifetime Totals</h3>
            </div>

            <div className="mt-5 space-y-5">
              <div>
                <span className="text-xs text-slate-500 font-medium">Total Lifetime Turnover</span>
                <p className="text-2xl font-black text-slate-900 mt-0.5">
                  ₹{(stats?.total_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div>
                <span className="text-xs text-slate-500 font-medium">Total Invoices Settled</span>
                <p className="text-2xl font-black text-slate-900 mt-0.5">
                  {stats?.total_bills || 0}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-semibold text-slate-700">Average Invoice Value</span>
                <p className="text-lg font-bold text-emerald-700 mt-1">
                  ₹
                  {stats?.total_bills > 0
                    ? (stats.total_sales / stats.total_bills).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '0.00'}
                </p>
              </div>
            </div>
          </div>

          <Link
            to="/bills"
            className="mt-6 w-full py-2.5 text-center text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
          >
            Browse All Invoices
          </Link>
        </div>
      </div>

      {/* Recent Bills and Recent Purchases */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Bills */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Recent Sales Invoices</h3>
              <p className="text-xs text-slate-500">Latest completed counter transactions</p>
            </div>
            <Link to="/bills" className="text-xs text-emerald-600 font-semibold hover:underline">
              View All
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {stats?.recent_bills?.length > 0 ? (
              stats.recent_bills.map((bill) => (
                <div key={bill.invoice_no} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-900">{bill.invoice_no}</span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {bill.customer_name} • {bill.payment_mode}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-slate-900">
                      ₹{bill.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="mt-0.5">
                      <Badge variant={bill.status === 'PAID' ? 'success' : 'danger'} size="sm">
                        {bill.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">No recent bills found.</div>
            )}
          </div>
        </div>

        {/* Recent Purchases */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Recent Stock Purchases</h3>
              <p className="text-xs text-slate-500">Inflow shipments from suppliers</p>
            </div>
            <Link to="/purchases/history" className="text-xs text-emerald-600 font-semibold hover:underline">
              View All
            </Link>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {stats?.recent_purchases?.length > 0 ? (
              stats.recent_purchases.map((purchase) => (
                <div key={purchase.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-slate-900">{purchase.supplier_name}</span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Date: {purchase.purchase_date}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-sm text-slate-900">
                      ₹{purchase.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="mt-0.5">
                      <Badge variant="info" size="sm">
                        {purchase.bill_status || 'Received'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">No recent purchases recorded.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
