import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search,
  Plus,
  Upload,
  Edit2,
  Trash2,
  Save,
  Package,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  X,
  Filter,
  Check,
  RotateCcw,
  ArrowUpDown
} from 'lucide-react';
import { productsApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';
import { ProductFormModal } from './ProductFormModal';
import { isIntegerUnit, validateUnitQuantity, formatQuantity } from '../../utils/unitValidation';

export const Products = () => {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeFilter = searchParams.get('filter') || 'all';

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOption, setSortOption] = useState('code-asc');
  const [loading, setLoading] = useState(true);

  // Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Quick edit state (price and stock inline)
  const [quickEdits, setQuickEdits] = useState({});
  const [savingCode, setSavingCode] = useState(null);

  const fetchCategories = async () => {
    try {
      const res = await productsApi.getCategories();
      setCategories(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const params = {};
      if (selectedCategory) params.category = selectedCategory;
      if (searchTerm) params.search = searchTerm;
      const res = await productsApi.list(params);
      setProducts(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, searchTerm]);

  // Set stock filter in URL
  const setStockFilter = (filterVal) => {
    if (filterVal === 'all') {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', filterVal);
    }
    setSearchParams(searchParams);
  };

  // Check if any filters or search are active
  const hasActiveFilters = Boolean(
    searchTerm.trim() !== '' ||
    selectedCategory !== '' ||
    activeFilter !== 'all' ||
    sortOption !== 'code-asc'
  );

  // Complete filter reset functionality (search text, category, stock filter, sorting)
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('');
    setSortOption('code-asc');
    setSearchParams({});
    toast.info('All product filters and sorting have been reset to default.');
  };

  // Filter and sort products
  const displayedProducts = products
    .filter((p) => {
      const stock = Number(p.stock) || 0;
      if (activeFilter === 'low-stock') {
        return stock > 0 && stock <= 5;
      }
      if (activeFilter === 'out-of-stock') {
        return stock <= 0;
      }
      if (activeFilter === 'in-stock') {
        return stock > 5;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortOption === 'code-asc') return (a.item_code || '').localeCompare(b.item_code || '');
      if (sortOption === 'code-desc') return (b.item_code || '').localeCompare(a.item_code || '');
      if (sortOption === 'name-asc') return (a.item_name || '').localeCompare(b.item_name || '');
      if (sortOption === 'name-desc') return (b.item_name || '').localeCompare(a.item_name || '');
      if (sortOption === 'stock-desc') return (Number(b.stock) || 0) - (Number(a.stock) || 0);
      if (sortOption === 'stock-asc') return (Number(a.stock) || 0) - (Number(b.stock) || 0);
      if (sortOption === 'price-desc') return (Number(b.price) || 0) - (Number(a.price) || 0);
      if (sortOption === 'price-asc') return (Number(a.price) || 0) - (Number(b.price) || 0);
      return 0;
    });

  // Quick update handler
  const handleQuickChange = (code, field, value) => {
    setQuickEdits((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value,
      },
    }));
  };

  const handleSaveQuick = async (product) => {
    const edits = quickEdits[product.item_code];
    if (!edits) return;

    const newPrice = edits.price !== undefined ? edits.price : product.price;
    const newStock = edits.stock !== undefined ? edits.stock : product.stock;

    // Strict Unit Validation on Quick Edit
    if (edits.stock !== undefined) {
      const validation = validateUnitQuantity(newStock, product.unit);
      if (!validation.valid) {
        toast.error(validation.message);
        return;
      }
    }

    try {
      setSavingCode(product.item_code);
      await productsApi.quickUpdate(product.item_code, {
        price: newPrice,
        stock: newStock,
      });

      toast.success(`Updated ${product.item_code}`);
      setQuickEdits((prev) => {
        const copy = { ...prev };
        delete copy[product.item_code];
        return copy;
      });
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to update price/stock');
    } finally {
      setSavingCode(null);
    }
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`Are you sure you want to delete product ${code}?`)) return;
    try {
      await productsApi.delete(code);
      toast.success(`Product ${code} removed`);
      fetchProducts();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete product');
    }
  };

  const handleImportCsv = async () => {
    if (!window.confirm('Import catalog items from products.csv? Existing items will not be overwritten.')) return;
    try {
      const res = await productsApi.importCsv();
      toast.success(`Import complete! ${res.data.imported_rows} rows processed.`);
      fetchProducts();
      fetchCategories();
    } catch (err) {
      console.error(err);
      toast.error('Failed to import CSV');
    }
  };

  const totalInStock = products.filter((p) => (Number(p.stock) || 0) > 5).length;
  const totalLowStock = products.filter((p) => {
    const s = Number(p.stock) || 0;
    return s > 0 && s <= 5;
  }).length;
  const totalOutOfStock = products.filter((p) => (Number(p.stock) || 0) <= 0).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {/* Context Breadcrumb & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
            <span>Catalog</span>
            <span className="text-slate-300">•</span>
            <span className="text-[#F5B900] font-bold">Catalog Directory</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Manage stock balances, selling prices, and item specifications</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleImportCsv}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-700 bg-white hover:bg-gold-50/60 hover:border-gold-300 border border-slate-200/90 rounded-xl shadow-xs transition active:scale-95"
            title="Import from products.csv"
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            <span>Import CSV</span>
          </button>

          <button
            onClick={() => {
              setEditingProduct(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-black bg-[#F5B900] hover:bg-[#E5AC00] text-[#111111] rounded-xl shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Stock Status Pills */}
      <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStockFilter('all')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
            activeFilter === 'all'
              ? 'bg-[#F5B900] text-[#111111] shadow-sm font-black'
              : 'text-slate-600 hover:bg-gold-50/60 hover:text-slate-900 border border-transparent'
          }`}
        >
          <span>All Catalog</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
            activeFilter === 'all' ? 'bg-[#111111] text-[#F5B900] font-black' : 'bg-slate-100 text-slate-600 font-bold'
          }`}>
            {products.length}
          </span>
        </button>

        <button
          onClick={() => setStockFilter('in-stock')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
            activeFilter === 'in-stock'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100/80'
          }`}
        >
          <span>In Stock</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
            activeFilter === 'in-stock' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-700'
          }`}>
            {totalInStock}
          </span>
        </button>

        <button
          onClick={() => setStockFilter('low-stock')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
            activeFilter === 'low-stock'
              ? 'bg-amber-500 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100/80'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Low Stock (≤5)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
            activeFilter === 'low-stock' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-700'
          }`}>
            {totalLowStock}
          </span>
        </button>

        <button
          onClick={() => setStockFilter('out-of-stock')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 active:scale-95 ${
            activeFilter === 'out-of-stock'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100/80'
          }`}
        >
          <XCircle className="w-3.5 h-3.5" />
          <span>Out of Stock (0)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] ${
            activeFilter === 'out-of-stock' ? 'bg-rose-700 text-white' : 'bg-rose-50 text-rose-700'
          }`}>
            {totalOutOfStock}
          </span>
        </button>

        {/* Reset Filter Button in Pills Bar */}
        {hasActiveFilters && (
          <button
            onClick={handleResetFilters}
            className="ml-auto text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/80 border border-rose-200/80 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow-xs"
            title="Reset search, categories, stock filter, and sorting"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset All Filters</span>
          </button>
        )}
      </div>

      {/* Active Filter Notice Banner */}
      {hasActiveFilters && (
        <div className="px-4 py-2.5 rounded-2xl border border-amber-200 bg-amber-50/70 text-amber-900 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-600" />
            <span>
              Active Filter:{' '}
              <strong>
                {activeFilter !== 'all' && `[Stock: ${activeFilter}] `}
                {selectedCategory && `[Dept: ${selectedCategory}] `}
                {searchTerm && `[Search: "${searchTerm}"] `}
                {sortOption !== 'code-asc' && `[Sort: ${sortOption}] `}
              </strong>
              ({displayedProducts.length} items shown)
            </span>
          </div>
          <button
            onClick={handleResetFilters}
            className="text-xs font-bold text-rose-700 hover:underline flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear Filters &amp; Show All</span>
          </button>
        </div>
      )}

      {/* Search & Category Filter Controls */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search item code, name, or brand..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 font-medium"
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

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 shadow-xs"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-bold">Sort By:</span>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-gold-500/20 focus:border-gold-500 shadow-xs"
            >
              <option value="code-asc">SKU (A to Z)</option>
              <option value="code-desc">SKU (Z to A)</option>
              <option value="name-asc">Product Name (A-Z)</option>
              <option value="stock-desc">Stock (High to Low)</option>
              <option value="stock-asc">Stock (Low to High)</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
            </select>
          </div>

          {/* Dedicated Always-Visible Reset Filters Button */}
          <button
            type="button"
            onClick={handleResetFilters}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition active:scale-95 shadow-xs border ${
              hasActiveFilters
                ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100 hover:border-rose-400'
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
            }`}
            title="Reset search text, categories, stock filter, and sorting"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${hasActiveFilters ? 'text-rose-600' : 'text-slate-400'}`} />
            <span>Reset Filters</span>
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {loading ? (
          <Loading text="Loading catalog records..." fullHeight />
        ) : displayedProducts.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-slate-700 text-sm">No products match your search or filter.</p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="mt-3 px-4 py-2 bg-navy-900 text-gold-400 border border-gold-500/30 hover:bg-navy-800 font-bold rounded-xl text-xs transition active:scale-95 shadow-sm inline-flex items-center gap-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters &amp; Show Full Catalog</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Product Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Sale Price (₹)</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Unit</th>
                  <th className="py-3.5 px-4">Stock Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedProducts.map((p) => {
                  const stockNum = Number(p.stock) || 0;
                  const currentPrice =
                    quickEdits[p.item_code]?.price !== undefined
                      ? quickEdits[p.item_code].price
                      : p.price;
                  const currentStock =
                    quickEdits[p.item_code]?.stock !== undefined
                      ? quickEdits[p.item_code].stock
                      : p.stock;
                  const isDirty =
                    quickEdits[p.item_code]?.price !== undefined ||
                    quickEdits[p.item_code]?.stock !== undefined;

                  const isOutOfStock = stockNum <= 0;
                  const isLowStock = stockNum > 0 && stockNum <= 5;

                  return (
                    <tr
                      key={p.item_code}
                      className={`hover:bg-gold-50/40 transition-colors ${
                        isOutOfStock
                          ? 'bg-rose-50/30'
                          : isLowStock
                          ? 'bg-amber-50/30'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {p.item_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{p.item_name}</div>
                        {p.company && (
                          <div className="text-[11px] text-slate-400 font-medium">
                            Brand: {p.company}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold text-[11px]">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={currentPrice}
                            onChange={(e) =>
                              handleQuickChange(p.item_code, 'price', parseFloat(e.target.value) || 0)
                            }
                            className={`w-20 px-2 py-1 rounded-lg border font-black text-slate-800 text-xs focus:outline-none transition ${
                              isDirty
                                ? 'border-amber-400 bg-amber-50/50'
                                : 'border-slate-200 bg-white'
                            }`}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step={isIntegerUnit(p.unit) ? "1" : "0.01"}
                          value={currentStock}
                          onChange={(e) =>
                            handleQuickChange(p.item_code, 'stock', parseFloat(e.target.value) || 0)
                          }
                          className={`w-20 px-2 py-1 rounded-lg border font-black text-slate-800 text-xs focus:outline-none transition ${
                            isDirty
                              ? 'border-amber-400 bg-amber-50/50'
                              : 'border-slate-200 bg-white'
                          }`}
                        />
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-semibold">{p.unit}</td>
                      <td className="py-3 px-4">
                        {isOutOfStock ? (
                          <Badge variant="danger" size="sm">
                            Out of Stock (0)
                          </Badge>
                        ) : isLowStock ? (
                          <Badge variant="warning" size="sm">
                            Low Stock ({formatQuantity(p.stock, p.unit)})
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            In Stock ({formatQuantity(p.stock, p.unit)})
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isDirty && (
                            <button
                              onClick={() => handleSaveQuick(p)}
                              disabled={savingCode === p.item_code}
                              className="p-1.5 bg-gold-500 text-navy-900 font-bold rounded-lg hover:bg-gold-400 shadow-sm transition"
                              title="Save Quick Updates"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => {
                              setEditingProduct(p);
                              setModalOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition"
                            title="Edit Full Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDelete(p.item_code)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        product={editingProduct}
        categories={categories}
        onSuccess={() => {
          fetchProducts();
          fetchCategories();
        }}
      />
    </div>
  );
};
