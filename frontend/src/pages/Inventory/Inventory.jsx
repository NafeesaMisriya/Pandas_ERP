import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Boxes,
  AlertTriangle,
  XCircle,
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Plus,
  Minus,
  Sliders,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  FileSpreadsheet,
  Printer,
  History,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ShoppingBag,
  ExternalLink,
  Info
} from 'lucide-react';
import { inventoryApi, productsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { isIntegerUnit, validateUnitQuantity } from '../../utils/unitValidation';

export const Inventory = () => {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Active Tab: 'alerts', 'reorder', 'movements', 'valuation'
  const activeTab = searchParams.get('tab') || 'alerts';

  // Overall status data
  const [statusData, setStatusData] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Categories list
  const [categories, setCategories] = useState([]);

  // Tab 1: Alerts State
  const [alerts, setAlerts] = useState([]);
  const [loadingAlerts, setLoadingAlerts] = useState(false);
  const [alertStatusFilter, setAlertStatusFilter] = useState(searchParams.get('status') || 'all');
  const [alertCategoryFilter, setAlertCategoryFilter] = useState('');
  const [alertSearch, setAlertSearch] = useState('');

  // Tab 2: Reorder Suggestions State
  const [reorderData, setReorderData] = useState({ suggestions: [], total_items: 0, total_units: 0, total_estimated_investment: 0 });
  const [loadingReorder, setLoadingReorder] = useState(false);
  const [reorderCategoryFilter, setReorderCategoryFilter] = useState('');
  const [reorderSearch, setReorderSearch] = useState('');

  // Tab 3: Movements Ledger State
  const [movements, setMovements] = useState([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementTypeFilter, setMovementTypeFilter] = useState('All');
  const [movementSearch, setMovementSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [movementLimit] = useState(100);

  // Tab 4: Valuation & Products State
  const [allProducts, setAllProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [valuationSearch, setValuationSearch] = useState('');
  const [valuationCategory, setValuationCategory] = useState('');

  // Stock Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustType, setAdjustType] = useState('set'); // 'add', 'remove', 'set'
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustCategory, setAdjustCategory] = useState('Audit Discrepancy');
  const [adjustPerformedBy, setAdjustPerformedBy] = useState('Store Manager');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Load overall metrics & categories
  const fetchStatus = async () => {
    try {
      setLoadingStatus(true);
      const [resStatus, resCat] = await Promise.all([
        inventoryApi.getStatus(),
        productsApi.getCategories(),
      ]);
      setStatusData(resStatus.data);
      setCategories(resCat.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load inventory valuation metrics');
    } finally {
      setLoadingStatus(false);
    }
  };

  // Load Alerts
  const fetchAlerts = async () => {
    try {
      setLoadingAlerts(true);
      const params = {};
      if (alertStatusFilter && alertStatusFilter !== 'all') params.status = alertStatusFilter;
      if (alertCategoryFilter && alertCategoryFilter !== 'All') params.category = alertCategoryFilter;
      if (alertSearch.trim()) params.search = alertSearch.trim();

      const res = await inventoryApi.getAlerts(params);
      setAlerts(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load stock alerts');
    } finally {
      setLoadingAlerts(false);
    }
  };

  // Load Reorder Suggestions
  const fetchReorder = async () => {
    try {
      setLoadingReorder(true);
      const params = {};
      if (reorderCategoryFilter && reorderCategoryFilter !== 'All') params.category = reorderCategoryFilter;
      if (reorderSearch.trim()) params.search = reorderSearch.trim();

      const res = await inventoryApi.getReorderSuggestions(params);
      setReorderData(res.data || { suggestions: [], total_items: 0, total_units: 0, total_estimated_investment: 0 });
    } catch (err) {
      console.error(err);
      toast.error('Failed to load reorder suggestions');
    } finally {
      setLoadingReorder(false);
    }
  };

  // Load Movements Ledger
  const fetchMovements = async () => {
    try {
      setLoadingMovements(true);
      const params = { limit: movementLimit };
      if (movementTypeFilter && movementTypeFilter !== 'All') params.movement_type = movementTypeFilter;
      if (movementSearch.trim()) params.search = movementSearch.trim();
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const res = await inventoryApi.getMovements(params);
      setMovements(res.data?.movements || []);
      setMovementTotal(res.data?.total_count || 0);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load stock movement ledger');
    } finally {
      setLoadingMovements(false);
    }
  };

  // Load Products for Valuation
  const fetchValuation = async () => {
    try {
      setLoadingProducts(true);
      const params = {};
      if (valuationCategory && valuationCategory !== 'All') params.category = valuationCategory;
      if (valuationSearch.trim()) params.search = valuationSearch.trim();

      const res = await productsApi.list(params);
      setAllProducts(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products for valuation');
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'alerts') {
      fetchAlerts();
    } else if (activeTab === 'reorder') {
      fetchReorder();
    } else if (activeTab === 'movements') {
      fetchMovements();
    } else if (activeTab === 'valuation') {
      fetchValuation();
    }
  }, [activeTab, alertStatusFilter, alertCategoryFilter, reorderCategoryFilter, movementTypeFilter, fromDate, toDate, valuationCategory]);

  const setTab = (tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  // Open Adjust Modal
  const handleOpenAdjust = (product = null) => {
    if (product) {
      setAdjustItem(product);
      setAdjustQuantity(product.stock?.toString() || '0');
      setAdjustType('set');
    } else {
      setAdjustItem(null);
      setAdjustQuantity('');
      setAdjustType('set');
    }
    setAdjustReason('');
    setAdjustCategory('Audit Discrepancy');
    setIsAdjustModalOpen(true);
  };

  // Perform Stock Adjustment
  const handlePerformAdjust = async (e) => {
    e.preventDefault();
    if (!adjustItem?.item_code) {
      toast.error('Please select a product to adjust');
      return;
    }
    if (!adjustReason.trim()) {
      toast.error('Adjustment reason is mandatory for stock audit compliance');
      return;
    }
    if (adjustQuantity === '' || isNaN(adjustQuantity)) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const unit = adjustItem.unit || 'pc';
    const validation = validateUnitQuantity(adjustQuantity, unit);
    if (!validation.valid) {
      toast.error(validation.message);
      return;
    }

    try {
      setSubmittingAdjust(true);
      const payload = {
        item_code: adjustItem.item_code,
        adjustment_type: adjustType,
        quantity: parseFloat(adjustQuantity),
        reason: `[${adjustCategory}] ${adjustReason.trim()}`,
        performed_by: adjustPerformedBy,
        movement_category: adjustCategory.toLowerCase(),
      };

      const res = await inventoryApi.adjust(payload);
      toast.success(res.data?.message || 'Stock successfully adjusted');
      setIsAdjustModalOpen(false);

      // Refresh data
      fetchStatus();
      if (activeTab === 'alerts') fetchAlerts();
      if (activeTab === 'reorder') fetchReorder();
      if (activeTab === 'movements') fetchMovements();
      if (activeTab === 'valuation') fetchValuation();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to adjust stock');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // Calculate projected stock in adjustment modal
  const getProjectedStock = () => {
    if (!adjustItem) return 0;
    const current = parseFloat(adjustItem.stock || 0);
    const qty = parseFloat(adjustQuantity) || 0;
    if (adjustType === 'add') return current + qty;
    if (adjustType === 'remove') return Math.max(0, current - qty);
    if (adjustType === 'set') return qty;
    return current;
  };

  // Export Movements to CSV
  const handleExportMovementsCSV = () => {
    if (!movements || movements.length === 0) {
      toast.error('No movement records available to export');
      return;
    }

    const headers = ['ID', 'Date Time', 'SKU', 'Product Name', 'Category', 'Movement Type', 'Qty Changed', 'Previous Stock', 'Updated Stock', 'Reference', 'Reason', 'Performed By'];
    const rows = movements.map((m) => [
      m.id,
      m.created_at || '',
      m.item_code,
      `"${(m.item_name || '').replace(/"/g, '""')}"`,
      m.category || '',
      m.movement_type,
      m.quantity,
      m.previous_stock,
      m.updated_stock,
      `"${(m.reference_id || '').replace(/"/g, '""')}"`,
      `"${(m.reason || '').replace(/"/g, '""')}"`,
      m.performed_by || '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PANDAS_Stock_Movements_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Movement ledger exported to CSV');
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* 1. Header & Navigation Context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>ERP</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Inventory Management</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time stock monitoring, automated reorder suggestions, and audit movement ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenAdjust()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-black bg-[#111111] hover:bg-slate-800 text-white rounded-xl shadow-xs transition active:scale-95"
          >
            <Sliders className="w-3.5 h-3.5 text-[#F5B900]" />
            <span>Manual Adjustment</span>
          </button>

          <button
            onClick={() => {
              fetchStatus();
              if (activeTab === 'alerts') fetchAlerts();
              if (activeTab === 'reorder') fetchReorder();
              if (activeTab === 'movements') fetchMovements();
              if (activeTab === 'valuation') fetchValuation();
              toast.info('Inventory data refreshed');
            }}
            className="p-2 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-600 hover:text-slate-900 transition shadow-xs"
            title="Refresh All Inventory Data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Top Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Asset Valuation</span>
            <Boxes className="w-4 h-4 text-[#F5B900]" />
          </div>
          <div className="text-xl font-black text-slate-900">
            ₹{(statusData?.total_cost_valuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Cost value of on-hand inventory</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Retail Potential</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600">
            ₹{(statusData?.total_retail_valuation || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            Margin: ₹{(statusData?.potential_profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
          </span>
        </div>

        <div
          onClick={() => {
            setTab('alerts');
            setAlertStatusFilter('out_of_stock');
          }}
          className="bg-white p-4 rounded-2xl border border-rose-200/80 shadow-xs hover:border-rose-400 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Out of Stock</span>
            <XCircle className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-black text-rose-600">{statusData?.out_of_stock_count || 0}</div>
          <span className="text-[10px] text-rose-600/80 font-semibold">Immediate stockout</span>
        </div>

        <div
          onClick={() => {
            setTab('alerts');
            setAlertStatusFilter('low_stock');
          }}
          className="bg-white p-4 rounded-2xl border border-amber-200/80 shadow-xs hover:border-amber-400 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Low Stock Alerts</span>
            <AlertTriangle className="w-4 h-4 text-[#F5B900] group-hover:scale-110 transition-transform" />
          </div>
          <div className="text-xl font-black text-amber-600">{statusData?.low_stock_count || 0}</div>
          <span className="text-[10px] text-amber-800/80 font-semibold">Below min threshold</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider">Catalog Health</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-slate-900">{statusData?.healthy_stock_count || 0}</div>
          <span className="text-[10px] text-blue-600 font-semibold">
            of {statusData?.total_items || 0} active products
          </span>
        </div>
      </div>

      {/* 3. Tab Bar Navigation */}
      <div className="flex items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto">
        <button
          onClick={() => setTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shrink-0 ${
            activeTab === 'alerts'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <AlertTriangle className={`w-3.5 h-3.5 ${activeTab === 'alerts' ? 'text-[#F5B900]' : 'text-slate-400'}`} />
          <span>Stock Alerts</span>
          {((statusData?.out_of_stock_count || 0) + (statusData?.low_stock_count || 0)) > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
              {(statusData?.out_of_stock_count || 0) + (statusData?.low_stock_count || 0)}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('reorder')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shrink-0 ${
            activeTab === 'reorder'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'reorder' ? 'text-[#F5B900]' : 'text-slate-400'}`} />
          <span>Reorder Suggestions</span>
          {reorderData?.total_items > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
              {reorderData.total_items}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('movements')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shrink-0 ${
            activeTab === 'movements'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <History className={`w-3.5 h-3.5 ${activeTab === 'movements' ? 'text-[#F5B900]' : 'text-slate-400'}`} />
          <span>Stock Movement Ledger</span>
          {movementTotal > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-200/60 text-slate-700">
              {movementTotal}
            </span>
          )}
        </button>

        <button
          onClick={() => setTab('valuation')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition shrink-0 ${
            activeTab === 'valuation'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
          }`}
        >
          <Layers className={`w-3.5 h-3.5 ${activeTab === 'valuation' ? 'text-[#F5B900]' : 'text-slate-400'}`} />
          <span>Valuation &amp; Stock Levels</span>
        </button>
      </div>

      {/* 4. TAB CONTENTS */}

      {/* TAB 1: STOCK ALERTS */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search alerts by SKU or product name..."
                value={alertSearch}
                onChange={(e) => setAlertSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchAlerts()}
                className="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              {/* Category Filter */}
              <select
                value={alertCategoryFilter}
                onChange={(e) => setAlertCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={alertStatusFilter}
                onChange={(e) => setAlertStatusFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="all">All Alerts</option>
                <option value="out_of_stock">Out of Stock Only</option>
                <option value="low_stock">Low Stock Only</option>
              </select>

              <button
                onClick={fetchAlerts}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Alerts Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingAlerts ? (
              <div className="py-16 text-center">
                <Loading size="lg" />
                <p className="text-xs text-slate-400 mt-2">Checking stock alert thresholds...</p>
              </div>
            ) : alerts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                      <th className="py-3 px-4">Product Info</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Current Stock</th>
                      <th className="py-3 px-4">Thresholds (Min / Target)</th>
                      <th className="py-3 px-4">Alert Status</th>
                      <th className="py-3 px-4">Suggested Reorder</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {alerts.map((item) => {
                      const isZero = item.stock <= 0;
                      return (
                        <tr
                          key={item.item_code}
                          className={`transition-colors ${
                            isZero ? 'bg-rose-50/30 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {item.has_image ? (
                                <img
                                  src={item.image_url}
                                  alt={item.item_name}
                                  className="w-9 h-9 rounded-lg object-cover border border-slate-200"
                                />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs border border-slate-200">
                                  {item.item_code?.slice(0, 2)}
                                </div>
                              )}
                              <div>
                                <span className="font-bold text-slate-900 block">{item.item_name}</span>
                                <span className="font-mono text-[10px] text-slate-400">SKU: {item.item_code}</span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-slate-600 font-medium">{item.category}</td>

                          <td className="py-3 px-4">
                            <span className={`font-black text-sm ${isZero ? 'text-rose-600' : 'text-amber-600'}`}>
                              {item.stock}
                            </span>{' '}
                            <span className="text-[11px] text-slate-400">{item.unit}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <span className="text-amber-800 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Min: {item.min_stock}
                              </span>
                              <span className="text-emerald-800 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                Target: {item.target_stock}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {isZero ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3 text-rose-500" />
                                Out of Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-3 h-3 text-[#F5B900]" />
                                Low Stock
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <div>
                              <span className="font-bold text-slate-900">
                                +{item.suggested_reorder_qty} {item.unit}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                Est: ₹{item.estimated_reorder_cost?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenAdjust(item)}
                                className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 transition active:scale-95"
                                title="Adjust Stock Manually"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => navigate('/purchases')}
                                className="px-2.5 py-1 text-[11px] font-bold bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-lg shadow-2xs transition active:scale-95"
                                title="Inward Consignment Purchase"
                              >
                                Inward PO
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center bg-slate-50/50">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">All Inventory Levels Are Healthy</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  No items are currently below their minimum safety threshold.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REORDER SUGGESTIONS */}
      {activeTab === 'reorder' && (
        <div className="space-y-4">
          {/* Formula Explanation & Aggregate Investment Banner */}
          <div className="bg-amber-50/70 p-4 md:p-5 rounded-2xl border border-amber-200/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-[#F5B900] text-[#111111] font-bold">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h4 className="font-black text-slate-900 text-sm">Automated Restock Formulation</h4>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Algorithm: <code className="bg-white/80 px-2 py-0.5 rounded text-slate-800 font-mono font-bold">Suggested Reorder Qty = Target Stock Level − Current Stock</code>
              </p>
              <p className="text-[11px] text-slate-500">
                Triggered strictly for products falling at or below their individualized safety threshold.
              </p>
            </div>

            <div className="bg-white px-4 py-3 rounded-xl border border-amber-200 shadow-xs text-right w-full md:w-auto">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Est. Investment</span>
              <span className="text-xl font-black text-[#111111]">
                ₹{(reorderData?.total_estimated_investment || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="block text-[10px] text-slate-500 font-medium">
                For {reorderData?.total_items || 0} items ({reorderData?.total_units || 0} units)
              </span>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search reorder suggestions..."
                value={reorderSearch}
                onChange={(e) => setReorderSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchReorder()}
                className="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={reorderCategoryFilter}
                onChange={(e) => setReorderCategoryFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchReorder}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Apply
              </button>

              <button
                onClick={() => navigate('/purchases')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-xs transition active:scale-95 shrink-0"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Go to Purchase Entry</span>
              </button>
            </div>
          </div>

          {/* Suggestions Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingReorder ? (
              <div className="py-16 text-center">
                <Loading size="lg" />
                <p className="text-xs text-slate-400 mt-2">Computing reorder quantities...</p>
              </div>
            ) : reorderData?.suggestions?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Current Stock</th>
                      <th className="py-3 px-4">Min Stock</th>
                      <th className="py-3 px-4">Target Stock</th>
                      <th className="py-3 px-4">Suggested Reorder Qty</th>
                      <th className="py-3 px-4">Cost Price</th>
                      <th className="py-3 px-4">Est. Investment</th>
                      <th className="py-3 px-4">Urgency</th>
                      <th className="py-3 px-4 text-right">Inward</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {reorderData.suggestions.map((item) => {
                      const isCritical = item.urgency === 'CRITICAL';
                      return (
                        <tr
                          key={item.item_code}
                          className={`transition-colors ${
                            isCritical ? 'bg-rose-50/30 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{item.item_name}</span>
                            <span className="font-mono text-[10px] text-slate-400">SKU: {item.item_code}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-600 font-medium">{item.category}</td>

                          <td className="py-3 px-4">
                            <span className={`font-black text-sm ${item.stock <= 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                              {item.stock}
                            </span>{' '}
                            <span className="text-[11px] text-slate-400">{item.unit}</span>
                          </td>

                          <td className="py-3 px-4 text-amber-800 font-bold">{item.min_stock} {item.unit}</td>

                          <td className="py-3 px-4 text-emerald-800 font-bold">{item.target_stock} {item.unit}</td>

                          <td className="py-3 px-4">
                            <span className="font-black text-sm text-[#111111] bg-amber-100/70 px-2 py-0.5 rounded border border-amber-300">
                              +{item.suggested_reorder_qty} {item.unit}
                            </span>
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            ₹{item.cost_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4 font-black text-slate-900">
                            ₹{item.estimated_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4">
                            {isCritical ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                CRITICAL (0 Stock)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                                WARNING
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => navigate('/purchases')}
                              className="px-3 py-1 bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-lg font-bold text-xs transition active:scale-95"
                            >
                              Inward PO
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center bg-slate-50/50">
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">No Reorder Needed At This Time</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  All active catalog items are maintained above minimum threshold capacity.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: STOCK MOVEMENT LEDGER */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Movement Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row gap-3 items-center justify-between">
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search ledger by SKU, reason, ref..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMovements()}
                className="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              {/* Movement Type Filter */}
              <select
                value={movementTypeFilter}
                onChange={(e) => setMovementTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="All">All Movements</option>
                <option value="Sale">Sale (POS)</option>
                <option value="Purchase Received">Purchase Received</option>
                <option value="Sales Return">Sales Return / Bill Cancel</option>
                <option value="Manual Stock Adjustment">Manual Adjustment</option>
                <option value="Damaged or Expired Stock Removal">Damaged / Expired</option>
              </select>

              {/* Date Filters */}
              <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 font-medium">From:</span>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                <span className="text-[11px] text-slate-400 font-medium">To:</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
                />
              </div>

              <button
                onClick={fetchMovements}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Filter
              </button>

              <button
                onClick={handleExportMovementsCSV}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl shadow-2xs transition"
                title="Download CSV report"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Movements Ledger Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingMovements ? (
              <div className="py-16 text-center">
                <Loading size="lg" />
                <p className="text-xs text-slate-400 mt-2">Loading stock movement ledger...</p>
              </div>
            ) : movements.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                      <th className="py-3 px-4">Date / Time</th>
                      <th className="py-3 px-4">Product</th>
                      <th className="py-3 px-4">Movement Type</th>
                      <th className="py-3 px-4">Qty Changed</th>
                      <th className="py-3 px-4">Balance (Prev → New)</th>
                      <th className="py-3 px-4">Reference</th>
                      <th className="py-3 px-4">Audit Reason / Notes</th>
                      <th className="py-3 px-4">Operator</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {movements.map((m) => {
                      const isPositive = m.quantity > 0;
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                            {m.created_at}
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{m.item_name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{m.item_code}</span>
                          </td>

                          <td className="py-3 px-4">
                            {m.movement_type === 'Purchase Received' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <ArrowUpRight className="w-3 h-3" />
                                Purchase Inward
                              </span>
                            )}
                            {m.movement_type === 'Sale' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                <ArrowDownRight className="w-3 h-3" />
                                POS Sale
                              </span>
                            )}
                            {m.movement_type === 'Sales Return' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                                <RefreshCw className="w-3 h-3" />
                                Sales Return
                              </span>
                            )}
                            {m.movement_type === 'Manual Stock Adjustment' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-800 border border-amber-200">
                                <Sliders className="w-3 h-3" />
                                Manual Adj
                              </span>
                            )}
                            {m.movement_type === 'Damaged or Expired Stock Removal' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                <XCircle className="w-3 h-3" />
                                Damaged/Expired
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono font-bold">
                            <span className={isPositive ? 'text-emerald-600' : 'text-rose-600'}>
                              {isPositive ? `+${m.quantity}` : m.quantity} {m.unit}
                            </span>
                          </td>

                          <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                            <span>{m.previous_stock}</span>
                            <span className="text-slate-400 mx-1.5">→</span>
                            <span className="font-bold text-slate-900">{m.updated_stock}</span>
                          </td>

                          <td className="py-3 px-4 font-mono text-slate-600 text-[11px]">
                            {m.reference_id || '—'}
                          </td>

                          <td className="py-3 px-4 text-slate-700 text-xs max-w-xs truncate" title={m.reason}>
                            {m.reason || '—'}
                          </td>

                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {m.performed_by || 'System'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center bg-slate-50/50">
                <History className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                <h4 className="font-bold text-slate-700 text-sm">No Stock Movements Logged</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Transactions, purchase entries, and manual adjustments will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: VALUATION & STOCK LEVELS */}
      {activeTab === 'valuation' && (
        <div className="space-y-4">
          {/* Category Valuation Breakdown */}
          {statusData?.categories?.length > 0 && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Category Stock Valuation Breakdown
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statusData.categories.map((c) => (
                  <div key={c.category} className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70">
                    <span className="font-bold text-slate-800 text-xs block">{c.category}</span>
                    <span className="text-base font-black text-slate-900 block mt-1">
                      ₹{c.valuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                      <span>{c.item_count} items ({c.total_stock} stock)</span>
                      {c.alerts_count > 0 && (
                        <span className="text-amber-700 font-bold">{c.alerts_count} alerts</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Product Levels Table */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search catalog products..."
                value={valuationSearch}
                onChange={(e) => setValuationSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchValuation()}
                className="w-full pl-10 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <select
                value={valuationCategory}
                onChange={(e) => setValuationCategory(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={fetchValuation}
                className="px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            {loadingProducts ? (
              <div className="py-16 text-center">
                <Loading size="lg" />
                <p className="text-xs text-slate-400 mt-2">Loading stock levels...</p>
              </div>
            ) : allProducts.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px] bg-slate-50/70">
                      <th className="py-3 px-4">SKU / Product</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">On Hand Stock</th>
                      <th className="py-3 px-4">Cost Price</th>
                      <th className="py-3 px-4">Retail Price</th>
                      <th className="py-3 px-4">Total Cost Valuation</th>
                      <th className="py-3 px-4">Total Retail Valuation</th>
                      <th className="py-3 px-4 text-right">Stock Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {allProducts.map((p) => {
                      const costVal = (p.stock || 0) * (p.cost_price || 0);
                      const retVal = (p.stock || 0) * (p.price || 0);
                      return (
                        <tr key={p.item_code} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 block">{p.item_name}</span>
                            <span className="font-mono text-[10px] text-slate-400">{p.item_code}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-600">{p.category}</td>

                          <td className="py-3 px-4">
                            <span className={`font-black text-sm ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                              {p.stock}
                            </span>{' '}
                            <span className="text-[11px] text-slate-400">{p.unit}</span>
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            ₹{p.cost_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4 text-slate-600">
                            ₹{p.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4 font-bold text-slate-900">
                            ₹{costVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4 font-bold text-emerald-600">
                            ₹{retVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleOpenAdjust(p)}
                              className="px-3 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 transition active:scale-95"
                            >
                              Adjust
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400">
                No products found matching query.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. MANUAL STOCK ADJUSTMENT MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={adjustItem ? `Adjust Stock: ${adjustItem.item_name}` : 'Stock Audit Adjustment'}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handlePerformAdjust} className="space-y-4">
          {/* Select product if not already selected */}
          {!adjustItem ? (
            <div>
              <label className="block text-slate-600 font-bold mb-1 text-xs">Select Product *</label>
              <select
                onChange={(e) => {
                  const found = allProducts.find((p) => p.item_code === e.target.value);
                  if (found) {
                    setAdjustItem(found);
                    setAdjustQuantity(found.stock?.toString() || '0');
                  }
                }}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
              >
                <option value="">-- Choose a product --</option>
                {allProducts.map((p) => (
                  <option key={p.item_code} value={p.item_code}>
                    {p.item_name} ({p.item_code}) — On hand: {p.stock} {p.unit}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 block text-xs">{adjustItem.item_name}</span>
                <span className="text-[10px] text-slate-500 font-mono">SKU: {adjustItem.item_code} • Unit: {adjustItem.unit}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Stock</span>
                <span className="text-lg font-black text-slate-900">{adjustItem.stock} {adjustItem.unit}</span>
              </div>
            </div>
          )}

          {/* Adjustment Type Selector */}
          <div>
            <label className="block text-slate-600 font-bold mb-1 text-xs">Operation Type *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType('set')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                  adjustType === 'set'
                    ? 'bg-[#111111] text-white border-[#111111]'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Set Exact Stock (=)
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('add')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                  adjustType === 'add'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Add Stock (+)
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('remove')}
                className={`py-2 px-3 rounded-xl border font-bold text-xs transition ${
                  adjustType === 'remove'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Remove Stock (−)
              </button>
            </div>
          </div>

          {/* Quantity Input with Live Preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 font-bold mb-1 text-xs">
                Quantity {adjustItem ? `(${adjustItem.unit})` : ''} *
                {adjustItem && isIntegerUnit(adjustItem.unit) && (
                  <span className="text-[10px] text-amber-700 font-normal ml-1">(whole nos only)</span>
                )}
              </label>
              <input
                type="number"
                step={adjustItem && isIntegerUnit(adjustItem.unit) ? "1" : "0.01"}
                min="0"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-black text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
                placeholder="0"
              />
            </div>

            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Projected Balance</span>
              <span className="text-lg font-black text-emerald-600">
                {getProjectedStock()} {adjustItem?.unit || 'units'}
              </span>
            </div>
          </div>

          {/* Reason Category */}
          <div>
            <label className="block text-slate-600 font-bold mb-1 text-xs">Audit Movement Category *</label>
            <select
              value={adjustCategory}
              onChange={(e) => setAdjustCategory(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
            >
              <option value="Audit Discrepancy">Periodic Physical Count Discrepancy</option>
              <option value="Damage Goods">Damaged or Broken Goods</option>
              <option value="Expired Stock">Expired Stock Removal</option>
              <option value="Shrinkage Waste">Shrinkage / Spill / Waste</option>
              <option value="Opening Balance">Opening Stock Balance Setup</option>
              <option value="Internal Transfer">Internal Store Sampling / Tasting</option>
            </select>
          </div>

          {/* Mandatory Reason */}
          <div>
            <label className="block text-slate-600 font-bold mb-1 text-xs">Mandatory Detailed Reason *</label>
            <textarea
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              required
              rows={2}
              placeholder="e.g. Broken packaging discovered during shelf reorganization"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
            />
          </div>

          {/* Operator Name */}
          <div>
            <label className="block text-slate-600 font-bold mb-1 text-xs">Authorizing Operator</label>
            <input
              type="text"
              value={adjustPerformedBy}
              onChange={(e) => setAdjustPerformedBy(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F5B900]/20 focus:border-[#F5B900]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingAdjust}
              className="px-5 py-2 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-xs transition active:scale-95 disabled:opacity-50"
            >
              {submittingAdjust ? 'Updating Ledger...' : 'Commit Stock Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

