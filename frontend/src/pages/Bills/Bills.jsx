import React, { useState, useEffect } from 'react';
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
  Smartphone
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
  const [loading, setLoading] = useState(true);

  // Selected bill modal
  const [selectedBill, setSelectedBill] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchBills = async () => {
    try {
      setLoading(true);
      const res = await billsApi.list(searchTerm);
      setBills(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, [searchTerm]);

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

  const filteredBills = bills.filter((b) => {
    if (paymentFilter === 'ALL') return true;
    return b.payment_mode === paymentFilter;
  });

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Sales</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Invoices &amp; Receipts</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Search customer transactions, open archived PDF bills, and audit register slips</p>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice # or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Payment Mode Filter Pills */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-400 font-bold px-2 uppercase tracking-wider text-[11px]">Payment:</span>
        {['ALL', 'Cash', 'UPI', 'Card'].map((mode) => (
          <button
            key={mode}
            onClick={() => setPaymentFilter(mode)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
              paymentFilter === mode
                ? 'bg-[#F5B900] text-[#111111] shadow-sm font-black'
                : 'bg-slate-100/80 text-slate-600 hover:bg-gold-50/60 hover:text-slate-900'
            }`}
          >
            {mode === 'ALL' ? 'All Invoices' : mode}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <Loading text="Loading sales invoices..." fullHeight />
        ) : filteredBills.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700 text-sm">No invoices found matching your query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Invoice No</th>
                  <th className="py-3.5 px-4">Customer Name</th>
                  <th className="py-3.5 px-4">Date &amp; Time</th>
                  <th className="py-3.5 px-4">Payment Mode</th>
                  <th className="py-3.5 px-4">Total Amount (₹)</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.map((b) => (
                  <tr key={b.invoice_no} className="hover:bg-gold-50/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      <button
                        onClick={() => handleViewBill(b.invoice_no)}
                        className="hover:text-gold-600 hover:underline text-left font-bold"
                      >
                        {b.invoice_no}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800">
                      {b.customer_name}
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
                  <p className="text-slate-500 text-[11px]">Phone: {selectedBill.customer_phone}</p>
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
