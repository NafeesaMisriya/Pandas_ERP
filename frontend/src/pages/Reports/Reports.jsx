import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Calendar,
  Search,
  ArrowRight,
  IndianRupee,
  Layers,
  Package,
  CalendarCheck,
  TrendingUp,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { reportsApi } from '../../services/api';
import { Loading } from '../../components/common/Loading';

export const Reports = () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = async (from = fromDate, to = toDate) => {
    try {
      setLoading(true);
      const res = await reportsApi.get({ from_date: from, to_date: to });
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(fromDate, toDate);
  }, []);

  const handleFilter = (e) => {
    e.preventDefault();
    fetchReports(fromDate, toDate);
  };

  const handleQuickPreset = (daysBack) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - daysBack);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    setFromDate(startStr);
    setToDate(endStr);
    fetchReports(startStr, endStr);
  };

  const handleThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    setFromDate(firstDay);
    setToDate(today);
    fetchReports(firstDay, today);
  };

  const totalSales = data?.total_sales || 0;
  const totalBills = data?.total_bills || 0;
  const avgOrderValue = totalBills > 0 ? totalSales / totalBills : 0;
  const maxCategorySales = Math.max(...(data?.category_sales?.map((c) => c.total) || [1]), 1);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Analytics</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Sales Reports</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Custom date interval revenue breakdowns, category distributions and SKU volumes</p>
        </div>

        <Link
          to="/z-report"
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-xs transition active:scale-95"
        >
          <CalendarCheck className="w-4 h-4 text-[#111111]" />
          <span>Daily Z-Report</span>
        </Link>
      </div>

      {/* Date Filter & Preset Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] mr-1">Presets:</span>
          <button
            onClick={() => handleQuickPreset(0)}
            className={`px-3 py-1.5 rounded-xl font-bold transition active:scale-95 ${
              fromDate === todayStr && toDate === todayStr
                ? 'bg-[#F5B900] text-[#111111] shadow-xs font-black'
                : 'bg-slate-100 text-slate-600 hover:bg-gold-50/60 hover:text-slate-900'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => handleQuickPreset(7)}
            className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-gold-50/60 hover:text-slate-900 transition active:scale-95"
          >
            Last 7 Days
          </button>
          <button
            onClick={() => handleQuickPreset(30)}
            className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-gold-50/60 hover:text-slate-900 transition active:scale-95"
          >
            Last 30 Days
          </button>
          <button
            onClick={handleThisMonth}
            className="px-3 py-1.5 rounded-xl font-bold bg-slate-100 text-slate-600 hover:bg-gold-50/60 hover:text-slate-900 transition active:scale-95"
          >
            This Month
          </button>
        </div>

        {/* Date Input Form */}
        <form
          onSubmit={handleFilter}
          className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs"
        >
          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-bold text-[11px]">From:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-slate-500 font-bold text-[11px]">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#111111] hover:bg-black text-[#F5B900] font-bold rounded-xl border border-[#F5B900]/30 shadow-xs transition active:scale-95"
          >
            <Search className="w-3.5 h-3.5 text-[#F5B900]" />
            <span>Apply Filter</span>
          </button>
        </form>
      </div>

      {/* Metric Summaries */}
      {loading ? (
        <Loading text="Compiling financial statistics..." fullHeight />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-4 hover:border-gold-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-gold-50 text-gold-600 border border-gold-200 flex items-center justify-center shrink-0">
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Gross Sales
                </span>
                <p className="text-2xl font-black text-navy-900 mt-0.5 tracking-tight">
                  ₹{totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-slate-400 font-medium">
                  Interval: {data?.from_date} to {data?.to_date}
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-4 hover:border-gold-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-slate-50 text-slate-700 border border-slate-200 flex items-center justify-center shrink-0">
                <Receipt className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Settled Invoices
                </span>
                <p className="text-2xl font-black text-navy-900 mt-0.5 tracking-tight">
                  {totalBills} bills
                </p>
                <span className="text-[11px] text-slate-400 font-medium">
                  Excludes voided/cancelled transactions
                </span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex items-center gap-4 hover:border-gold-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-gold-50/60 text-navy-900 border border-gold-200/60 flex items-center justify-center shrink-0">
                <TrendingUp className="w-6 h-6 text-gold-600" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Avg. Transaction Value
                </span>
                <p className="text-2xl font-black text-navy-900 mt-0.5 tracking-tight">
                  ₹{avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-[11px] text-slate-400 font-medium">
                  Average bill basket size
                </span>
              </div>
            </div>
          </div>

          {/* Department Breakdown & Product Sales */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Category breakdown (5 cols) */}
            <div className="lg:col-span-5 bg-white p-5 md:p-6 rounded-2xl border border-slate-200/90 shadow-xs">
              <h3 className="font-bold text-navy-900 text-sm mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider text-[11px]">
                Department Revenue Contribution
              </h3>

              <div className="space-y-4 text-xs">
                {data?.category_sales?.length > 0 ? (
                  data.category_sales.map((cat, idx) => {
                    const percent = totalSales > 0 ? Math.round((cat.total / totalSales) * 100) : 0;
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between font-medium">
                          <span className="text-slate-700 font-bold">{cat.category}</span>
                          <span className="text-navy-900 font-black">
                            ₹{cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                            <span className="text-slate-400 text-[11px] font-semibold">({percent}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gold-500 rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.round((cat.total / maxCategorySales) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs">No category sales in this range.</div>
                )}
              </div>
            </div>

            {/* Item-wise sales breakdown (7 cols) */}
            <div className="lg:col-span-7 bg-white p-5 md:p-6 rounded-2xl border border-slate-200/90 shadow-xs">
              <h3 className="font-bold text-navy-900 text-sm mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider text-[11px]">
                Product-wise Sales Volume
              </h3>

              <div className="max-h-[420px] overflow-y-auto">
                {data?.items?.length > 0 ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3 text-center">Units Sold</th>
                        <th className="py-2.5 px-3 text-right">Gross Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-gold-50/40 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {it.product_name}
                          </td>
                          <td className="py-2.5 px-3 text-center font-black text-navy-900">
                            {it.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-black text-navy-900">
                            ₹{it.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs">No items sold in this period.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
