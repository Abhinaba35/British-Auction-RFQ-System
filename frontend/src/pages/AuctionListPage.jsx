import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { rfqService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/common/StatusBadge';
import CountdownTimer from '../components/common/CountdownTimer';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

const AuctionListPage = () => {
  const { user } = useAuth();
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [activating, setActivating] = useState(null);

  const fetchAuctions = useCallback(async () => {
    try {
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await rfqService.getAll(params);
      setAuctions(res.data.data.auctions);
    } catch {
      toast.error('Failed to load auctions');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchAuctions(); }, [fetchAuctions]);

  const handleActivate = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setActivating(id);
    try {
      await rfqService.activate(id);
      toast.success('Auction activated!');
      fetchAuctions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to activate');
    } finally {
      setActivating(null);
    }
  };

  const filters = ['all', 'active', 'draft', 'closed', 'force_closed'];
  const fmt = (d) => d ? format(new Date(d), 'dd MMM yyyy, HH:mm') : '—';
  const fmtCurrency = (v) => v ? `₹${Number(v).toLocaleString('en-IN')}` : '—';

  const displayStatus = (a) => a.computed_status || a.status;

  return (
    <div className="page">
      <div className="page-bg">
        <div className="page-bg-orb -top-56 -right-40 bg-gold-500/10" />
        <div className="page-bg-orb -bottom-56 -left-40 bg-navy-700/40" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[72rem] h-[72rem] rounded-full border border-white/5" />
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8 mt-6 animate-slide-up relative">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">
            {user?.role === 'buyer' ? 'My RFQ Auctions' : 'Open Auctions'}
          </h1>
          <p className="text-white/40 mt-1.5">
            {user?.role === 'buyer' ? 'Manage your procurement auctions' : 'Find and bid on available tenders'}
          </p>
        </div>
        {user?.role === 'buyer' && (
          <Link to="/rfq/create" className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <span className="text-lg leading-none">+</span>
            New RFQ
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 flex-wrap animate-slide-up stagger-1 relative">
        {filters.map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setLoading(true); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-all duration-200 ${
              filter === f
                ? 'bg-gold-500 text-navy-950'
                : 'bg-white/6 text-white/55 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Auctions Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse h-52">
              <div className="h-4 bg-white/8 rounded w-2/3 mb-3" />
              <div className="h-3 bg-white/5 rounded w-1/2 mb-6" />
              <div className="h-8 bg-white/5 rounded w-1/3 mb-3" />
              <div className="h-3 bg-white/5 rounded w-full" />
            </div>
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="text-center py-24 animate-slide-up relative">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-5">
          </div>
          <h3 className="font-display text-xl text-white/70 mb-2">No auctions found</h3>
          <p className="text-white/30 text-sm mb-6">
            {user?.role === 'buyer' ? 'Create your first RFQ to get started.' : 'No auctions available yet.'}
          </p>
          {user?.role === 'buyer' && (
            <Link to="/rfq/create" className="btn-primary inline-flex">Create RFQ</Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative">
          {auctions.map((auction, idx) => {
            const status = displayStatus(auction);
            const isActive = status === 'active';

            return (
              <Link
                key={auction.id}
                to={`/auctions/${auction.id}`}
                className={`card p-6 hover:border-white/20 hover:bg-navy-900/85 transition-all duration-300 cursor-pointer group animate-slide-up relative overflow-hidden`}
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                {/* Live glow */}
                {isActive && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                )}

                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-display font-semibold text-white text-lg leading-tight truncate group-hover:text-gold-400 transition-colors">
                      {auction.name}
                    </h3>
                    <p className="text-white/30 text-xs font-mono mt-0.5">{auction.reference_id}</p>
                  </div>
                  <StatusBadge status={status} />
                </div>

                {/* Lowest bid */}
                <div className="mb-4">
                  <p className="text-white/30 text-xs uppercase tracking-wider">Lowest Bid</p>
                  <p className={`font-mono font-bold text-2xl mt-0.5 ${auction.lowest_bid ? 'text-gold-400' : 'text-white/20'}`}>
                    {fmtCurrency(auction.lowest_bid)}
                  </p>
                  {auction.bid_count > 0 && (
                    <p className="text-white/30 text-xs mt-0.5">{auction.bid_count} supplier{auction.bid_count !== 1 ? 's' : ''} bidding</p>
                  )}
                </div>

                {/* Countdown or close time */}
                {isActive ? (
                  <CountdownTimer targetDate={auction.bid_close_time} label="Closes in" />
                ) : (
                  <div>
                    <p className="text-white/30 text-xs uppercase tracking-wider mb-1">Closed at</p>
                    <p className="text-white/60 text-sm font-mono">{fmt(auction.bid_close_time)}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 pt-4 border-t border-white/8 flex items-center justify-between">
                  <div>
                    <p className="text-white/25 text-xs">Forced close</p>
                    <p className="text-white/40 text-xs font-mono mt-0.5">{fmt(auction.forced_close_time)}</p>
                  </div>
                  {user?.role === 'buyer' && auction.status === 'draft' && (
                    <button
                      onClick={(e) => handleActivate(e, auction.id)}
                      disabled={activating === auction.id}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      {activating === auction.id ? 'Activating…' : 'Activate →'}
                    </button>
                  )}
                  {user?.role === 'supplier' && isActive && (
                    <span className="text-gold-400 text-xs font-medium">Bid now →</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuctionListPage;
