import React, { useState, useEffect } from 'react';
import {
  CalendarCheck,
  Printer,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ShieldCheck,
  DollarSign
} from 'lucide-react';
import { zReportApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Loading } from '../../components/common/Loading';
import { Badge } from '../../components/common/Badge';

export const ZReport = () => {
  const toast = useToast();
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchZReport = async (d = selectedDate) => {
    try {
      setLoading(true);
      const res = await zReportApi.get(d);
      setReport(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load Z-Report data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchZReport(selectedDate);
  }, [selectedDate]);

  const handleGenerate = async () => {
    if (!window.confirm(`Are you sure you want to permanently close and lock the Z-Report for ${selectedDate}? Once saved, this end-of-day settlement cannot be recalculated.`)) return;

    try {
      setGenerating(true);
      const res = await zReportApi.generate(selectedDate);
      toast.success(res.data.message || 'Z-Report generated successfully');
      setReport({ ...res.data, already_generated: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to generate Z-Report');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls (hidden during print) */}
      <div className="no-print bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Daily Z-Report & End-of-Day Settlement</h2>
            <p className="text-xs text-slate-500">
              Audit lock, payment channel reconciliations, and thermal cash drawer slip
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-navy-900 hover:bg-navy-800 text-white rounded-xl shadow-md transition"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Print Receipt Slip</span>
          </button>
        </div>
      </div>

      {loading ? (
        <Loading text="Retrieving financial settlement data..." fullHeight />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Settlement Dashboard */}
          <div className="no-print lg:col-span-7 space-y-4">
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm space-y-6">
              {/* Status Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Closure Audit Status
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    {report?.already_generated ? (
                      <>
                        <Badge variant="success" size="lg">
                          <Lock className="w-3.5 h-3.5 mr-1" /> Locked & Settled
                        </Badge>
                        <span className="text-xs text-slate-500">
                          (Archived snapshot in z_reports)
                        </span>
                      </>
                    ) : (
                      <>
                        <Badge variant="warning" size="lg">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Open / Unsettled
                        </Badge>
                        <span className="text-xs text-slate-500">
                          (Live draft before end-of-day closure)
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {!report?.already_generated && (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-700/20 transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{generating ? 'Closing Day...' : 'Generate & Close Day'}</span>
                  </button>
                )}
              </div>

              {/* Key Figures Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Gross Register Sales
                  </span>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    ₹{(report?.gross_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {report?.total_bills || 0} valid bills
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                  <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
                    Net Settled Sales
                  </span>
                  <p className="text-2xl font-black text-emerald-900 mt-1">
                    ₹{(report?.net_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    (Gross minus Cancelled)
                  </span>
                </div>
              </div>

              {/* Payment Mode Reconciliations */}
              <div className="space-y-3 pt-2">
                <h4 className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                  Payment Mode Reconciliations
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700">Cash Register Inflow</span>
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{(report?.cash_sales || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700">UPI / QR Digital Transfers</span>
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{(report?.upi_sales || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700">POS Card Swipes / Terminal</span>
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{(report?.card_sales || 0).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-800">
                    <span className="font-semibold">Cancelled / Voided Receipts</span>
                    <span className="font-bold text-sm">
                      -₹{(report?.cancelled_sales || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Thermal Paper Receipt Preview */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-sm bg-white p-6 rounded-2xl shadow-xl border border-slate-200 font-mono text-slate-900 text-xs leading-relaxed">
              <div className="text-center pb-3 border-b-2 border-dashed border-slate-300">
                <img src="/logo.png" alt="PANDAS" className="h-10 mx-auto mb-1.5 object-contain" />
                <h2 className="text-base font-extrabold tracking-widest uppercase">PANDAS</h2>
                <p className="text-[11px] text-slate-800 font-bold">NUTS &amp; CHOCOLATES</p>
                <p className="text-[10px] text-slate-500">Near Bus Stop, Kottappuram</p>
                <p className="text-[10px] text-slate-500">Ph: +91-9847345005</p>
                <p className="text-[10px] text-slate-700 font-bold mt-1.5 uppercase">DAILY Z-REPORT SETTLEMENT</p>
              </div>

              <div className="py-3 border-b border-dashed border-slate-200 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>DATE:</span>
                  <span className="font-bold">{report?.report_date}</span>
                </div>
                <div className="flex justify-between">
                  <span>PRINTED:</span>
                  <span>{new Date().toLocaleTimeString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span className="font-bold">
                    {report?.already_generated ? 'LOCKED / ARCHIVED' : 'PREVIEW DRAFT'}
                  </span>
                </div>
              </div>

              <div className="py-3 border-b-2 border-dashed border-slate-300 space-y-1.5 text-[11px]">
                <div className="flex justify-between">
                  <span>TOTAL BILLS:</span>
                  <span className="font-bold">{report?.total_bills}</span>
                </div>
                <div className="flex justify-between">
                  <span>GROSS SALES:</span>
                  <span className="font-bold">₹{(report?.gross_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>  - CASH:</span>
                  <span>₹{(report?.cash_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>  - UPI:</span>
                  <span>₹{(report?.upi_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>  - CARD:</span>
                  <span>₹{(report?.card_sales || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>CANCELLED:</span>
                  <span>₹{(report?.cancelled_sales || 0).toFixed(2)}</span>
                </div>
              </div>

              <div className="py-3 flex justify-between text-sm font-extrabold border-b-2 border-dashed border-slate-300">
                <span>NET SALES:</span>
                <span>₹{(report?.net_sales || 0).toFixed(2)}</span>
              </div>

              <div className="text-center pt-4 text-[10px] text-slate-500 uppercase tracking-wider space-y-1">
                <p>--- END OF DAY CLOSED ---</p>
                <p>THANK YOU FOR SHOPPING</p>
              </div>

              <div className="no-print mt-6 pt-3 border-t border-slate-100 flex justify-center">
                <button
                  onClick={handlePrint}
                  className="w-full py-2 bg-slate-900 text-white rounded-xl font-bold text-xs hover:bg-slate-800 transition flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Print Slip</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
