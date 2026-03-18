import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { rfqService } from '../services/api';
import toast from 'react-hot-toast';

const TRIGGER_TYPES = [
  { value: 'bid_received', label: 'Any Bid Received', desc: 'Extend whenever a bid lands in the trigger window' },
  { value: 'any_rank_change', label: 'Any Rank Change', desc: 'Extend when any supplier changes rank position' },
  { value: 'l1_rank_change', label: 'L1 Rank Change Only', desc: 'Extend only when the lowest bidder changes' },
];

const Field = ({ label, required, hint, children }) => (
  <div>
    <label className="label">{label}{required && <span className="text-gold-500 ml-1">*</span>}</label>
    {children}
    {hint && <p className="text-white/25 text-xs mt-1.5">{hint}</p>}
  </div>
);

const CreateRFQPage = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    origin: '',
    destination: '',
    cargo_description: '',
    bid_start_time: '',
    bid_close_time: '',
    forced_close_time: '',
    pickup_service_date: '',
    trigger_window_minutes: 10,
    extension_duration_minutes: 5,
    extension_trigger_type: 'bid_received',
    max_extensions: 10,
  });

  useEffect(() => {
    rfqService.getSuppliers()
      .then(res => setSuppliers(res.data.data.suppliers))
      .catch(() => {});
  }, []);

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const toggleSupplier = (id) => {
    setSelectedSuppliers(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const validate = () => {
    if (!form.name || !form.bid_start_time || !form.bid_close_time || !form.forced_close_time || !form.pickup_service_date) {
      toast.error('Please fill all required fields');
      return false;
    }
    if (new Date(form.bid_close_time) <= new Date(form.bid_start_time)) {
      toast.error('Bid close time must be after bid start time');
      return false;
    }
    if (new Date(form.forced_close_time) <= new Date(form.bid_close_time)) {
      toast.error('Forced close time must be later than bid close time');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e, activate = false) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await rfqService.create({
        ...form,
        trigger_window_minutes: Number(form.trigger_window_minutes),
        extension_duration_minutes: Number(form.extension_duration_minutes),
        max_extensions: Number(form.max_extensions),
        supplier_ids: selectedSuppliers,
      });
      const rfqId = res.data.data.rfq.id;
      toast.success('RFQ created successfully!');

      if (activate) {
        await rfqService.activate(rfqId);
        toast.success('Auction activated!');
      }
      navigate(`/auctions/${rfqId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create RFQ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-20 pb-16 min-h-screen px-4 max-w-4xl mx-auto relative">
      <div className="page-bg">
        <div className="page-bg-orb -top-56 -right-40 bg-gold-500/10" />
        <div className="page-bg-orb -bottom-56 -left-40 bg-blue-500/10" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[64rem] h-[64rem] rounded-full border border-white/5" />
      </div>
      <div className="mt-6 mb-8 animate-slide-up">
        <button onClick={() => navigate('/auctions')} className="text-white/40 hover:text-white text-sm mb-4 transition-colors">
          ← Back to Auctions
        </button>
        <h1 className="font-display text-3xl font-bold text-white">Create New RFQ</h1>
        <p className="text-white/40 mt-1.5">Configure your procurement auction</p>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)}>
        <div className="space-y-6 relative">

          {/*RFQ Info  */}
          <Section title="RFQ Information" icon="📋">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Field label="RFQ Name" required>
                  <input className="input-field" placeholder="e.g. Q1 2025 Freight Procurement" value={form.name} onChange={setF('name')} required />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Description">
                  <textarea className="input-field resize-none" rows={2} placeholder="Brief description of the procurement need…" value={form.description} onChange={setF('description')} />
                </Field>
              </div>
              <Field label="Origin">
                <input className="input-field" placeholder="e.g. Mumbai Port" value={form.origin} onChange={setF('origin')} />
              </Field>
              <Field label="Destination">
                <input className="input-field" placeholder="e.g. Delhi Warehouse" value={form.destination} onChange={setF('destination')} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Cargo Description">
                  <input className="input-field" placeholder="e.g. 20 MT Machinery Parts" value={form.cargo_description} onChange={setF('cargo_description')} />
                </Field>
              </div>
            </div>
          </Section>

          {/*  Dates */}
          <Section title="Auction Schedule" icon="📅">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Bid Opens At" required>
                <input className="input-field" type="datetime-local" value={form.bid_start_time} onChange={setF('bid_start_time')} required />
              </Field>
              <Field label="Bid Closes At" required hint="Auction will close at this time unless extended">
                <input className="input-field" type="datetime-local" value={form.bid_close_time} onChange={setF('bid_close_time')} required />
              </Field>
              <Field label="Forced Close Time" required hint="Absolute deadline — auction cannot extend beyond this">
                <input className="input-field" type="datetime-local" value={form.forced_close_time} onChange={setF('forced_close_time')} required />
              </Field>
              <Field label="Pickup / Service Date" required>
                <input className="input-field" type="date" value={form.pickup_service_date} onChange={setF('pickup_service_date')} required />
              </Field>
            </div>

            {/* Visual validation hint */}
            {form.bid_close_time && form.forced_close_time && (
              <div className={`mt-3 p-3 rounded-xl text-sm flex items-center gap-2 ${
                new Date(form.forced_close_time) > new Date(form.bid_close_time)
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                {new Date(form.forced_close_time) > new Date(form.bid_close_time)
                  ? '✓ Forced close time is valid'
                  : '✗ Forced close time must be later than bid close time'
                }
              </div>
            )}
          </Section>

          {/* Auction Config */}
          <Section title="Extension Configuration" icon="⚙️">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <Field label="Trigger Window (min)" required hint="Monitor bids in last X minutes before close">
                <input className="input-field font-mono" type="number" min="1" max="60" value={form.trigger_window_minutes} onChange={setF('trigger_window_minutes')} required />
              </Field>
              <Field label="Extension Duration (min)" required hint="Extend auction by Y minutes when triggered">
                <input className="input-field font-mono" type="number" min="1" max="120" value={form.extension_duration_minutes} onChange={setF('extension_duration_minutes')} required />
              </Field>
              <Field label="Max Extensions">
                <input className="input-field font-mono" type="number" min="0" value={form.max_extensions} onChange={setF('max_extensions')} />
              </Field>
            </div>

            <div>
              <label className="label">Extension Trigger Type <span className="text-gold-500">*</span></label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TRIGGER_TYPES.map(t => (
                  <label
                    key={t.value}
                    className={`cursor-pointer p-4 rounded-xl border transition-all ${
                      form.extension_trigger_type === t.value
                        ? 'border-gold-500/60 bg-gold-500/10'
                        : 'border-white/10 bg-white/3 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="trigger_type"
                      value={t.value}
                      checked={form.extension_trigger_type === t.value}
                      onChange={setF('extension_trigger_type')}
                      className="hidden"
                    />
                    <div className="flex items-start gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${
                        form.extension_trigger_type === t.value ? 'border-gold-500 bg-gold-500' : 'border-white/30'
                      }`} />
                      <div>
                        <p className="text-white text-sm font-medium">{t.label}</p>
                        <p className="text-white/40 text-xs mt-0.5">{t.desc}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Algorithm explanation */}
            <div className="mt-4 p-4 bg-navy-800/50 border border-white/8 rounded-xl">
              <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-2">How it works</p>
              <p className="text-white/40 text-sm leading-relaxed">
                When a bid is submitted in the last <span className="text-gold-400 font-mono">{form.trigger_window_minutes} min</span> before close
                and the trigger condition is met, the auction extends by <span className="text-gold-400 font-mono">{form.extension_duration_minutes} min</span>,
                but never beyond the forced close time.
              </p>
            </div>
          </Section>

          {/* Invite Suppliers */}
          {suppliers.length > 0 && (
            <Section title="Invite Suppliers" icon="👥">
              <p className="text-white/40 text-sm mb-4">Select suppliers to invite (leave empty for open bidding)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suppliers.map(s => (
                  <label
                    key={s.id}
                    className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      selectedSuppliers.includes(s.id)
                        ? 'border-gold-500/40 bg-gold-500/8'
                        : 'border-white/8 hover:border-white/20 bg-white/3'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSuppliers.includes(s.id)}
                      onChange={() => toggleSupplier(s.id)}
                      className="hidden"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedSuppliers.includes(s.id) ? 'border-gold-500 bg-gold-500' : 'border-white/30'
                    }`}>
                      {selectedSuppliers.includes(s.id) && (
                        <svg className="w-3 h-3 text-navy-950" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{s.company_name || s.name}</p>
                      <p className="text-white/30 text-xs">{s.email}</p>
                    </div>
                  </label>
                ))}
              </div>
              {selectedSuppliers.length > 0 && (
                <p className="text-gold-400/70 text-xs mt-2">{selectedSuppliers.length} supplier(s) selected</p>
              )}
            </Section>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="btn-secondary flex items-center gap-2"
            >
              {loading ? 'Saving…' : 'Save as Draft'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={(e) => handleSubmit(e, true)}
              className="btn-primary flex items-center gap-2"
            >
              {loading
                ? <><span className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />Creating…</>
                : '🚀 Create & Activate'
              }
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

const Section = ({ title, icon, children }) => (
  <div className="card p-6 animate-slide-up">
    <h2 className="font-display font-semibold text-white text-lg mb-5 flex items-center gap-2">
      <span>{icon}</span> {title}
    </h2>
    {children}
  </div>
);

export default CreateRFQPage;
