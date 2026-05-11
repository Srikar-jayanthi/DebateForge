import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/navbar.css';

export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Hide Navbar on Landing, Login, Register, and other auth pages
  const hidePaths = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/verify-email-otp'];
  const shouldHide = hidePaths.some(p => location.pathname === p || location.pathname.startsWith('/reset-password/'));

  if (shouldHide || !user) return null;

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navLinks = [
    { name: 'Lobby', path: '/lobby', icon: '⚔️' },
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'Leaderboard', path: '/leaderboard', icon: '🏆' },
    { name: 'History', path: '/history', icon: '📜' },
  ];

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/dashboard" className="nav-logo">
          <span className="nav-logo-icon">⚔</span>
          <span className="nav-logo-text">DebateForge</span>
        </Link>

        <div className="nav-links">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`nav-link ${location.pathname === link.path ? 'nav-link--active' : ''}`}
            >
              <span className="nav-link-icon">{link.icon}</span>
              <span className="nav-link-text">{link.name}</span>
            </Link>
          ))}
        </div>

        <div className="nav-actions">
          <Link to="/profile" className="nav-profile">
            <div className="nav-avatar">
              {user.profilePicUrl ? (
                <img 
                  src={`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001'}${user.profilePicUrl}`} 
                  alt="Avatar" 
                  crossOrigin="anonymous"
                />
              ) : (
                user.username?.[0]?.toUpperCase() ?? '?'
              )}
            </div>
            <div className="nav-user-info">
              <span className="nav-username">{user.username}</span>
              <span className="nav-elo">{user.eloRating ?? 1000} ELO</span>
            </div>
          </Link>
          <button className="nav-logout-btn" onClick={handleLogout} title="Log Out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
