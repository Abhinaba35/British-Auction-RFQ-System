import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinks = user?.role === 'buyer'
    ? [
        { label: 'Auctions', path: '/auctions' },
        { label: 'Create RFQ', path: '/rfq/create' },
      ]
    : [
        { label: 'My Auctions', path: '/auctions' },
      ];

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-navy-950/90 backdrop-blur-md border-b border-white/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link to="/auctions" className="flex items-center gap-3 group">
          <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center shadow-lg shadow-gold-500/30">
            <span className="text-navy-950 font-bold text-sm">BA</span>
          </div>
          <div className="hidden sm:block">
            <span className="font-display font-bold text-white text-lg leading-none">BritishAuction</span>
            <span className="text-gold-500 text-xs font-mono block leading-none">RFQ System</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive(link.path)
                  ? 'bg-gold-500/15 text-gold-400'
                  : 'text-white/60 hover:text-white hover:bg-white/8'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-white text-sm font-medium leading-none">{user?.name}</span>
            <span className="text-white/40 text-xs capitalize mt-0.5">{user?.role} · {user?.company_name}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gold-500/20 border border-gold-500/30 flex items-center justify-center">
            <span className="text-gold-400 font-semibold text-sm">{user?.name?.[0]?.toUpperCase()}</span>
          </div>
          <button
            onClick={handleLogout}
            className="btn-ghost text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
