import React, { useState, useEffect, useCallback } from 'react';
import { profitApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Package,
  Percent, Download, RefreshCw, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

const PERIODS = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
];

function KpiCard({ title, value, prefix = '₹', suffix = '', icon: Icon, color, trend }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    cyan: 'bg-cyan-50 text-cyan-600',
  };
  const isPositive = parseFloat(value) >= 0;

  return (
    <div className="bg-white rounded-xl border p-4 flex items-start gap-3 hover:shadow-md transition">
      <div className={`p-2.5 rounded-lg ${colorMap[color] || colorMap.blue}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 truncate">{title}</p>
        <p className={`text-lg font-bold ${trend && !isPositive ? 'text-red-600' : 'text-gray-900'}`}>
          {prefix}{typeof value === 'number' ? value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value}{suffix}
        </p>
      </div>
      {trend && (
        <div className={`flex items-center gap-0.5 text-xs font-semibold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
        </div>
      )}
    </div>
  );
}

export const ProfitLoss = () => {
  const toast = useToast();

  // Summary
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Report
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await profitApi.summary(params);
      setSummary(res.data);
    } catch {
      toast.error('Failed to load P&L summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [startDate, endDate]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params = { period };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await profitApi.report(params);
      setReport(res.data || []);
    } catch {
      toast.error('Failed to load P&L report');
    } finally {
      setReportLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);
  useEffect(() => { fetchReport(); }, [fetchReport]);

  const exportCsv = () => {
    if (!report.length) return;
    const headers = ['Period', 'Total Sales', 'Net Sales', 'COGS', 'Gross Profit', 'Gross Margin %', 'Operating Expenses', 'Operating Profit'];
    const rows = report.map(r => [
      r.period, r.total_sales.toFixed(2), r.net_sales.toFixed(2), r.cogs.toFixed(2),
      r.gross_profit.toFixed(2), r.gross_margin.toFixed(2), r.operating_expenses.toFixed(2), r.operating_profit.toFixed(2)
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `profit_loss_${period}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Profit & Loss</h2>
          <p className="text-sm text-gray-500 mt-1">Financial performance overview</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { fetchSummary(); fetchReport(); }}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button onClick={exportCsv} disabled={!report.length}
            className="px-3 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] transition flex items-center gap-1.5 font-semibold disabled:opacity-40">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summaryLoading ? (
        <div className="text-center py-8 text-gray-400">Loading summary...</div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard title="Total Sales" value={summary.total_sales} icon={ShoppingCart} color="blue" />
          <KpiCard title="Net Sales" value={summary.net_sales} icon={DollarSign} color="indigo" />
          <KpiCard title="Cost of Goods Sold" value={summary.cogs} icon={Package} color="amber" />
          <KpiCard title="Gross Profit" value={summary.gross_profit} icon={TrendingUp} color="green" trend />
          <KpiCard title="Gross Margin" value={summary.gross_margin} prefix="" suffix="%" icon={Percent} color="cyan" />
          <KpiCard title="Operating Expenses" value={summary.operating_expenses} icon={TrendingDown} color="red" />
          <KpiCard title="Operating Profit" value={summary.operating_profit} icon={TrendingUp} color="purple" trend />
          <div className="bg-gradient-to-br from-[#111] to-[#333] rounded-xl p-4 flex flex-col justify-center text-white">
            <p className="text-xs text-white/60">Report Period</p>
            <p className="text-sm font-semibold mt-1">{summary.start_date} → {summary.end_date}</p>
            <p className="text-[10px] text-white/40 mt-2">Based on completed sales only</p>
          </div>
        </div>
      ) : null}

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-600">Period:</span>
          <div className="flex rounded-lg border overflow-hidden">
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  period === p.value ? 'bg-[#111] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[#F5B900]/30" />
            <span className="text-gray-400">to</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-[#F5B900]/30" />
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#111] text-white">
                <th className="px-4 py-3 text-left font-semibold">Period</th>
                <th className="px-4 py-3 text-right font-semibold">Total Sales</th>
                <th className="px-4 py-3 text-right font-semibold">Net Sales</th>
                <th className="px-4 py-3 text-right font-semibold">COGS</th>
                <th className="px-4 py-3 text-right font-semibold">Gross Profit</th>
                <th className="px-4 py-3 text-right font-semibold">Margin %</th>
                <th className="px-4 py-3 text-right font-semibold">Expenses</th>
                <th className="px-4 py-3 text-right font-semibold">Operating Profit</th>
              </tr>
            </thead>
            <tbody>
              {reportLoading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading report...</td></tr>
              ) : report.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No data for the selected period</td></tr>
              ) : report.map((r, i) => (
                <tr key={r.period} className={`border-t hover:bg-gray-50 transition ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                  <td className="px-4 py-3 font-medium">{r.period}</td>
                  <td className="px-4 py-3 text-right">₹{r.total_sales.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">₹{r.net_sales.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right text-amber-700">₹{r.cogs.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${r.gross_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    ₹{r.gross_profit.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                  </td>
                  <td className="px-4 py-3 text-right">{r.gross_margin.toFixed(1)}%</td>
                  <td className="px-4 py-3 text-right text-red-600">₹{r.operating_expenses.toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className={`px-4 py-3 text-right font-bold ${r.operating_profit >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    ₹{r.operating_profit.toLocaleString('en-IN', {minimumFractionDigits: 2})}
                  </td>
                </tr>
              ))}
            </tbody>
            {report.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-[#111] bg-gray-100 font-bold text-sm">
                  <td className="px-4 py-3">TOTAL</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.total_sales, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.net_sales, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.cogs, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.gross_profit, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.operating_expenses, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-right">₹{report.reduce((s,r) => s+r.operating_profit, 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="text-xs text-gray-400 text-center pb-4">
        Operating Profit does not include taxes, interest, or other financial items. Do not treat as final net profit.
      </div>
    </div>
  );
};

export default ProfitLoss;

