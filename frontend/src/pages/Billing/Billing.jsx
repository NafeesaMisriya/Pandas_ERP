import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  Printer,
  FileDown,
  User,
  Phone,
  CreditCard,
  DollarSign,
  Smartphone,
  AlertCircle,
  ShoppingCart,
  X,
  Layers,
  Sparkles,
  RotateCcw
} from 'lucide-react';
import { billingApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { isIntegerUnit, validateUnitQuantity, formatQuantity } from '../../utils/unitValidation';

export const Billing = () => {
  const toast = useToast();

  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '', payment_mode: 'Cash' });
  const [billTotal, setBillTotal] = useState(0);
  const [heldBills, setHeldBills] = useState([]);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // Load initial billing state
  const loadState = async () => {
    try {
      const res = await billingApi.getState();
      const data = res.data;
      setCategories(data.categories || []);
      setCart(data.cart || []);
      if (data.customer) {
        setCustomer({
          name: data.customer.name || '',
          phone: data.customer.phone || '',
          payment_mode: data.customer.payment_mode || 'Cash',
        });
      }
      setBillTotal(data.bill_total || 0);
      setHeldBills(data.held_bills || []);

      if (data.categories && data.categories.length > 0 && !selectedCategory) {
        setSelectedCategory(data.categories[0]);
      }
    } catch (err) {
      console.error('Failed to load billing state', err);
      toast.error('Unable to synchronize billing session with server.');
    }
  };

  useEffect(() => {
    loadState();
  }, []);

  // Load products for category
  useEffect(() => {
    if (!selectedCategory) return;
    const fetchCategoryProducts = async () => {
      try {
        setLoadingProducts(true);
        const res = await billingApi.getProducts(selectedCategory);
        setProducts(res.data || []);
      } catch (err) {
        console.error('Failed to load category products', err);
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchCategoryProducts();
  }, [selectedCategory]);

  // Add to cart
  const handleAddToCart = async (itemCode, qty = 1) => {
    try {
      const res = await billingApi.addToCart(itemCode, qty);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
      toast.success('Item added to cart');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add item to cart');
    }
  };

  // Modify quantity
  const handleUpdateQty = async (index, newQty) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const item = cart[index];
    if (item && item.unit) {
      const validation = validateUnitQuantity(newQty, item.unit);
      if (!validation.valid) {
        toast.error(validation.message);
        return;
      }
    }
    try {
      const res = await billingApi.updateQty(index, newQty);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Could not update quantity');
    }
  };

  // Modify price
  const handleUpdatePrice = async (index, newPrice) => {
    if (newPrice < 0) return;
    try {
      const res = await billingApi.updatePrice(index, newPrice);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
    } catch (err) {
      console.error(err);
      toast.error('Could not update price');
    }
  };

  // Remove item
  const handleRemoveItem = async (index) => {
    try {
      const res = await billingApi.removeItem(index);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
      toast.info('Item removed from cart');
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove item');
    }
  };

  // Clear cart
  const handleClearCart = async () => {
    if (!cart.length) return;
    try {
      const res = await billingApi.clearCart();
      setCart(res.data.cart);
      setBillTotal(0);
      toast.info('Cart cleared');
    } catch (err) {
      console.error(err);
    }
  };

  // Park / Hold Bill
  const handleHoldBill = async () => {
    if (!cart.length) {
      toast.warning('Cart is empty. Nothing to park.');
      return;
    }
    try {
      const res = await billingApi.holdBill();
      setCart([]);
      setBillTotal(0);
      setCustomer({ name: '', phone: '', payment_mode: 'Cash' });
      setHeldBills(res.data.held_bills || []);
      toast.success('Current transaction parked successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to hold bill');
    }
  };

  // Resume Bill
  const handleResumeBill = async (holdId) => {
    try {
      const res = await billingApi.resumeBill(holdId);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
      if (res.data.customer) {
        setCustomer(res.data.customer);
      }
      setHeldBills(res.data.held_bills || []);
      setShowHeldModal(false);
      toast.success('Parked transaction resumed.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to resume bill');
    }
  };

  // Checkout
  const handleCheckout = async () => {
    if (!cart.length) {
      toast.warning('Cannot checkout an empty cart.');
      return;
    }

    try {
      setIsCheckingOut(true);
      const res = await billingApi.checkout({
        customer_name: customer.name,
        customer_phone: customer.phone,
        payment_mode: customer.payment_mode,
      });

      setCheckoutResult(res.data);
      setCart([]);
      setBillTotal(0);
      setCustomer({ name: '', phone: '', payment_mode: 'Cash' });
      toast.success(`Invoice ${res.data.invoice_no} generated!`);
    } catch (err) {
      console.error('Checkout error', err);
      toast.error(err.response?.data?.error || 'Checkout transaction failed.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Filter products by search term
  const filteredProducts = products.filter((p) => {
    const q = searchTerm.toLowerCase();
    return p.item_name.toLowerCase().includes(q) || p.item_code.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 animate-fadeIn pb-6">
      {/* Context Breadcrumb & Register Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-400">Terminal</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Register Session</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ml-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Counter 1 Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Quick catalog product lookup, cart operations and instant checkout</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHeldModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200/90 rounded-xl hover:bg-amber-100/80 transition relative shrink-0 shadow-xs active:scale-[0.98]"
          >
            <PauseCircle className="w-4 h-4 text-amber-600" />
            <span>Held Bills</span>
            {heldBills.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">
                {heldBills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Categories & Search Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Department / Category Navigation Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap active:scale-[0.98] ${
                selectedCategory === cat
                  ? 'bg-[#F5B900] text-[#111111] shadow-sm border border-gold-600/40'
                  : 'bg-slate-100/80 text-slate-700 hover:bg-gold-50 hover:text-slate-900 hover:border-gold-300 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Real-time Catalog Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search items by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900] transition font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main 2-Column POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (7 cols): Product Selection Grid */}
        <div className="lg:col-span-7 space-y-3">
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200/90 shadow-xs min-h-[540px]">
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Department: <span className="text-slate-800 font-extrabold">{selectedCategory || 'All'}</span>
              </span>
              <span className="text-xs text-slate-500 font-semibold">
                {filteredProducts.length} items found
              </span>
            </div>

            {loadingProducts ? (
              <Loading text="Loading catalog items..." />
            ) : filteredProducts.length === 0 ? (
              <div className="py-24 text-center text-slate-400 text-xs">
                No products found in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filteredProducts.map((p) => {
                  const stockNum = Number(p.stock) || 0;
                  const isOutOfStock = stockNum <= 0;
                  const isLowStock = stockNum > 0 && stockNum <= 5;

                  return (
                    <button
                      key={p.item_code}
                      onClick={() => !isOutOfStock && handleAddToCart(p.item_code)}
                      disabled={isOutOfStock}
                      className={`p-3.5 rounded-xl border text-left transition-all duration-150 group flex flex-col justify-between relative overflow-hidden ${
                        isOutOfStock
                          ? 'bg-slate-50/80 border-slate-200 opacity-60 cursor-not-allowed'
                          : 'bg-white hover:bg-gold-50/30 border-slate-200/80 hover:border-[#F5B900] hover:shadow-md active:scale-[0.98]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {p.item_code}
                          </span>
                          <span
                            className={
                              isOutOfStock
                                ? 'text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded'
                                : isLowStock
                                ? 'text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded'
                                : 'text-slate-500'
                            }
                          >
                            {isOutOfStock ? 'Out of Stock' : `Stock: ${formatQuantity(p.stock, p.unit)}`}
                          </span>
                        </div>

                        <h4 className="font-bold text-slate-800 text-xs mt-2 group-hover:text-gold-700 line-clamp-2 leading-snug transition-colors">
                          {p.item_name}
                        </h4>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div>
                          <span className="text-sm font-black text-slate-900 group-hover:text-gold-700 transition-colors">
                            ₹{p.price.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium ml-1">
                            /{p.unit || 'pc'}
                          </span>
                        </div>

                        {!isOutOfStock && (
                          <div className="w-6 h-6 rounded-lg bg-slate-100 group-hover:bg-[#F5B900] group-hover:text-[#111111] flex items-center justify-center text-slate-600 transition-colors">
                            <Plus className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Active Cart & Checkout Console */}
        <div className="lg:col-span-5 space-y-3">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
            {/* Cart Header */}
            <div className="p-3.5 bg-navy-900 text-white flex items-center justify-between border-b border-gold-500/20">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-gold-400" />
                <h3 className="font-bold text-sm tracking-wide">Register Cart</h3>
                <span className="px-2 py-0.5 bg-gold-500/20 text-gold-400 border border-gold-500/30 text-xs rounded-full font-bold">
                  {cart.length}
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                  title="Clear Cart"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items Table */}
            <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100 p-2">
              {cart.length === 0 ? (
                <div className="py-20 text-center text-slate-400 text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  Cart is empty. Select products from the left to begin.
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="py-2.5 px-2 flex items-center justify-between gap-3 text-xs hover:bg-gold-50/30 rounded-lg transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{item.name}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono text-slate-500 font-semibold">{item.code}</span>
                        <span>•</span>
                        <span>₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => handleUpdatePrice(index, parseFloat(e.target.value) || 0)}
                          className="w-16 px-1.5 py-0.5 border border-slate-200 rounded font-bold text-slate-800 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-gold-500 focus:border-gold-500"
                        />
                        <span>/{item.unit || 'pc'}</span>
                      </div>
                    </div>

                    {/* Qty modifiers with decimal input support */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleUpdateQty(index, item.qty - 1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-gold-100 hover:text-navy-900 flex items-center justify-center text-slate-700 font-bold active:scale-95 transition"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        step={isIntegerUnit(item.unit) ? "1" : "0.01"}
                        value={item.qty}
                        onChange={(e) => handleUpdateQty(index, parseFloat(e.target.value) || 0)}
                        className="w-12 text-center py-1 font-bold border border-slate-200 rounded-lg text-slate-800 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-gold-500 focus:border-gold-500"
                      />
                      <button
                        onClick={() => handleUpdateQty(index, item.qty + 1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-gold-100 hover:text-navy-900 flex items-center justify-center text-slate-700 font-bold active:scale-95 transition"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Line total & delete */}
                    <div className="text-right shrink-0 min-w-[70px]">
                      <div className="font-black text-navy-900">
                        ₹{item.total.toFixed(2)}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-slate-300 hover:text-rose-600 mt-1 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Customer & Payment Form */}
            <div className="p-4 bg-slate-50/80 border-t border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div>
                  <label className="block text-slate-500 font-bold mb-1 text-[11px]">Customer Name</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Walk-in Customer"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 text-xs shadow-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 font-bold mb-1 text-[11px]">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Mobile number"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      className="w-full pl-8 pr-2 py-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 text-xs shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-slate-500 font-bold mb-1 text-[11px]">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'UPI', 'Card'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCustomer({ ...customer, payment_mode: mode })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                        customer.payment_mode === mode
                          ? 'bg-gold-500 text-navy-900 border-gold-600 shadow-sm font-black'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-gold-50/50 hover:border-gold-300 shadow-xs'
                      }`}
                    >
                      {mode === 'Cash' && <DollarSign className="w-3.5 h-3.5" />}
                      {mode === 'UPI' && <Smartphone className="w-3.5 h-3.5" />}
                      {mode === 'Card' && <CreditCard className="w-3.5 h-3.5" />}
                      <span>{mode}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Total & Checkout Actions */}
              <div className="pt-3 border-t border-slate-200">
                <div className="p-3.5 bg-gradient-to-r from-navy-900 to-navy-800 rounded-xl text-white mb-3 flex items-center justify-between border border-gold-500/30">
                  <div>
                    <span className="text-[11px] font-bold text-gold-400/90 uppercase tracking-wider block">
                      Payable Amount
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">
                      Mode: {customer.payment_mode}
                    </span>
                  </div>
                  <span className="text-2xl font-black text-gold-400 tracking-tight">
                    ₹{billTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleHoldBill}
                    disabled={cart.length === 0}
                    className="py-2.5 px-3 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98]"
                  >
                    <PauseCircle className="w-4 h-4 text-amber-600" />
                    <span>Hold Bill</span>
                  </button>

                  <button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || isCheckingOut}
                    className="py-2.5 px-3 rounded-xl text-xs font-black bg-gold-500 hover:bg-gold-400 text-navy-900 shadow-md shadow-gold-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isCheckingOut ? 'Processing...' : 'Checkout & Print'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Held Bills Modal */}
      <Modal
        isOpen={showHeldModal}
        onClose={() => setShowHeldModal(false)}
        title="Parked / Held Transactions"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Resume any parked customer bill to restore their cart and complete checkout.
          </p>

          {heldBills.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No parked transactions currently in queue.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {heldBills.map((hb) => (
                <div key={hb.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      {hb.customer_name || 'Walk-in Customer'}
                    </h4>
                    <span className="text-slate-400">
                      {hb.customer_phone ? `Phone: ${hb.customer_phone} • ` : ''}
                      Parked: {hb.created_at ? new Date(hb.created_at).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-slate-900 text-sm">
                      ₹{hb.total.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleResumeBill(hb.id)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gold-500 hover:bg-gold-400 text-navy-900 rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Post-Checkout Success Modal (Customer-facing document uses logob.png) */}
      <Modal
        isOpen={!!checkoutResult}
        onClose={() => setCheckoutResult(null)}
        title="Invoice Generated Successfully"
      >
        <div className="text-center py-4 space-y-4">
          {/* Customer-facing invoice branding using logob.png */}
          <div className="flex justify-center mb-1">
            <img src="/logob.png" alt="PANDAS" className="h-12 object-contain" />
          </div>
          <div>
            <p className="text-[11px] text-slate-500 font-medium">Near Bus Stop, Kottappuram • +91-9847345005</p>
          </div>

          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Tax Invoice Document
            </span>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {checkoutResult?.invoice_no}
            </h3>
            <p className="text-sm font-semibold text-emerald-700 mt-1">
              Total Amount: ₹{(checkoutResult?.total || 0).toFixed(2)} ({checkoutResult?.payment_mode})
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 text-left space-y-1">
            <div>
              <span className="font-semibold text-slate-700">Customer:</span>{' '}
              {checkoutResult?.customer_name || 'Walk-in'}
            </div>
            <div>
              <span className="font-semibold text-slate-700">Stock Decrement:</span> Synchronized
              automatically in PostgreSQL
            </div>
            <div>
              <span className="font-semibold text-slate-700">Archived PDF:</span>{' '}
              <span className="text-slate-500 font-mono text-[11px]">{checkoutResult?.pdf_url}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-3">
            <a
              href={checkoutResult?.view_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice Receipt</span>
            </a>

            <a
              href={`/bill/${checkoutResult?.invoice_no}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-navy-900 rounded-xl text-xs font-bold transition shadow-sm active:scale-95"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF</span>
            </a>

            <button
              onClick={() => setCheckoutResult(null)}
              className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition active:scale-95"
            >
              Next Customer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
