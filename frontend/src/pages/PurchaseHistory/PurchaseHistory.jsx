import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Filter,
  Truck,
  Calendar,
  ArrowRight,
  Package,
  DollarSign,
  X,
  CheckCircle2,
  Clock,
  ShieldCheck,
  CreditCard
} from 'lucide-react';
import { purchasesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';

export const PurchaseHistory = () => {
  const toast = useToast();
  const [suppliers, setSuppliers] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedSupplier) params.supplier = selectedSupplier;
      if (selectedDate) params.purchase_date = selectedDate;

      const res = await purchasesApi.getHistory(params);
      setSuppliers(res.data.suppliers || []);
      setDates(res.data.dates || []);
      setPurchases(res.data.purchases || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReceive = async (purchaseId) => {
    try {
      setActionLoading(`receive-${purchaseId}`);
      const res = await purchasesApi.receive(purchaseId);
      toast.success(res.data?.message || `Consignment #${purchaseId} marked as Received & stock updated!`);
      await fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to update receipt status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleVerify = async (purchaseId) => {
    try {
      setActionLoading(`verify-${purchaseId}`);
      const res = await purchasesApi.verify(purchaseId);
      toast.success(res.data?.message || `Consignment #${purchaseId} verified against PO!`);
      await fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to verify consignment');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [selectedSupplier, selectedDate]);

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Procurement</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Audit History</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Audited historical stock shipments and procurement ledger</p>
        </div>

        <Link
          to="/purchases"
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-sm transition active:scale-95"
        >
          <Truck className="w-4 h-4 text-[#111111]" />
          <span>New Purchase Entry</span>
        </Link>
      </div>

      {/* Filter Selector Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-bold">
          <Filter className="w-4 h-4 text-slate-400" />
          <span>Filter Shipments:</span>
        </div>

        <div>
          <select
            value={selectedSupplier}
            onChange={(e) => {
              setSelectedSupplier(e.target.value);
              setSelectedDate('');
            }}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {dates.length > 0 && (
          <div>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            >
              <option value="">Select Invoice Date</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        {(selectedSupplier || selectedDate) && (
          <button
            onClick={() => {
              setSelectedSupplier('');
              setSelectedDate('');
            }}
            className="text-xs text-rose-600 font-bold hover:text-rose-700 flex items-center gap-1 ml-auto transition"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Purchase Details & Listing */}
      {loading ? (
        <Loading text="Loading purchase history..." fullHeight />
      ) : purchases.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center text-slate-400 border border-slate-200/90 shadow-xs">
          <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="font-bold text-slate-700 text-base">No Purchase Records Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {selectedSupplier
              ? `No purchase shipments recorded for "${selectedSupplier}".`
              : 'Record your first supplier stock purchase to see it in the audit ledger.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {purchases.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden hover:border-gold-300 hover:shadow-md transition-all"
            >
              <div className="p-4 md:p-5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-900 text-base">{p.supplier_name}</span>

                    {/* Goods Receipt Status Badge */}
                    {p.receipt_status === 'Verified' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        Verified
                      </span>
                    ) : p.receipt_status === 'Received' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-blue-100 text-blue-800 flex items-center gap-1 border border-blue-300">
                        <Truck className="w-3.5 h-3.5 text-blue-600" />
                        Received
                      </span>
                    ) : p.receipt_status === 'Pending Receipt' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-300">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        Pending Receipt
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-purple-100 text-purple-800 flex items-center gap-1 border border-purple-300">
                        <Package className="w-3.5 h-3.5 text-purple-600" />
                        {p.receipt_status || 'Partially Received'}
                      </span>
                    )}

                    {/* Payment Status Badge */}
                    {p.payment_status === 'Paid' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-emerald-50 text-emerald-700 flex items-center gap-1 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Paid ({p.payment_method})
                      </span>
                    ) : p.payment_status === 'Partially Paid' ? (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-amber-50 text-amber-800 flex items-center gap-1 border border-amber-200" title={`Paid ₹${p.paid_amount?.toFixed(2)} of ₹${p.total?.toFixed(2)}`}>
                        <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                        Partially Paid (₹{p.paid_amount?.toFixed(0)}/{p.total?.toFixed(0)}) • {p.payment_method}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-50 text-rose-700 flex items-center gap-1 border border-rose-200">
                        <Clock className="w-3.5 h-3.5 text-rose-600" />
                        Unpaid ({p.payment_method})
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-xs mt-1.5">
                    <span>Shipment Date: <strong>{p.purchase_date}</strong></span>
                    <span>•</span>
                    <span>PO Voucher: <strong>#{p.id}</strong></span>
                    {p.receipt_date && (
                      <>
                        <span>•</span>
                        <span className="text-slate-600">Goods Arrived: {p.receipt_date}</span>
                      </>
                    )}
                    {p.verified_date && (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 font-semibold">Verified: {p.verified_date}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider block">
                      Consignment Total
                    </span>
                    <span className="text-lg font-black text-slate-900">
                      ₹{p.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  {/* Contextual Action Button based on Goods Receipt Status */}
                  {p.receipt_status === 'Pending Receipt' && (
                    <button
                      onClick={() => handleReceive(p.id)}
                      disabled={actionLoading === `receive-${p.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl text-xs font-black shadow-xs transition active:scale-95 disabled:opacity-50"
                      title="Mark shipment as received and increment inventory"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      <span>{actionLoading === `receive-${p.id}` ? 'Receiving...' : 'Receive Goods'}</span>
                    </button>
                  )}

                  {p.receipt_status === 'Received' && (
                    <button
                      onClick={() => handleVerify(p.id)}
                      disabled={actionLoading === `verify-${p.id}`}
                      className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50"
                      title="Verify invoice items against purchase records"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[#F5B900]" />
                      <span>{actionLoading === `verify-${p.id}` ? 'Verifying...' : 'Verify PO'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Items detail table */}
              {p.items && p.items.length > 0 ? (
                <div className="p-4 md:p-5 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3">Item Code</th>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3">Unit Cost Price</th>
                        <th className="py-2.5 px-3">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {p.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-gold-50/40 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {it.item_code}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {it.product_name}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 font-medium">
                            ₹{it.cost_price.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 font-black text-slate-900">{it.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-black text-slate-900">
                            ₹{it.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-4 text-center text-slate-400 text-xs">
                  Filter by supplier and date above to inspect the line items breakdown.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
