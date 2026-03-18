import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import ProtectedRoute from './components/common/ProtectedRoute';
import Navbar from './components/layout/Navbar';

import LoginPage from './pages/LoginPage';
import AuctionListPage from './pages/AuctionListPage';
import AuctionDetailsPage from './pages/AuctionDetailsPage';
import CreateRFQPage from './pages/CreateRFQPage';

const AppLayout = ({ children }) => (
  <>
    <Navbar />
    {children}
  </>
);

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SocketProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1e2459',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '12px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
              },
              success: { iconTheme: { primary: '#f59e0b', secondary: '#070a1e' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#070a1e' } },
            }}
          />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<Navigate to="/auctions" replace />} />

            <Route path="/auctions" element={
              <ProtectedRoute>
                <AppLayout><AuctionListPage /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/auctions/:id" element={
              <ProtectedRoute>
                <AppLayout><AuctionDetailsPage /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="/rfq/create" element={
              <ProtectedRoute requiredRole="buyer">
                <AppLayout><CreateRFQPage /></AppLayout>
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/auctions" replace />} />
          </Routes>
        </SocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
