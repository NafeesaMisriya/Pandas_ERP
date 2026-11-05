import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Calendar, Search, ArrowRight, IndianRupee, Layers, Package, CalendarCheck } from 'lucide-react';
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

  const handleToday = () => {
    setFromDate(todayStr);
    setToDate(todayStr);
    fetchReports(todayStr, todayStr);
  };

  return (
    <div className="space-y-6">
      {/* Header & Date Range Form */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Sales Reports & Financial Analytics</h2>
            <p className="text-xs text-slate-500">Custom date interval revenue and unit volume audits</p>
          </div>
        </div>

        <Link
          to="/z-report"
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-navy-900 hover:bg-navy-800 text-white rounded-xl shadow-md transition"
        >
          <CalendarCheck className="w-4 h-4 text-emerald-400" />
          <span>Daily Z-Report</span>
        </Link>
      </div>

      {/* Date Filter Bar */}
      <form
        onSubmit={handleFilter}
        className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-4 text-xs"
      >
        <div className="flex items-center gap-2">
          <label className="text-slate-600 font-bold">From:</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-slate-600 font-bold">To:</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-sm transition"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Apply Filter</span>
        </button>

        <button
          type="button"
          onClick={handleToday}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition ml-auto"
        >
          Reset to Today
        </button>
      </form>

      {/* Metric Summaries */}
      {loading ? (
        <Loading text="Compiling financial statistics..." fullHeight />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Total Gross Sales
                </span>
                <p className="text-2xl font-black text-slate-900 mt-0.5">
                  ₹{(data?.total_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
                <span className="text-xs text-slate-400">
                  Interval: {data?.from_date} to {data?.to_date}
                </span>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Completed Sales Invoices
                </span>
                <p className="text-2xl font-black text-slate-900 mt-0.5">
                  {data?.total_bills || 0} bills
                </p>
                <span className="text-xs text-slate-400">Only PAID transactions calculated</span>
              </div>
            </div>
          </div>

          {/* Department Breakdown & Product Sales */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Category breakdown */}
            <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider text-[11px]">
                Department / Category Sales
              </h3>

              <div className="space-y-4 text-xs">
                {data?.category_sales?.length > 0 ? (
                  data.category_sales.map((cat, idx) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-700 font-bold">{cat.category}</span>
                        <span className="text-slate-900 font-extrabold">
                          ₹{cat.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (cat.total / Math.max(...data.category_sales.map((c) => c.total), 1)) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400">No category sales in this range.</div>
                )}
              </div>
            </div>

            {/* Item-wise sales breakdown */}
            <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h3 className="font-bold text-slate-900 text-sm mb-4 pb-2 border-b border-slate-100 uppercase tracking-wider text-[11px]">
                Product-wise Sales Volume
              </h3>

              <div className="max-h-[420px] overflow-y-auto">
                {data?.items?.length > 0 ? (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-3 text-center">Units Sold</th>
                        <th className="py-2 px-3 text-right">Gross Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {it.product_name}
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                            {it.quantity}
                          </td>
                          <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                            ₹{it.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-12 text-center text-slate-400">No items sold in this period.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
