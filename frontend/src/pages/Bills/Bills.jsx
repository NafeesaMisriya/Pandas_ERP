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
  AlertTriangle
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

  return (
    <div className="space-y-6">
      {/* Header & Search */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Sales Invoices & Billing Archive</h2>
            <p className="text-xs text-slate-500">Search customer receipts, open PDF bills, and manage cancellations</p>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search invoice # or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <Loading text="Loading sales invoices..." fullHeight />
        ) : bills.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p>No invoices found matching your query.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Invoice No</th>
                  <th className="py-3 px-4">Customer Name</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Payment Mode</th>
                  <th className="py-3 px-4">Total Amount (₹)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((b) => (
                  <tr key={b.invoice_no} className="hover:bg-slate-50/70 transition duration-150">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {b.invoice_no}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {b.customer_name}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{b.created_at}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        {b.payment_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-extrabold text-slate-900 text-sm">
                      ₹{b.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={b.status === 'PAID' ? 'success' : 'danger'} size="sm">
                        {b.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleViewBill(b.invoice_no)}
                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
                          title="View Bill Items"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <a
                          href={`/bill/${b.invoice_no}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                          title="Download PDF"
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

      {/* Bill Detail Modal */}
      <Modal
        isOpen={!!selectedBill}
        onClose={() => setSelectedBill(null)}
        title={`Invoice Breakdown: ${selectedBill?.invoice_no}`}
        maxWidth="max-w-2xl"
      >
        {selectedBill && (
          <div className="space-y-4 text-xs">
            {/* Store Branding Header */}
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <img src="/logo.png" alt="PANDAS" className="h-9 object-contain" />
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">PANDAS – NUTS &amp; CHOCOLATES</h3>
                <p className="text-[10px] text-slate-500">Near Bus Stop, Kottappuram • +91-9847345005</p>
              </div>
            </div>

            {/* Header Summary */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
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
                <div className="mt-2 font-black text-slate-900 text-lg">
                  ₹{selectedBill.total.toFixed(2)}
                </div>
                <span className="text-[11px] text-slate-400">Payment: {selectedBill.payment_mode}</span>
              </div>
            </div>

            {/* Line items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2 px-3">Product Name</th>
                    <th className="py-2 px-3">Price</th>
                    <th className="py-2 px-3">Quantity</th>
                    <th className="py-2 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBill.items?.map((it, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{it.product_name}</td>
                      <td className="py-2.5 px-3 text-slate-600">₹{it.price.toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{it.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                        ₹{it.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
              {selectedBill.status === 'PAID' ? (
                <button
                  onClick={() => handleCancelBill(selectedBill.invoice_no)}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl font-bold transition flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Cancel Bill</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <a
                  href={`/bill/${selectedBill.invoice_no}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-navy-900 hover:bg-navy-800 text-white rounded-xl font-bold transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>View Printable</span>
                </a>

                <a
                  href={`/bill/${selectedBill.invoice_no}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition"
                >
                  <FileDown className="w-4 h-4" />
                  <span>PDF Document</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
