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
  X
} from 'lucide-react';
import { billingApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';

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
    try {
      const res = await billingApi.updateQty(index, newQty);
      setCart(res.data.cart);
      setBillTotal(res.data.bill_total);
    } catch (err) {
      console.error(err);
      toast.error('Could not update quantity');
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
    <div className="space-y-4">
      {/* Brand Banner Header */}
      <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="PANDAS" className="h-10 object-contain" />
          <div className="leading-tight">
            <h2 className="font-extrabold text-slate-900 text-sm tracking-wide">PANDAS – NUTS &amp; CHOCOLATES</h2>
            <p className="text-[11px] text-slate-500 font-medium">Near Bus Stop, Kottappuram • +91-9847345005</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
            POS Terminal Active
          </span>
        </div>
      </div>

      {/* Top Controls & Category Navigation */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-navy-900 text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Search & Held Bills Button */}
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
          </div>

          <button
            onClick={() => setShowHeldModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200 rounded-xl hover:bg-amber-100 transition relative shrink-0"
          >
            <PauseCircle className="w-4 h-4 text-amber-700" />
            <span>Held Bills</span>
            {heldBills.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-[10px] flex items-center justify-center font-bold">
                {heldBills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main 2-Column POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Product Selection Grid */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm min-h-[500px]">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Department: <span className="text-slate-800">{selectedCategory || 'All'}</span>
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {filteredProducts.length} items available
              </span>
            </div>

            {loadingProducts ? (
              <Loading text="Loading catalog items..." />
            ) : filteredProducts.length === 0 ? (
              <div className="py-20 text-center text-slate-400 text-sm">
                No products found in this category.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {filteredProducts.map((p) => (
                  <button
                    key={p.item_code}
                    onClick={() => handleAddToCart(p.item_code)}
                    className="p-3 bg-slate-50 hover:bg-emerald-50/50 rounded-xl border border-slate-200/70 hover:border-emerald-300 text-left transition duration-200 group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                        <span>{p.item_code}</span>
                        <span className="text-slate-500">Stock: {p.stock}</span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm mt-1 group-hover:text-emerald-700 line-clamp-2">
                        {p.item_name}
                      </h4>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                      <span className="text-sm font-extrabold text-emerald-700">
                        ₹{p.price.toFixed(2)}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        /{p.unit}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Active Cart & Checkout Console */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex flex-col">
            {/* Cart Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm tracking-wide">Current Register Cart</h3>
                <span className="px-2 py-0.5 bg-slate-800 text-emerald-400 text-xs rounded-full font-bold">
                  {cart.length} items
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-slate-400 hover:text-rose-400 transition"
                  title="Clear Cart"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Cart Items Table */}
            <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 p-2">
              {cart.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">
                  Cart is empty. Tap any product on the left to add.
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="py-2.5 px-2 flex items-center justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-800 truncate">{item.name}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-2">
                        <span>Code: {item.code}</span>
                        <span>•</span>
                        <span>Rate: ₹</span>
                        <input
                          type="number"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => handleUpdatePrice(index, parseFloat(e.target.value) || 0)}
                          className="w-16 px-1 py-0.5 border border-slate-200 rounded font-semibold text-slate-700 text-[11px]"
                        />
                        <span>/{item.unit}</span>
                      </div>
                    </div>

                    {/* Qty modifiers */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleUpdateQty(index, item.qty - 1)}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-bold"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        step="0.01"
                        value={item.qty}
                        onChange={(e) => handleUpdateQty(index, parseFloat(e.target.value) || 0)}
                        className="w-12 text-center py-1 font-bold border border-slate-200 rounded text-slate-800 text-xs"
                      />
                      <button
                        onClick={() => handleUpdateQty(index, item.qty + 1)}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 font-bold"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Line total & delete */}
                    <div className="text-right shrink-0 min-w-[65px]">
                      <div className="font-extrabold text-slate-900">
                        ₹{item.total.toFixed(2)}
                      </div>
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="text-rose-500 hover:text-rose-700 mt-1"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5 ml-auto" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Customer & Payment Form */}
            <div className="p-4 bg-slate-50/70 border-t border-slate-200 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-slate-500 font-medium mb-1">Customer Name</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Walk-in Customer"
                      value={customer.name}
                      onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                      className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-500 font-medium mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="9876543210"
                      value={customer.phone}
                      onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                      className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Mode Selector */}
              <div>
                <label className="block text-slate-500 font-medium mb-1.5 text-xs">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'UPI', 'Card'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCustomer({ ...customer, payment_mode: mode })}
                      className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition ${
                        customer.payment_mode === mode
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
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
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-slate-600">Grand Total</span>
                  <span className="text-2xl font-black text-slate-900">
                    ₹{billTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleHoldBill}
                    disabled={cart.length === 0}
                    className="py-3 px-4 rounded-xl text-xs font-bold border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    <PauseCircle className="w-4 h-4 text-amber-600" />
                    <span>Hold Bill</span>
                  </button>

                  <button
                    onClick={handleCheckout}
                    disabled={cart.length === 0 || isCheckingOut}
                    className="py-3 px-4 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-700/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="py-12 text-center text-slate-400 text-sm">
              No parked transactions currently in queue.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {heldBills.map((hb) => (
                <div key={hb.id} className="py-3 flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">
                      {hb.customer_name || 'Parked Bill'}
                    </h4>
                    <span className="text-xs text-slate-400">
                      {hb.customer_phone ? `Phone: ${hb.customer_phone} • ` : ''}
                      Parked at: {hb.created_at ? new Date(hb.created_at).toLocaleTimeString() : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{hb.total.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleResumeBill(hb.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm"
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

      {/* Post-Checkout Success Modal */}
      <Modal
        isOpen={!!checkoutResult}
        onClose={() => setCheckoutResult(null)}
        title="Transaction Completed Successfully"
      >
        <div className="text-center py-4 space-y-4">
          <div className="flex justify-center mb-1">
            <img src="/logo.png" alt="PANDAS" className="h-12 object-contain" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 text-sm">PANDAS – NUTS &amp; CHOCOLATES</h4>
            <p className="text-[11px] text-slate-500">Near Bus Stop, Kottappuram • +91-9847345005</p>
          </div>

          <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Invoice Generated
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
              className="flex items-center gap-2 px-4 py-2.5 bg-navy-900 hover:bg-navy-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>Print Invoice Receipt</span>
            </a>

            <a
              href={`/bill/${checkoutResult?.invoice_no}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <FileDown className="w-4 h-4" />
              <span>Download PDF</span>
            </a>

            <button
              onClick={() => setCheckoutResult(null)}
              className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
            >
              Next Customer
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
