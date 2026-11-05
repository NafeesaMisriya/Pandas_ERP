import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { History, Filter, Truck, Calendar, ArrowRight, Package, DollarSign } from 'lucide-react';
import { purchasesApi } from '../../services/api';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';

export const PurchaseHistory = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [dates, setDates] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchHistory();
  }, [selectedSupplier, selectedDate]);

  return (
    <div className="space-y-6">
      {/* Header & Filter Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Supplier Purchase Records</h2>
            <p className="text-xs text-slate-500">Historical stock shipments and procurement ledger</p>
          </div>
        </div>

        <Link
          to="/purchases"
          className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-md transition"
        >
          <Truck className="w-4 h-4" />
          <span>New Purchase Entry</span>
        </Link>
      </div>

      {/* Filter Selector */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-semibold">
          <Filter className="w-4 h-4" />
          <span>Filter Records:</span>
        </div>

        <div>
          <select
            value={selectedSupplier}
            onChange={(e) => {
              setSelectedSupplier(e.target.value);
              setSelectedDate('');
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
            className="text-xs text-rose-600 font-semibold hover:underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Purchase Details & Listing */}
      {loading ? (
        <Loading text="Loading purchase history..." fullHeight />
      ) : purchases.length === 0 ? (
        <div className="bg-white rounded-2xl p-16 text-center text-slate-400 border border-slate-200/80">
          <Truck className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <h3 className="font-bold text-slate-700 text-base">No Purchase Records Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            {selectedSupplier
              ? `No purchase shipments recorded for "${selectedSupplier}".`
              : 'Record your first supplier stock purchase to see it here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {purchases.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-slate-900 text-sm">{p.supplier_name}</span>
                    <Badge variant="info" size="sm">
                      {p.bill_status || 'Received'}
                    </Badge>
                  </div>
                  <span className="text-slate-500 mt-0.5 block">
                    Shipment Date: {p.purchase_date} • Record ID: #{p.id}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-slate-500 font-medium block">Invoice Total</span>
                  <span className="text-base font-black text-slate-900">
                    ₹{p.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Items detail if present */}
              {p.items && p.items.length > 0 ? (
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2 px-3">Item Code</th>
                        <th className="py-2 px-3">Product Name</th>
                        <th className="py-2 px-3">Unit Cost Price</th>
                        <th className="py-2 px-3">Quantity Received</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {p.items.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-800">
                            {it.item_code}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {it.product_name}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            ₹{it.cost_price.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">{it.quantity}</td>
                          <td className="py-2 px-3 text-right font-extrabold text-slate-900">
                            ₹{it.total.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-3 text-center text-slate-400 text-xs">
                  Select supplier and date above to inspect item-by-item cost breakdown.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
