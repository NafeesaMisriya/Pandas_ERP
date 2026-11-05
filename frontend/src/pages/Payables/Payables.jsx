import React, { useState, useEffect, useCallback } from 'react';
import { payablesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import {
  CreditCard,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Filter,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  X,
  FileText,
  Calendar,
  RotateCcw,
  PlusCircle,
  Eye,
  TrendingDown
} from 'lucide-react';

export const Payables = () => {
  const toast = useToast();

  // Tab State
  const [activeTab, setActiveTab] = useState('purchases'); // 'purchases' | 'suppliers' | 'overdue'

  // Summary KPIs
  const [summary, setSummary] = useState({
    total_purchases: 0,
    total_paid: 0,
    total_outstanding: 0,
    unpaid_count: 0,
    partially_paid_count: 0,
    fully_paid_count: 0,
    overdue_count: 0,
    overdue_amount: 0,
  });
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Purchases list state
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState('all');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Suppliers list state
  const [suppliers, setSuppliers] = useState([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOnlyOutstanding, setSupplierOnlyOutstanding] = useState(false);

  // Selected purchase detail modal
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Record payment modal
  const [paymentModalPurchase, setPaymentModalPurchase] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    reference_no: '',
    notes: '',
  });
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Due Date edit modal
  const [dueDatePurchase, setDueDatePurchase] = useState(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [dueDateSubmitting, setDueDateSubmitting] = useState(false);

  // Fetch Summary
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const res = await payablesApi.getSummary();
      setSummary(res.data);
    } catch {
      toast.error('Failed to load accounts payable summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [toast]);

  // Fetch Purchases
  const fetchPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const params = {};
      if (purchaseStatusFilter !== 'all') params.status = purchaseStatusFilter;
      if (purchaseSearch) params.search = purchaseSearch;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await payablesApi.getPurchases(params);
      setPurchases(res.data || []);
    } catch {
      toast.error('Failed to load purchases');
    } finally {
      setPurchasesLoading(false);
    }
  }, [purchaseStatusFilter, purchaseSearch, startDate, endDate, toast]);

  // Fetch Suppliers
  const fetchSuppliers = useCallback(async () => {
    setSuppliersLoading(true);
    try {
      const params = {};
      if (supplierSearch) params.search = supplierSearch;
      if (supplierOnlyOutstanding) params.status = 'outstanding';
      const res = await payablesApi.getSuppliers(params);
      setSuppliers(res.data || []);
    } catch {
      toast.error('Failed to load supplier payables');
    } finally {
      setSuppliersLoading(false);
    }
  }, [supplierSearch, supplierOnlyOutstanding, toast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    if (activeTab === 'purchases' || activeTab === 'overdue') {
      fetchPurchases();
    } else if (activeTab === 'suppliers') {
      fetchSuppliers();
    }
  }, [activeTab, fetchPurchases, fetchSuppliers]);

  // View purchase detail
  const handleOpenDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await payablesApi.getPurchaseDetail(id);
      setSelectedPurchase(res.data);
    } catch {
      toast.error('Failed to load purchase details');
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Payment Modal
  const handleOpenPayment = (purchase) => {
    setPaymentModalPurchase(purchase);
    const outstanding = purchase.outstanding_amount !== undefined 
      ? purchase.outstanding_amount 
      : Math.max(0, purchase.total - (purchase.paid_amount || 0));
    setPaymentForm({
      amount: outstanding > 0 ? String(outstanding) : '',
      payment_method: 'Bank Transfer',
      payment_date: new Date().toISOString().split('T')[0],
      reference_no: '',
      notes: '',
    });
  };

  // Submit Payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!paymentModalPurchase) return;
    const amountVal = parseFloat(paymentForm.amount);
    if (!amountVal || amountVal <= 0) {
      toast.error('Please enter a valid payment amount greater than zero');
      return;
    }
    const outstanding = paymentModalPurchase.outstanding_amount !== undefined
      ? paymentModalPurchase.outstanding_amount
      : (paymentModalPurchase.total - (paymentModalPurchase.paid_amount || 0));
    if (amountVal > outstanding + 0.001) {
      toast.error(`Payment cannot exceed outstanding balance of ₹${outstanding.toFixed(2)}`);
      return;
    }

    setPaymentSubmitting(true);
    try {
      const payload = {
        purchase_id: paymentModalPurchase.id,
        amount: amountVal,
        payment_method: paymentForm.payment_method,
        payment_date: paymentForm.payment_date,
        reference_no: paymentForm.reference_no,
        notes: paymentForm.notes,
      };
      const res = await payablesApi.recordPayment(payload);
      toast.success(res.data?.message || 'Payment recorded successfully!');
      setPaymentModalPurchase(null);
      // Refresh current data
      fetchSummary();
      if (activeTab === 'purchases' || activeTab === 'overdue') {
        fetchPurchases();
      } else {
        fetchSuppliers();
      }
      if (selectedPurchase && selectedPurchase.id === paymentModalPurchase.id) {
        handleOpenDetail(selectedPurchase.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Update Due Date
  const handleSaveDueDate = async (e) => {
    e.preventDefault();
    if (!dueDatePurchase) return;
    setDueDateSubmitting(true);
    try {
      await payablesApi.updateDueDate(dueDatePurchase.id, { due_date: newDueDate });
      toast.success('Due date updated');
      setDueDatePurchase(null);
      fetchPurchases();
      if (selectedPurchase && selectedPurchase.id === dueDatePurchase.id) {
        handleOpenDetail(selectedPurchase.id);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update due date');
    } finally {
      setDueDateSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Accounts Payable</h2>
          <p className="text-sm text-gray-500 mt-1">
            Track and settle supplier bills, balances, and payment schedules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchSummary();
              if (activeTab === 'suppliers') fetchSuppliers();
              else fetchPurchases();
            }}
            className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding */}
        <div className="bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm">
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Outstanding</p>
            <p className="text-xl font-black text-amber-600 mt-0.5">
              ₹{summary.total_outstanding.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Across {summary.unpaid_count + summary.partially_paid_count} pending consignments
            </p>
          </div>
        </div>

        {/* Total Paid */}
        <div className="bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm">
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Paid</p>
            <p className="text-xl font-black text-emerald-600 mt-0.5">
              ₹{summary.total_paid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {summary.fully_paid_count} fully settled purchases
            </p>
          </div>
        </div>

        {/* Overdue Amount */}
        <div className="bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm">
          <div className="p-2.5 rounded-lg bg-red-50 text-red-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Overdue Balance</p>
            <p className="text-xl font-black text-red-600 mt-0.5">
              ₹{summary.overdue_amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-red-500 font-semibold mt-1">
              {summary.overdue_count} bills past due date
            </p>
          </div>
        </div>

        {/* Total Billed */}
        <div className="bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm">
          <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
            <FileText className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Purchase Volume</p>
            <p className="text-xl font-black text-gray-900 mt-0.5">
              ₹{summary.total_purchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Lifetime vendor purchase orders
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('purchases');
            setPurchaseStatusFilter('all');
          }}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'purchases' && purchaseStatusFilter === 'all'
              ? 'border-[#111] text-[#111]'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <FileText className="w-4 h-4" /> All Purchases
        </button>
        <button
          onClick={() => {
            setActiveTab('purchases');
            setPurchaseStatusFilter('unpaid');
          }}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'purchases' && purchaseStatusFilter === 'unpaid'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Clock className="w-4 h-4" /> Unpaid ({summary.unpaid_count})
        </button>
        <button
          onClick={() => {
            setActiveTab('purchases');
            setPurchaseStatusFilter('partially_paid');
          }}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'purchases' && purchaseStatusFilter === 'partially_paid'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <TrendingDown className="w-4 h-4" /> Partially Paid ({summary.partially_paid_count})
        </button>
        <button
          onClick={() => {
            setActiveTab('purchases');
            setPurchaseStatusFilter('overdue');
          }}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'purchases' && purchaseStatusFilter === 'overdue'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4" /> Overdue ({summary.overdue_count})
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition -mb-px flex items-center gap-2 ${
            activeTab === 'suppliers'
              ? 'border-[#111] text-[#111]'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <Building2 className="w-4 h-4" /> Supplier-wise Balances
        </button>
      </div>

      {/* TAB CONTENT: PURCHASES */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by PO ID or supplier..."
                value={purchaseSearch}
                onChange={(e) => setPurchaseSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#F5B900]/30"
              />
            </div>
            <select
              value={purchaseStatusFilter}
              onChange={(e) => setPurchaseStatusFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30"
            >
              <option value="all">All Payment Statuses</option>
              <option value="unpaid">Unpaid Only</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Fully Paid</option>
              <option value="overdue">Overdue Only</option>
              <option value="outstanding">Any Outstanding</option>
            </select>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30"
                placeholder="From Date"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-sm border rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#F5B900]/30"
                placeholder="To Date"
              />
            </div>
            {(purchaseSearch || purchaseStatusFilter !== 'all' || startDate || endDate) && (
              <button
                onClick={() => {
                  setPurchaseSearch('');
                  setPurchaseStatusFilter('all');
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            )}
          </div>

          {/* Purchases Table */}
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111] text-white text-left">
                    <th className="px-4 py-3 font-semibold">PO #</th>
                    <th className="px-4 py-3 font-semibold">Purchase Date</th>
                    <th className="px-4 py-3 font-semibold">Supplier</th>
                    <th className="px-4 py-3 font-semibold text-right">Total (₹)</th>
                    <th className="px-4 py-3 font-semibold text-right">Paid (₹)</th>
                    <th className="px-4 py-3 font-semibold text-right">Outstanding (₹)</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Payment Status</th>
                    <th className="px-4 py-3 font-semibold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchasesLoading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">Loading purchase records...</td>
                    </tr>
                  ) : purchases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-12 text-gray-400">No purchases found matching criteria</td>
                    </tr>
                  ) : (
                    purchases.map((p, i) => (
                      <tr
                        key={p.id}
                        className={`border-t hover:bg-gray-50/80 transition ${
                          i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        } ${p.is_overdue ? 'bg-red-50/30' : ''}`}
                      >
                        <td className="px-4 py-3 font-mono font-bold text-gray-800">
                          #{p.id}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                          {p.purchase_date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{p.supplier_name}</div>
                          {p.supplier_id && (
                            <div className="text-[11px] font-mono text-gray-400">{p.supplier_id}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          ₹{p.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                          ₹{p.paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {p.outstanding_amount > 0 ? (
                            <span className="text-amber-600">
                              ₹{p.outstanding_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-emerald-700">₹0.00</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {p.due_date ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs ${p.is_overdue ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                {p.due_date}
                              </span>
                              {p.is_overdue && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-700 font-bold uppercase tracking-wider">
                                  Overdue
                                </span>
                              )}
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setDueDatePurchase(p);
                                setNewDueDate('');
                              }}
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Calendar className="w-3 h-3" /> Set due date
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                              p.payment_status === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.payment_status === 'Partially Paid'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {p.payment_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleOpenDetail(p.id)}
                              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
                              title="View details & payments"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {p.outstanding_amount > 0 && (
                              <button
                                onClick={() => handleOpenPayment(p)}
                                className="px-2.5 py-1 text-xs bg-[#111] text-white hover:bg-[#333] rounded-lg font-semibold transition flex items-center gap-1 shadow-sm"
                                title="Pay Supplier"
                              >
                                <DollarSign className="w-3.5 h-3.5" /> Pay
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: SUPPLIERS */}
      {activeTab === 'suppliers' && (
        <div className="space-y-4">
          {/* Supplier Filters */}
          <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by vendor name or contact phone..."
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-[#F5B900]/30"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={supplierOnlyOutstanding}
                onChange={(e) => setSupplierOnlyOutstanding(e.target.checked)}
                className="rounded border-gray-300 text-[#111] focus:ring-[#F5B900]"
              />
              Show only vendors with pending balance
            </label>
          </div>

          {/* Supplier Payables Table */}
          <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111] text-white text-left">
                    <th className="px-4 py-3 font-semibold">Vendor</th>
                    <th className="px-4 py-3 font-semibold">Contact / Phone</th>
                    <th className="px-4 py-3 font-semibold text-center">Purchases</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Purchased</th>
                    <th className="px-4 py-3 font-semibold text-right">Total Settled</th>
                    <th className="px-4 py-3 font-semibold text-right">Payable Balance</th>
                    <th className="px-4 py-3 font-semibold text-center">Unpaid POs</th>
                    <th className="px-4 py-3 font-semibold text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliersLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">Loading vendor balances...</td>
                    </tr>
                  ) : suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-400">No vendors found</td>
                    </tr>
                  ) : (
                    suppliers.map((s, i) => (
                      <tr
                        key={s.supplier_id || s.supplier_name}
                        className={`border-t hover:bg-gray-50/80 transition ${
                          i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-bold text-gray-900">{s.supplier_name}</div>
                          {s.supplier_id && s.supplier_id !== 'UNKNOWN' && (
                            <div className="text-[11px] font-mono text-gray-400">{s.supplier_id}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {s.phone || s.contact_person || '—'}
                        </td>
                        <td className="px-4 py-3 text-center font-medium">
                          {s.total_purchases_count}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          ₹{s.total_purchase_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">
                          ₹{s.total_paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-right font-black">
                          {s.outstanding_amount > 0 ? (
                            <span className="text-amber-600">
                              ₹{s.outstanding_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">₹0.00</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.unpaid_purchases_count > 0 ? (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800 font-bold">
                              {s.unpaid_purchases_count} POs
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              setPurchaseSearch(s.supplier_name);
                              setPurchaseStatusFilter('outstanding');
                              setActiveTab('purchases');
                            }}
                            className="px-3 py-1 text-xs border rounded-lg hover:bg-gray-100 transition font-medium"
                          >
                            Filter POs
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-[#111] text-white rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold">Purchase Order #{selectedPurchase.id}</h3>
                <p className="text-xs text-white/60">Vendor: {selectedPurchase.supplier_name}</p>
              </div>
              <button
                onClick={() => setSelectedPurchase(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border">
                <div>
                  <span className="text-xs text-gray-500 uppercase font-bold">Total Bill</span>
                  <div className="text-lg font-black text-gray-900 mt-0.5">
                    ₹{selectedPurchase.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase font-bold">Paid to Date</span>
                  <div className="text-lg font-black text-emerald-600 mt-0.5">
                    ₹{selectedPurchase.paid_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase font-bold">Balance Due</span>
                  <div className="text-lg font-black text-amber-600 mt-0.5">
                    ₹{selectedPurchase.outstanding_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* Meta information */}
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <span className="font-semibold text-gray-700">Purchase Date:</span> {selectedPurchase.purchase_date}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Due Date:</span> {selectedPurchase.due_date || 'None'}
                  <button
                    onClick={() => {
                      setDueDatePurchase(selectedPurchase);
                      setNewDueDate(selectedPurchase.due_date || '');
                    }}
                    className="text-blue-600 hover:underline"
                  >
                    (edit)
                  </button>
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Receipt Status:</span> {selectedPurchase.receipt_status}
                </div>
                <div>
                  <span className="font-semibold text-gray-700">Payment Status:</span>{' '}
                  <span className="font-bold text-gray-900">{selectedPurchase.payment_status}</span>
                </div>
              </div>

              {/* Items List */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-2">Purchased Items</h4>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-100 text-gray-700 text-left">
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Cost</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedPurchase.items?.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="px-3 py-2 font-medium">{it.product_name}</td>
                          <td className="px-3 py-2 text-right">₹{it.cost_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{it.quantity}</td>
                          <td className="px-3 py-2 text-right font-semibold">₹{it.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments History Ledger */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-gray-900">Recorded Payments</h4>
                  {selectedPurchase.outstanding_amount > 0 && (
                    <button
                      onClick={() => handleOpenPayment(selectedPurchase)}
                      className="px-2.5 py-1 text-xs bg-[#111] text-white rounded-lg hover:bg-[#333] transition flex items-center gap-1 font-semibold"
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Record Payment
                    </button>
                  )}
                </div>
                {selectedPurchase.payments && selectedPurchase.payments.length > 0 ? (
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-100 text-gray-700 text-left">
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Reference</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedPurchase.payments.map((pm) => (
                          <tr key={pm.id} className="border-t">
                            <td className="px-3 py-2 text-gray-600">{pm.payment_date}</td>
                            <td className="px-3 py-2 font-medium">{pm.payment_method}</td>
                            <td className="px-3 py-2 text-gray-500">{pm.reference_no || '—'}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-600">
                              ₹{pm.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-xl text-center text-xs text-gray-400">
                    No individual payments recorded yet. Initial bill may have been unpaid or handled in bulk.
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setSelectedPurchase(null)}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RECORD PAYMENT MODAL */}
      {paymentModalPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h3 className="text-lg font-bold">Record Supplier Payment</h3>
                <p className="text-xs text-gray-500">PO #{paymentModalPurchase.id} • {paymentModalPurchase.supplier_name}</p>
              </div>
              <button
                onClick={() => setPaymentModalPurchase(null)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs flex justify-between items-center">
                <span className="font-semibold text-amber-800">Remaining Balance:</span>
                <span className="font-bold text-amber-900 text-sm">
                  ₹{(paymentModalPurchase.outstanding_amount !== undefined
                    ? paymentModalPurchase.outstanding_amount
                    : (paymentModalPurchase.total - (paymentModalPurchase.paid_amount || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentModalPurchase.outstanding_amount !== undefined
                    ? paymentModalPurchase.outstanding_amount
                    : (paymentModalPurchase.total - (paymentModalPurchase.paid_amount || 0))}
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-[#F5B900]/30"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Reference / UTR / Cheque #
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR-998822 or Cheque-0192"
                  value={paymentForm.reference_no}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_no: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional payment notes..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalPurchase(null)}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paymentSubmitting}
                  className="px-5 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] transition font-semibold disabled:opacity-50"
                >
                  {paymentSubmitting ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DUE DATE MODAL */}
      {dueDatePurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-base font-bold">Set Bill Due Date</h3>
              <button
                onClick={() => setDueDatePurchase(null)}
                className="p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveDueDate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Payment Due Date
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#F5B900]/30"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDueDatePurchase(null)}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dueDateSubmitting}
                  className="px-4 py-2 text-sm bg-[#111] text-white rounded-lg hover:bg-[#333] font-semibold disabled:opacity-50"
                >
                  {dueDateSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payables;

