import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const LoginPage = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    role: 'supplier', company_name: ''
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form);
      }
      navigate('/auctions');
      toast.success(mode === 'login' ? 'Welcome back!' : 'Account created!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-gold-500/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-navy-700/30 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-white/3" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-white/2" />
      </div>

      <div className="w-full max-w-md animate-slide-up relative z-10">
        {/* Brand */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-gold-500 rounded-2xl shadow-2xl shadow-gold-500/30 mb-4">
            <span className="text-navy-950 font-bold text-2xl font-display">B</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-white">BritishAuction</h1>
          <p className="text-gold-500 font-mono text-sm mt-1 tracking-wider">RFQ SYSTEM</p>
          <p className="text-white/40 text-sm mt-3">Competitive procurement, simplified</p>
        </div>

        {/* Tab toggle */}
        <div className="flex bg-navy-900/70 rounded-xl p-1 mb-6 border border-white/10 backdrop-blur-sm shadow-[0_18px_60px_-30px_rgba(0,0,0,0.85)]">
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 capitalize ${
                mode === m
                  ? 'bg-gold-500 text-navy-950 shadow-lg shadow-gold-500/20'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="label">Full Name</label>
                <input className="input-field" placeholder="Your full name" value={form.name} onChange={set('name')} required />
              </div>
              <div>
                <label className="label">Company Name</label>
                <input className="input-field" placeholder="Company or organisation" value={form.company_name} onChange={set('company_name')} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input-field" value={form.role} onChange={set('role')}>
                  <option value="supplier">Supplier — Submit bids</option>
                  <option value="buyer">Buyer — Create RFQs</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="label">Email</label>
            <input className="input-field" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
          </div>

          <div>
            <label className="label">Password</label>
            <input className="input-field" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><span className="w-4 h-4 border-2 border-navy-950/30 border-t-navy-950 rounded-full animate-spin" />Processing…</>
            ) : (
              mode === 'login' ? 'Sign in →' : 'Create Account →'
            )}
          </button>

         
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
