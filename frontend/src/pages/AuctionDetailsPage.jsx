import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { rfqService, bidService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import StatusBadge from '../components/common/StatusBadge';
import CountdownTimer from '../components/common/CountdownTimer';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const fmtCurrency = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
const fmt = (d) => d ? format(new Date(d), 'dd MMM yy, HH:mm') : '—';

const RankBadge = ({ rank }) => {
  if (!rank) return null;
  const classes = rank === 1
    ? 'bg-gold-500 text-navy-950 shadow-lg shadow-gold-500/30'
    : rank === 2
    ? 'bg-white/20 text-white'
    : 'bg-white/8 text-white/60';
  return (
    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full font-mono font-bold text-sm ${classes}`}>
      L{rank}
    </span>
  );
};

const EventIcon = ({ type }) => {
  const icons = {
    bid_submitted: '',
    auction_extended: '',
    rank_changed: '',
    rfq_created: '',
    rfq_activated: '',
    rfq_closed: '',
    rfq_force_closed: '',
    supplier_invited: '',
  };
  return <span className="text-base">{icons[type] || '📌'}</span>;
};

const AuctionDetailsPage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const socket = useSocket();

  const [rfq, setRfq] = useState(null);
  const [bids, setBids] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('bids');
  const [bidForm, setBidForm] = useState({
    carrier_name: '', freight_charges: '', origin_charges: '0',
    destination_charges: '0', transit_time_days: '', quote_validity_date: '', notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [newBidFlash, setNewBidFlash] = useState(null);
  const activityRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [detailRes, activityRes] = await Promise.all([
        rfqService.getById(id),
        bidService.getActivity(id),
      ]);
      const data = detailRes.data.data;
      setRfq(data.rfq);
      setBids(data.bids || []);
      setLogs(activityRes.data.data.logs || []);
    } catch {
      toast.error('Failed to load auction details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);


  useEffect(() => {
    if (!socket || !id) return;
    socket.joinAuction(id);

    const onBidUpdate = ({ supplierId }) => {
      fetchData();
      if (supplierId !== user?.id) {
        toast('New bid submitted!', { icon: '💰' });
      }
      setNewBidFlash(supplierId);
      setTimeout(() => setNewBidFlash(null), 3000);
    };

    const onExtension = ({ newCloseTime }) => {
      fetchData();
      toast.success(`Auction extended to ${fmt(newCloseTime)}`, { duration: 5000 });
    };

    const onStatusChange = () => fetchData();

    socket.on('bid_submitted', onBidUpdate);
    socket.on('auction_extended', onExtension);
    socket.on('auction_status_changed', onStatusChange);

    return () => {
      socket.leaveAuction(id);
      socket.off('bid_submitted', onBidUpdate);
      socket.off('auction_extended', onExtension);
      socket.off('auction_status_changed', onStatusChange);
    };
  }, [socket, id, fetchData, user?.id]);

  const handleBidSubmit = async (e) => {
    e.preventDefault();
    if (!bidForm.carrier_name || !bidForm.freight_charges || !bidForm.transit_time_days || !bidForm.quote_validity_date) {
      toast.error('Please fill all required fields');
      return;
    }
    setSubmitting(true);
    try {
      const res = await bidService.submit(id, {
        ...bidForm,
        freight_charges: parseFloat(bidForm.freight_charges),
        origin_charges: parseFloat(bidForm.origin_charges || 0),
        destination_charges: parseFloat(bidForm.destination_charges || 0),
        transit_time_days: parseInt(bidForm.transit_time_days),
      });
      const { bid, extension } = res.data.data;
      const rank = bid.rank;
      toast.success(`Bid submitted! You are L${rank}${rank === 1 ? ' 🏆' : ''}`);
      if (extension?.extended) {
        toast(` Auction extended to ${fmt(extension.newCloseTime)}`, { icon: '⏱️', duration: 5000 });
      }
      setBidForm(f => ({ ...f, carrier_name: '', freight_charges: '', notes: '' }));
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bid submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const setF = (k) => (e) => setBidForm(f => ({ ...f, [k]: e.target.value }));

  const isActive = rfq?.status === 'active';
  const canBid = user?.role === 'supplier' && isActive;
  const totalPreview = (parseFloat(bidForm.freight_charges || 0) +
    parseFloat(bidForm.origin_charges || 0) +
    parseFloat(bidForm.destination_charges || 0));

  if (loading) return (
    <div className="pt-24 flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-gold-500/30 border-t-gold-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/40 text-sm">Loading auction…</p>
      </div>
    </div>
  );

  if (!rfq) return (
    <div className="pt-24 text-center py-20">
      <p className="text-white/40">Auction not found.</p>
      <Link to="/auctions" className="btn-secondary mt-4 inline-flex">← Back</Link>
    </div>
  );

  return (
    <div className="page">
      <div className="page-bg">
        <div className="page-bg-orb -top-56 -right-40 bg-emerald-500/10" />
        <div className="page-bg-orb -bottom-56 -left-40 bg-gold-500/10" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[72rem] h-[72rem] rounded-full border border-white/5" />
      </div>

      {/* Back */}
      <Link to="/auctions" className="inline-flex items-center gap-2 text-white/40 hover:text-white text-sm mt-6 mb-6 transition-colors">
        ← All Auctions
      </Link>

      {/* RFQ Header */}
      <div className="card p-6 mb-6 animate-slide-up relative overflow-hidden">
        {isActive && <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />}
        <div className="flex flex-wrap items-start gap-4 justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={rfq.status} />
              <span className="text-white/30 font-mono text-sm">{rfq.reference_id}</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-white mb-1">{rfq.name}</h1>
            <p className="text-white/40 text-sm">
              {rfq.origin && rfq.destination ? `${rfq.origin} → ${rfq.destination}` : rfq.description}
            </p>
          </div>
          {isActive && (
            <CountdownTimer targetDate={rfq.bid_close_time} label="Closes in" urgent />
          )}
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/8">
          {[
            { label: 'Bid Opens', value: fmt(rfq.bid_start_time) },
            { label: 'Bid Closes', value: fmt(rfq.bid_close_time) },
            { label: 'Force Close', value: fmt(rfq.forced_close_time) },
            { label: 'Service Date', value: rfq.pickup_service_date ? format(new Date(rfq.pickup_service_date), 'dd MMM yyyy') : '—' },
          ].map(item => (
            <div key={item.label}>
              <p className="text-white/30 text-xs uppercase tracking-wider">{item.label}</p>
              <p className="text-white/80 text-sm font-mono mt-1">{item.value}</p>
            </div>
          ))}
        </div>

        {/* Auction config */}
        <div className="mt-4 pt-4 border-t border-white/8 flex flex-wrap gap-6">
          <ConfigPill icon="⏱" label="Trigger Window" value={`${rfq.trigger_window_minutes} min`} />
          <ConfigPill icon="⚡" label="Extension" value={`+${rfq.extension_duration_minutes} min`} />
          <ConfigPill icon="🎯" label="Trigger Type" value={rfq.extension_trigger_type?.replace(/_/g, ' ')} />
          <ConfigPill icon="🔢" label="Extensions Used" value={`${rfq.extension_count || 0} / ${rfq.max_extensions || '∞'}`} />
        </div>
      </div>

      {/* Lowest bid highlight */}
      {bids.length > 0 && (
        <div className="card-glass p-5 mb-6 flex items-center gap-6 animate-slide-up stagger-1">
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider">Current L1 (Lowest Bid)</p>
            <p className="font-mono font-bold text-3xl text-gold-400 mt-1">{fmtCurrency(bids[0]?.total_price)}</p>
          </div>
          <div className="h-12 w-px bg-white/10" />
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider">By</p>
            <p className="text-white font-medium mt-1">{bids[0]?.supplier_company || bids[0]?.supplier_name}</p>
          </div>
          <div className="ml-auto">
            <p className="text-white/40 text-xs uppercase tracking-wider">Total Suppliers</p>
            <p className="text-white font-bold text-xl mt-1">{bids.length}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: Bid Table + Activity */}
        <div className="lg:col-span-2 space-y-4">

          {/* Tab selector */}
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'bids', label: `Bids (${bids.length})` },
              { key: 'activity', label: `Activity (${logs.length})` },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
                  tab === t.key
                    ? 'bg-gold-500 text-navy-950'
                    : 'bg-white/6 text-white/55 hover:text-white border border-white/10'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Bids Table */}
          {tab === 'bids' && (
            <div className="card overflow-hidden animate-slide-up">
              {bids.length === 0 ? (
                <div className="p-10 text-center text-white/30">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-xl mb-4">
                    📭
                  </div>
                  <p>No bids yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/8 bg-white/[0.02]">
                        <th className="text-left px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Rank</th>
                        <th className="text-left px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Supplier</th>
                        <th className="text-left px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Carrier</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Freight</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Origin</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Dest.</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Total</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Transit</th>
                        <th className="text-right px-4 py-3 text-white/40 text-xs uppercase tracking-wider font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bids.map((bid, i) => {
                        const isFlashing = newBidFlash === bid.supplier_id;
                        const isOwnBid = bid.supplier_id === user?.id;
                        return (
                          <tr
                            key={bid.id}
                            className={`border-b border-white/5 transition-all duration-500 ${
                              isFlashing ? 'bg-gold-500/10' :
                              bid.rank === 1 ? 'bg-gold-500/5' :
                              isOwnBid ? 'bg-white/3' : ''
                            } hover:bg-white/5`}
                          >
                            <td className="px-4 py-3.5"><RankBadge rank={bid.rank} /></td>
                            <td className="px-4 py-3.5">
                              <div>
                                <p className="text-white text-sm font-medium">{bid.supplier_company || bid.supplier_name}</p>
                                {isOwnBid && <span className="text-gold-500/70 text-xs">You</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-white/60 text-sm">{bid.carrier_name}</td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-white/70">{fmtCurrency(bid.freight_charges)}</td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-white/70">{fmtCurrency(bid.origin_charges)}</td>
                            <td className="px-4 py-3.5 text-right font-mono text-sm text-white/70">{fmtCurrency(bid.destination_charges)}</td>
                            <td className="px-4 py-3.5 text-right font-mono font-bold text-sm text-white">{fmtCurrency(bid.total_price)}</td>
                            <td className="px-4 py-3.5 text-right text-white/60 text-sm">{bid.transit_time_days}d</td>
                            <td className="px-4 py-3.5 text-right text-white/30 text-xs font-mono">{fmt(bid.submitted_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Activity Log */}
          {tab === 'activity' && (
            <div className="card p-4 animate-slide-up" ref={activityRef}>
              {logs.length === 0 ? (
                <div className="text-center text-white/30 py-8">No activity yet</div>
              ) : (
                <div className="space-y-1">
                  {logs.map((log, i) => (
                    <div
                      key={log.id}
                      className={`flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/5 ${
                        log.event_type === 'auction_extended' ? 'bg-gold-500/5 border border-gold-500/15' : ''
                      }`}
                    >
                      <EventIcon type={log.event_type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white/80 text-sm">{log.description}</p>
                        {log.metadata?.reason && (
                          <p className="text-white/30 text-xs mt-0.5">Reason: {log.metadata.reason}</p>
                        )}
                      </div>
                      <p className="text-white/25 text-xs font-mono whitespace-nowrap">{fmt(log.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Bid submission form */}
        {canBid && (
          <div className="lg:col-span-1">
            <div className="card p-5 sticky top-24 animate-slide-up stagger-2">
              <h3 className="font-display font-bold text-white text-lg mb-4">Submit Your Bid</h3>

              <form onSubmit={handleBidSubmit} className="space-y-3">
                <div>
                  <label className="label">Carrier Name *</label>
                  <input className="input-field" placeholder="e.g. DHL, FedEx" value={bidForm.carrier_name} onChange={setF('carrier_name')} required />
                </div>

                <div>
                  <label className="label">Freight Charges (₹) *</label>
                  <input className="input-field font-mono" type="number" min="0" step="0.01" placeholder="0.00"
                    value={bidForm.freight_charges} onChange={setF('freight_charges')} required />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Origin (₹)</label>
                    <input className="input-field font-mono" type="number" min="0" step="0.01" placeholder="0.00"
                      value={bidForm.origin_charges} onChange={setF('origin_charges')} />
                  </div>
                  <div>
                    <label className="label">Destination (₹)</label>
                    <input className="input-field font-mono" type="number" min="0" step="0.01" placeholder="0.00"
                      value={bidForm.destination_charges} onChange={setF('destination_charges')} />
                  </div>
                </div>

                <div>
                  <label className="label">Transit Time (days) *</label>
                  <input className="input-field" type="number" min="1" placeholder="e.g. 3"
                    value={bidForm.transit_time_days} onChange={setF('transit_time_days')} required />
                </div>

                <div>
                  <label className="label">Quote Valid Until *</label>
                  <input className="input-field" type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={bidForm.quote_validity_date} onChange={setF('quote_validity_date')} required />
                </div>

                <div>
                  <label className="label">Notes</label>
                  <textarea className="input-field resize-none" rows={2} placeholder="Optional remarks…"
                    value={bidForm.notes} onChange={setF('notes')} />
                </div>

                {/* Total preview */}
                {totalPreview > 0 && (
                  <div className="bg-gold-500/10 border border-gold-500/20 rounded-xl p-3">
                    <p className="text-white/50 text-xs uppercase tracking-wider">Total Bid</p>
                    <p className="font-mono font-bold text-gold-400 text-xl mt-0.5">{fmtCurrency(totalPreview)}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {submitting
                    ? <><span className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />Submitting…</>
                    : '⚡ Submit Bid'
                  }
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Show message for non-supplier or inactive */}
        {!canBid && user?.role === 'supplier' && (
          <div className="lg:col-span-1">
            <div className="card p-5 text-center text-white/40">
              <p className="text-3xl mb-2">🔒</p>
              <p className="text-sm">Bidding is {rfq.status === 'active' ? 'open' : 'closed'}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ConfigPill = ({ icon, label, value }) => (
  <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
    <span>{icon}</span>
    <div>
      <p className="text-white/30 text-xs">{label}</p>
      <p className="text-white text-sm font-medium capitalize">{value}</p>
    </div>
  </div>
);

export default AuctionDetailsPage;
