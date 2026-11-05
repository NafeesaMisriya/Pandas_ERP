import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Save, Truck, History, Calendar, DollarSign, CheckCircle2 } from 'lucide-react';
import { purchasesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';

export const Purchases = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [supplierName, setSupplierName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [billStatus, setBillStatus] = useState('Received');

  const [items, setItems] = useState([
    { category: '', item_code: '', quantity: 1, cost_price: 0, total: 0, availableProducts: [] },
  ]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchCats = async () => {
      try {
        const res = await purchasesApi.getCategories();
        setCategories(res.data || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCats();
  }, []);

  const handleCategoryChange = async (index, category) => {
    const updated = [...items];
    updated[index].category = category;
    updated[index].item_code = '';
    updated[index].cost_price = 0;
    updated[index].total = 0;

    if (category) {
      try {
        const res = await purchasesApi.getItems(category);
        updated[index].availableProducts = res.data || [];
      } catch (err) {
        console.error(err);
      }
    } else {
      updated[index].availableProducts = [];
    }

    setItems(updated);
  };

  const handleProductChange = (index, itemCode) => {
    const updated = [...items];
    updated[index].item_code = itemCode;

    const prod = updated[index].availableProducts.find((p) => p.item_code === itemCode);
    if (prod) {
      updated[index].cost_price = prod.cost_price || 0;
      updated[index].total = Number((updated[index].quantity * (prod.cost_price || 0)).toFixed(2));
    }
    setItems(updated);
  };

  const handleQuantityChange = (index, qty) => {
    const updated = [...items];
    updated[index].quantity = qty;
    updated[index].total = Number((qty * updated[index].cost_price).toFixed(2));
    setItems(updated);
  };

  const handleCostChange = (index, cost) => {
    const updated = [...items];
    updated[index].cost_price = cost;
    updated[index].total = Number((updated[index].quantity * cost).toFixed(2));
    setItems(updated);
  };

  const addRow = () => {
    setItems([
      ...items,
      { category: '', item_code: '', quantity: 1, cost_price: 0, total: 0, availableProducts: [] },
    ]);
  };

  const removeRow = (index) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const grandTotal = items.reduce((sum, item) => sum + (item.total || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!supplierName.trim()) {
      toast.error('Supplier name is required');
      return;
    }

    const validItems = items.filter((i) => i.item_code && i.quantity > 0);
    if (validItems.length === 0) {
      toast.error('Please add at least one valid item with a selected product and quantity');
      return;
    }

    try {
      setSubmitting(true);
      await purchasesApi.save({
        supplier_name: supplierName,
        purchase_date: purchaseDate,
        bill_status: billStatus,
        grand_total: grandTotal,
        items: validItems.map((i) => ({
          item_code: i.item_code,
          quantity: i.quantity,
          cost_price: i.cost_price,
          total: i.total,
        })),
      });

      toast.success('Purchase recorded! Inventory stock has been automatically updated.');
      navigate('/purchases/history');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save purchase');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Supplier Inward Purchase Entry</h2>
            <p className="text-xs text-slate-500">Record incoming stock and automatically increment product counts</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/purchases/history')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
        >
          <History className="w-4 h-4 text-slate-600" />
          <span>View Purchase History</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Supplier & Date Details */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Supplier / Vendor Name *</label>
            <input
              type="text"
              placeholder="e.g. Metro Cash & Carry, Royal Dry Fruits Ltd"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Purchase Invoice Date *</label>
            <div className="relative">
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1.5">Consignment Status</label>
            <select
              value={billStatus}
              onChange={(e) => setBillStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            >
              <option value="Received">Received / Verified</option>
              <option value="Paid">Fully Paid</option>
              <option value="Pending">Payment Pending</option>
            </select>
          </div>
        </div>

        {/* Purchase Items Line Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h3 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
              Purchased Line Items
            </h3>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-500 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line Item</span>
            </button>
          </div>

          <div className="p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2 px-3 w-1/4">Department</th>
                  <th className="py-2 px-3 w-1/3">Item / Product</th>
                  <th className="py-2 px-3 w-24">Quantity</th>
                  <th className="py-2 px-3 w-28">Cost Price (₹)</th>
                  <th className="py-2 px-3 w-28 text-right">Line Total (₹)</th>
                  <th className="py-2 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row, index) => (
                  <tr key={index} className="hover:bg-slate-50/50">
                    <td className="py-2 px-3">
                      <select
                        value={row.category}
                        onChange={(e) => handleCategoryChange(index, e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                      >
                        <option value="">Select Category</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2 px-3">
                      <select
                        value={row.item_code}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        disabled={!row.category}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                      >
                        <option value="">Select Product</option>
                        {row.availableProducts.map((p) => (
                          <option key={p.item_code} value={p.item_code}>
                            {p.item_name} ({p.item_code})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.quantity}
                        onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-800"
                      />
                    </td>

                    <td className="py-2 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.cost_price}
                        onChange={(e) => handleCostChange(index, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-800"
                      />
                    </td>

                    <td className="py-2 px-3 text-right font-extrabold text-slate-900 text-sm">
                      ₹{row.total.toFixed(2)}
                    </td>

                    <td className="py-2 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        disabled={items.length === 1}
                        className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:hover:text-slate-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grand Total & Actions Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-slate-500 font-semibold text-xs">Total Shipment Cost:</span>
              <span className="text-2xl font-black text-slate-900">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/purchases/history')}
                className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 font-bold transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md shadow-emerald-700/20 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Recording Inward...' : 'Confirm & Save Purchase'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};
