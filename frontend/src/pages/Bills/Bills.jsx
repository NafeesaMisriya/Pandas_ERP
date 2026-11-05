import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  FileText,
  Printer,
  FileDown,
  XCircle,
  Eye,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  X,
  CreditCard,
  DollarSign,
  Smartphone,
  Phone,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react';
import { billsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

export const Bills = () => {
  const toast = useToast();

  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [dateFilterType, setDateFilterType] = useState('all'); // 'all' | 'single' | 'range'
  const [singleDate, setSingleDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Selected bill modal
  const [selectedBill, setSelectedBill] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchBills = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        page_size: pageSize,
      };

      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      if (paymentFilter !== 'ALL') {
        params.payment_mode = paymentFilter;
      }

      if (dateFilterType === 'single' && singleDate) {
        params.date = singleDate;
      } else if (dateFilterType === 'range') {
        if (fromDate) params.from_date = fromDate;
        if (toDate) params.to_date = toDate;
      }

      const res = await billsApi.list(params);
      const data = res.data;

      if (Array.isArray(data)) {
        setBills(data);
        setTotalCount(data.length);
        setTotalPages(1);
      } else {
        setBills(data.bills || []);
        setTotalCount(data.total || 0);
        setTotalPages(data.total_pages || 1);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchTerm, paymentFilter, dateFilterType, singleDate, fromDate, toDate, toast]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const handleSearchChange = (val) => {
    setSearchTerm(val);
    setPage(1);
  };

  const handlePaymentFilterChange = (mode) => {
    setPaymentFilter(mode);
    setPage(1);
  };

  const handleDateFilterTypeChange = (type) => {
    setDateFilterType(type);
    setPage(1);
  };

  const handleSingleDateChange = (date) => {
    setSingleDate(date);
    setPage(1);
  };

  const handleFromDateChange = (date) => {
    setFromDate(date);
    setPage(1);
  };

  const handleToDateChange = (date) => {
    setToDate(date);
    setPage(1);
  };

  // Quick Date Presets
  const setQuickToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setDateFilterType('single');
    setSingleDate(today);
    setPage(1);
  };

  const setQuickYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    setDateFilterType('single');
    setSingleDate(yesterday);
    setPage(1);
  };

  const setQuickLast7Days = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    setDateFilterType('range');
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(end.toISOString().split('T')[0]);
    setPage(1);
  };

  const setQuickThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setDateFilterType('range');
    setFromDate(firstDay);
    setToDate(today);
    setPage(1);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setPaymentFilter('ALL');
    setDateFilterType('all');
    setSingleDate('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(searchTerm.trim()) ||
    paymentFilter !== 'ALL' ||
    (dateFilterType === 'single' && Boolean(singleDate)) ||
    (dateFilterType === 'range' && (Boolean(fromDate) || Boolean(toDate))) ||
    dateFilterType !== 'all';

  const handleViewBill = async (invoiceNo) => {
    try {
      setLoadingDetail(true);
      const res = await billsApi.get(invoiceNo);
      setSelectedBill(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Could not load invoice details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCancelBill = async (invoiceNo) => {
    if (!window.confirm(`Are you sure you want to cancel invoice ${invoiceNo}? This status will reflect in the Daily Z-Report.`)) return;

    try {
      await billsApi.cancel(invoiceNo);
      toast.warning(`Invoice ${invoiceNo} marked as CANCELLED`);
      fetchBills();
      if (selectedBill?.invoice_no === invoiceNo) {
        setSelectedBill({ ...selectedBill, status: 'CANCELLED' });
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to cancel bill');
    }
  };

  return (
    <div className="space-y-5 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Sales</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Invoices &amp; Receipts</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Search customer transactions, filter by date, open archived PDF bills, and audit register slips</p>
        </div>

        {/* Global Summary Badge */}
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/80">
            Total Invoices: <span className="text-[#111111] font-black">{totalCount}</span>
          </span>
        </div>
      </div>

      {/* Main Filter & Search Console */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3.5">
        {/* Top Filter Row: Search & Date Filter Mode Toggle */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Universal Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Invoice ID, Customer Name, or Phone..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs font-medium transition"
            />
            {searchTerm && (
              <button
                onClick={() => handleSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Date Filter Type Tabs */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl text-xs shrink-0 self-start lg:self-auto border border-slate-200/60">
            <button
              onClick={() => handleDateFilterTypeChange('all')}
              className={`px-3 py-1.5 rounded-lg font-bold transition active:scale-95 ${
                dateFilterType === 'all'
                  ? 'bg-white text-slate-900 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Dates
            </button>
            <button
              onClick={() => handleDateFilterTypeChange('single')}
              className={`px-3 py-1.5 rounded-lg font-bold transition active:scale-95 ${
                dateFilterType === 'single'
                  ? 'bg-[#F5B900] text-[#111111] shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Specific Date
            </button>
            <button
              onClick={() => handleDateFilterTypeChange('range')}
              className={`px-3 py-1.5 rounded-lg font-bold transition active:scale-95 ${
                dateFilterType === 'range'
                  ? 'bg-[#F5B900] text-[#111111] shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Date Range
            </button>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="px-3.5 py-2 text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-xl border border-rose-200 transition flex items-center justify-center gap-1.5 shrink-0 active:scale-95 shadow-xs"
              title="Reset all filters"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        {/* Date Selection Panel (When Single Date or Date Range is active) */}
        {dateFilterType === 'single' && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2.5 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#F5B900]" />
                Invoice Date:
              </span>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => handleSingleDateChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
              {singleDate && (
                <button
                  onClick={() => handleSingleDateChange('')}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                  title="Clear date"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quick:</span>
              <button
                onClick={setQuickToday}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-gold-50 hover:text-slate-900 text-slate-600 rounded-lg transition"
              >
                Today
              </button>
              <button
                onClick={setQuickYesterday}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-gold-50 hover:text-slate-900 text-slate-600 rounded-lg transition"
              >
                Yesterday
              </button>
            </div>
          </div>
        )}

        {dateFilterType === 'range' && (
          <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#F5B900]" />
                From Date:
              </span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => handleFromDateChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold">To Date:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => handleToDateChange(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(''); setToDate(''); setPage(1); }}
                  className="text-slate-400 hover:text-slate-600 text-xs p-1"
                  title="Clear range"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Quick:</span>
              <button
                onClick={setQuickToday}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-gold-50 hover:text-slate-900 text-slate-600 rounded-lg transition"
              >
                Today
              </button>
              <button
                onClick={setQuickLast7Days}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-gold-50 hover:text-slate-900 text-slate-600 rounded-lg transition"
              >
                Last 7 Days
              </button>
              <button
                onClick={setQuickThisMonth}
                className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-gold-50 hover:text-slate-900 text-slate-600 rounded-lg transition"
              >
                This Month
              </button>
            </div>
          </div>
        )}

        {/* Bottom Filter Row: Payment Mode Filter Pills */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-bold px-1 uppercase tracking-wider text-[11px]">Payment:</span>
            {['ALL', 'Cash', 'UPI', 'Card'].map((mode) => (
              <button
                key={mode}
                onClick={() => handlePaymentFilterChange(mode)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition active:scale-95 ${
                  paymentFilter === mode
                    ? 'bg-[#F5B900] text-[#111111] shadow-xs font-black'
                    : 'bg-slate-100 text-slate-600 hover:bg-gold-50 hover:text-slate-900'
                }`}
              >
                {mode === 'ALL' ? 'All Methods' : mode}
              </button>
            ))}
          </div>

          {/* Active Results Metric */}
          <div className="text-[11px] text-slate-400 font-semibold">
            Showing <span className="text-slate-800 font-bold">{bills.length}</span> of{' '}
            <span className="text-slate-800 font-bold">{totalCount}</span> filtered invoices
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
        {loading ? (
          <div className="py-20">
            <Loading text="Loading sales invoices..." />
          </div>
        ) : bills.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm space-y-3">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-bold text-slate-700 text-sm">No invoices found matching your query.</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search terms, changing the date range, or resetting filters.
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold bg-[#F5B900] text-[#111111] rounded-xl hover:bg-[#E5AC00] transition active:scale-95"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Invoice No</th>
                  <th className="py-3.5 px-4">Customer Details</th>
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-4">Payment Mode</th>
                  <th className="py-3.5 px-4">Total Amount (₹)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((b) => (
                  <tr key={b.invoice_no} className="hover:bg-gold-50/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <button
                        onClick={() => handleViewBill(b.invoice_no)}
                        className="hover:text-gold-600 hover:underline text-left font-bold"
                      >
                        {b.invoice_no}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{b.customer_name}</div>
                      {b.customer_phone ? (
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{b.customer_phone}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 font-medium">{b.created_at}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-bold text-[11px]">
                        {b.payment_mode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                      ₹{b.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={b.status === 'PAID' ? 'success' : 'danger'} size="sm">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewBill(b.invoice_no)}
                          className="p-1.5 text-slate-400 hover:text-navy-900 hover:bg-gold-50 rounded-lg transition"
                          title="View Breakdown Modal"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <a
                          href={`/bill/${b.invoice_no}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-navy-900 hover:bg-gold-50 rounded-lg transition"
                          title="Print Receipt Template"
                        >
                          <Printer className="w-4 h-4" />
                        </a>

                        <a
                          href={`/bill/${b.invoice_no}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition"
                          title="Download PDF Invoice"
                        >
                          <FileDown className="w-4 h-4" />
                        </a>

                        {b.status === 'PAID' ? (
                          <button
                            onClick={() => handleCancelBill(b.invoice_no)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Cancel Bill"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : (
                          <span className="p-1.5 text-slate-300">-</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/50 text-xs">
            <span className="text-slate-500 font-medium">
              Showing{' '}
              <span className="font-bold text-slate-800">
                {Math.min((page - 1) * pageSize + 1, totalCount)}
              </span>
              –
              <span className="font-bold text-slate-800">
                {Math.min(page * pageSize, totalCount)}
              </span>{' '}
              of <span className="font-bold text-slate-800">{totalCount}</span> invoices
            </span>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition active:scale-95"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 font-bold text-slate-800 shadow-xs">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition active:scale-95"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bill Detail Modal (Customer-facing invoice document uses logob.png) */}
      <Modal
        isOpen={!!selectedBill}
        onClose={() => setSelectedBill(null)}
        title={`Invoice Breakdown: ${selectedBill?.invoice_no}`}
        maxWidth="max-w-2xl"
      >
        {selectedBill && (
          <div className="space-y-4 text-xs">
            {/* Store Branding Header (Customer-facing document uses logob.png) */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between pb-3 border-b border-slate-100 gap-2">
              <img src="/logob.png" alt="PANDAS" className="h-10 object-contain" />
              <div className="sm:text-right text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700">Near Bus Stop, Kottappuram</p>
                <p>+91-9847345005</p>
              </div>
            </div>

            {/* Header Summary */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                  Customer Information
                </span>
                <h4 className="font-bold text-slate-900 text-sm mt-0.5">
                  {selectedBill.customer_name}
                </h4>
                {selectedBill.customer_phone && (
                  <p className="text-slate-500 text-[11px] font-mono mt-0.5">
                    Phone: {selectedBill.customer_phone}
                  </p>
                )}
                <p className="text-slate-400 text-[11px] mt-1">Date: {selectedBill.created_at}</p>
              </div>

              <div className="text-right">
                <Badge variant={selectedBill.status === 'PAID' ? 'success' : 'danger'} size="md">
                  {selectedBill.status}
                </Badge>
                <div className="mt-2 font-black text-slate-900 text-xl">
                  ₹{selectedBill.total.toFixed(2)}
                </div>
                <span className="text-[11px] text-slate-400 font-semibold">Payment: {selectedBill.payment_mode}</span>
              </div>
            </div>

            {/* Line items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Price</th>
                    <th className="py-2.5 px-3">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBill.items?.map((it, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{it.product_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">₹{it.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{it.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        ₹{it.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              <div>
                {selectedBill.status === 'PAID' && (
                  <button
                    onClick={() => handleCancelBill(selectedBill.invoice_no)}
                    className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold transition text-xs"
                  >
                    Cancel Invoice
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`/bill/${selectedBill.invoice_no}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-navy-900 hover:bg-navy-800 text-white rounded-xl font-bold transition shadow-xs text-xs active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </a>

                <a
                  href={`/bill/${selectedBill.invoice_no}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-gold-500 hover:bg-gold-400 text-navy-900 rounded-xl font-bold transition shadow-xs text-xs active:scale-95"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
