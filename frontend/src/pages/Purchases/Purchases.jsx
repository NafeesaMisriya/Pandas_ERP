import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Save,
  Truck,
  History,
  Calendar,
  DollarSign,
  CheckCircle2,
  Package,
  Layers,
  Clock,
  ShieldCheck,
  CreditCard,
  Building
} from 'lucide-react';
import { purchasesApi, suppliersApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { isIntegerUnit, validateUnitQuantity, formatQuantity } from '../../utils/unitValidation';

export const Purchases = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [supplierName, setSupplierName] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [supplierSuggestions, setSupplierSuggestions] = useState([]);
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
  const [showQuickSupplierModal, setShowQuickSupplierModal] = useState(false);
  const [quickSupplierForm, setQuickSupplierForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    tax_number: '',
    address: '',
  });
  const [savingQuickSupplier, setSavingQuickSupplier] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  // Concept A: Goods Receipt Status ('Pending Receipt' | 'Received' | 'Verified' | 'Partially Received')
  const [receiptStatus, setReceiptStatus] = useState('Received');

  // Concept B & C: Payment Method & Payment Status / Amount
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [isPaidInFull, setIsPaidInFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState('');

  const [items, setItems] = useState([
    { category: '', item_code: '', unit: '', quantity: 1, cost_price: 0, total: 0, availableProducts: [] },
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
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  // Concept B: Effective Paid Amount & Dynamic Payment Status
  const effectivePaidAmount = isPaidInFull ? grandTotal : (parseFloat(paidAmount) || 0);

  let calculatedPaymentStatus = 'Unpaid';
  if (effectivePaidAmount >= grandTotal && grandTotal > 0) {
    calculatedPaymentStatus = 'Paid';
  } else if (effectivePaidAmount > 0) {
    calculatedPaymentStatus = 'Partially Paid';
  } else {
    calculatedPaymentStatus = 'Unpaid';
  }

  const balanceDue = Math.max(0, grandTotal - effectivePaidAmount);

  const handleSupplierSearch = async (query) => {
    setSupplierName(query);
    setSelectedSupplierId('');
    if (!query.trim() || query.length < 2) {
      setSupplierSuggestions([]);
      setShowSupplierDropdown(false);
      return;
    }
    try {
      const res = await suppliersApi.search(query);
      setSupplierSuggestions(res.data || []);
      setShowSupplierDropdown((res.data || []).length > 0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectSupplier = (s) => {
    setSupplierName(s.name);
    setSelectedSupplierId(s.supplier_id);
    setShowSupplierDropdown(false);
    toast.info(`Supplier ${s.name} (${s.supplier_id}) selected`);
  };

  const handleQuickRegisterSupplier = async (e) => {
    e.preventDefault();
    if (!quickSupplierForm.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    try {
      setSavingQuickSupplier(true);
      const res = await suppliersApi.create(quickSupplierForm);
      const newSup = res.data;
      setSupplierName(newSup.name);
      setSelectedSupplierId(newSup.supplier_id);
      setShowQuickSupplierModal(false);
      setQuickSupplierForm({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        tax_number: '',
        address: '',
      });
      toast.success(`Supplier ${newSup.name} (${newSup.supplier_id}) registered & selected!`);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to register supplier');
    } finally {
      setSavingQuickSupplier(false);
    }
  };

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
        supplier_name: supplierName.trim(),
        supplier_id: selectedSupplierId || null,
        purchase_date: purchaseDate,
        receipt_status: receiptStatus,
        payment_method: paymentMethod,
        paid_amount: effectivePaidAmount,
        payment_status: calculatedPaymentStatus,
        grand_total: grandTotal,
        items: validItems.map((i) => ({
          item_code: i.item_code,
          quantity: i.quantity,
          cost_price: i.cost_price,
          total: i.total,
        })),
      });

      if (receiptStatus === 'Pending Receipt') {
        toast.success('Purchase recorded! Consignment marked as Pending Receipt (inventory will update upon arrival).');
      } else {
        toast.success('Purchase recorded! Inventory stock has been replenished in PostgreSQL.');
      }
      navigate('/purchases/history');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save purchase');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Procurement</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Purchase Entry</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Record received vendor consignments and automatically replenish inventory</p>
        </div>

        <Link
          to="/purchases/history"
          className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-gold-50/60 hover:border-gold-300 border border-slate-200/90 rounded-xl shadow-xs transition active:scale-95"
        >
          <History className="w-4 h-4 text-slate-600" />
          <span>View Purchase History</span>
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 text-xs">
        {/* Section 1: Supplier & Consignment Details */}
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <span className="w-5 h-5 rounded-full bg-[#F5B900] text-[#111111] text-[11px] font-black flex items-center justify-center">
              1
            </span>
            <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
              Supplier &amp; Shipment Metadata
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-slate-600 font-bold">Supplier / Vendor Name *</label>
                  {selectedSupplierId && (
                    <span className="px-2 py-0.5 rounded-md bg-gold-100 text-[#111111] font-mono font-bold text-[10px] border border-gold-300">
                      {selectedSupplierId}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {selectedSupplierId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSupplierName('');
                        setSelectedSupplierId('');
                      }}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-semibold"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowQuickSupplierModal(true)}
                    className="text-[11px] font-bold text-gold-700 hover:text-gold-800 bg-gold-50 hover:bg-gold-100 px-2 py-0.5 rounded-lg border border-gold-200 transition"
                  >
                    + Quick Add Vendor
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Type vendor name or search directory..."
                value={supplierName}
                onChange={(e) => handleSupplierSearch(e.target.value)}
                onFocus={() => supplierSuggestions.length > 0 && setShowSupplierDropdown(true)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />

              {/* Typeahead Suggestions Dropdown */}
              {showSupplierDropdown && supplierSuggestions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {supplierSuggestions.map((s) => (
                    <div
                      key={s.supplier_id}
                      onClick={() => handleSelectSupplier(s)}
                      className="p-2.5 hover:bg-gold-50 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {s.supplier_id} {s.contact_person ? `• ${s.contact_person}` : ''} {s.phone ? `• ${s.phone}` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] text-gold-600 font-bold">Select Vendor</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Invoice / Receipt Date *</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Goods Receipt Status *</label>
              <select
                value={receiptStatus}
                onChange={(e) => setReceiptStatus(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              >
                <option value="Received">Received (Goods Arrived)</option>
                <option value="Verified">Verified (Checked &amp; Accepted)</option>
                <option value="Pending Receipt">Pending Receipt (Awaiting Delivery)</option>
                <option value="Partially Received">Partially Received</option>
              </select>
            </div>
          </div>

          {/* Contextual Goods Receipt Status Note */}
          <div className="pt-2">
            {receiptStatus === 'Pending Receipt' ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-amber-900 text-xs">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>Pending Receipt:</strong> Inventory stock will <u>not</u> increase until goods physically arrive and are marked as received in Purchase History.
                </span>
              </div>
            ) : receiptStatus === 'Verified' ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50/80 border border-emerald-200/90 rounded-xl text-emerald-900 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  <strong>Verified:</strong> Goods are confirmed and accepted against purchase invoice. Available catalog inventory will be immediately updated.
                </span>
              </div>
            ) : receiptStatus === 'Partially Received' ? (
              <div className="flex items-center gap-2 p-3 bg-purple-50/80 border border-purple-200/90 rounded-xl text-purple-900 text-xs">
                <Package className="w-4 h-4 text-purple-600 shrink-0" />
                <span>
                  <strong>Partially Received:</strong> Entered quantities will be added to active inventory balances.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-slate-700 text-xs">
                <CheckCircle2 className="w-4 h-4 text-[#F5B900] shrink-0" />
                <span>
                  <strong>Received:</strong> Goods physically received at store. Stock balances in PostgreSQL catalog will be automatically replenished upon saving.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Purchased Line Items */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-navy-900 text-gold-400 text-[11px] font-bold flex items-center justify-center">
                2
              </span>
              <h3 className="font-bold text-navy-900 uppercase tracking-wider text-[11px]">
                Inward Product Items ({items.length} line{items.length === 1 ? '' : 's'})
              </h3>
            </div>

            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-gold-500 text-navy-900 rounded-xl text-xs font-bold hover:bg-gold-400 shadow-sm transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line Item</span>
            </button>
          </div>

          <div className="p-4 md:p-5 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 w-1/4">Department</th>
                  <th className="py-3 px-3 w-1/3">Item / Product</th>
                  <th className="py-3 px-3 w-28">Quantity</th>
                  <th className="py-3 px-3 w-32">Cost Price (₹)</th>
                  <th className="py-3 px-3 w-32 text-right">Line Total (₹)</th>
                  <th className="py-3 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row, index) => (
                  <tr key={index} className="hover:bg-gold-50/40 transition-colors">
                    <td className="py-3 px-3">
                      <select
                        value={row.category}
                        onChange={(e) => handleCategoryChange(index, e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500"
                      >
                        <option value="">Select Category</option>
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-3">
                      <select
                        value={row.item_code}
                        onChange={(e) => handleProductChange(index, e.target.value)}
                        disabled={!row.category}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500"
                      >
                        <option value="">Select Product</option>
                        {row.availableProducts.map((p) => (
                          <option key={p.item_code} value={p.item_code}>
                            {p.item_name} ({p.item_code})
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.quantity}
                        onChange={(e) => handleQuantityChange(index, parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500"
                      />
                    </td>

                    <td className="py-3 px-3">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.cost_price}
                        onChange={(e) => handleCostChange(index, parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500"
                      />
                    </td>

                    <td className="py-3 px-3 text-right font-black text-navy-900 text-sm">
                      ₹{row.total.toFixed(2)}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        disabled={items.length === 1}
                        className="p-1.5 text-slate-300 hover:text-rose-600 disabled:opacity-20 disabled:hover:text-slate-300 transition"
                        title="Remove Line Item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Payment Method & Financial Settlement */}
        <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#111111] text-[#F5B900] text-[11px] font-black flex items-center justify-center">
                3
              </span>
              <h3 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                Payment Method &amp; Financial Settlement
              </h3>
            </div>

            {/* Live Calculated Payment Status Badge */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Computed Payment Status:</span>
              {calculatedPaymentStatus === 'Paid' ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Paid in Full
                </span>
              ) : calculatedPaymentStatus === 'Partially Paid' ? (
                <span className="px-3 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-300">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  Partially Paid (₹{effectivePaidAmount.toFixed(2)})
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 flex items-center gap-1 border border-rose-300">
                  <Clock className="w-3.5 h-3.5 text-rose-600" />
                  Unpaid (Full ₹{grandTotal.toFixed(2)} Outstanding)
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
            {/* Payment Method */}
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI / GPay / PhonePe</option>
                <option value="Card">Credit / Debit Card</option>
                <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Settlement Terms */}
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">Settlement Terms</label>
              <div className="flex items-center h-[42px]">
                <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-bold text-xs select-none">
                  <input
                    type="checkbox"
                    checked={isPaidInFull}
                    onChange={(e) => {
                      setIsPaidInFull(e.target.checked);
                      if (e.target.checked) setPaidAmount('');
                    }}
                    className="w-4 h-4 rounded text-[#F5B900] focus:ring-[#F5B900]"
                  />
                  <span>Paid in Full (₹{grandTotal.toFixed(2)})</span>
                </label>
              </div>
            </div>

            {/* Custom / Partial Paid Amount */}
            <div>
              <label className="block text-slate-600 font-bold mb-1.5">
                Amount Paid Recorded (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                disabled={isPaidInFull}
                placeholder={isPaidInFull ? `₹${grandTotal.toFixed(2)} (Full)` : 'Enter amount paid'}
                value={isPaidInFull ? grandTotal : paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border font-black text-slate-800 focus:outline-none shadow-xs transition ${
                  isPaidInFull
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                    : 'bg-white border-slate-300 focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]'
                }`}
              />
              {!isPaidInFull && balanceDue > 0 && (
                <span className="text-[11px] font-bold text-amber-700 block mt-1">
                  Remaining balance due to vendor: ₹{balanceDue.toFixed(2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Section 4: Summary & Order Finalization */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Items
                </span>
                <span className="text-base font-black text-slate-800">
                  {items.filter(i => i.item_code).length} SKUs ({totalUnits} units)
                </span>
              </div>

              <div className="h-8 w-px bg-slate-200" />

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Consignment Cost
                </span>
                <span className="text-2xl font-black text-gold-600">
                  ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/purchases/history')}
                className="px-5 py-2.5 rounded-xl text-slate-600 hover:bg-slate-200 font-bold transition text-xs"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 bg-gold-500 hover:bg-gold-400 text-navy-900 rounded-xl font-black text-xs shadow-md shadow-gold-500/20 transition disabled:opacity-50 active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Recording Inward...' : 'Confirm & Save Purchase'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Quick Supplier Registration Modal */}
      <Modal
        isOpen={showQuickSupplierModal}
        onClose={() => setShowQuickSupplierModal(false)}
        title="Quick Vendor / Supplier Registration"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleQuickRegisterSupplier} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-600 font-bold mb-1">Company / Supplier Name *</label>
            <input
              type="text"
              placeholder="e.g. Royal Dry Fruits Ltd"
              value={quickSupplierForm.name}
              onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, name: e.target.value })}
              required
              autoFocus
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Contact Person (Optional)</label>
            <input
              type="text"
              placeholder="Vendor rep name"
              value={quickSupplierForm.contact_person}
              onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, contact_person: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 font-bold mb-1">Phone Number</label>
              <input
                type="text"
                placeholder="Mobile / Office"
                value={quickSupplierForm.phone}
                onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-bold mb-1">GSTIN (Optional)</label>
              <input
                type="text"
                placeholder="Tax ID"
                value={quickSupplierForm.tax_number}
                onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, tax_number: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono uppercase text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 font-bold mb-1">Address / City</label>
            <input
              type="text"
              placeholder="Warehouse / Office address"
              value={quickSupplierForm.address}
              onChange={(e) => setQuickSupplierForm({ ...quickSupplierForm, address: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] shadow-xs"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowQuickSupplierModal(false)}
              className="px-3.5 py-1.5 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingQuickSupplier}
              className="px-4 py-2 bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] font-black rounded-xl text-xs shadow-sm transition active:scale-95 disabled:opacity-50"
            >
              {savingQuickSupplier ? 'Registering...' : 'Register & Select'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
