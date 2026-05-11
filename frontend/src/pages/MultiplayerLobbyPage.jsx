import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import '../styles/multiplayer.css';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001';

export default function MultiplayerLobbyPage() {
  const { token } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('create'); // create | join | browse
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [topic, setTopic] = useState('');
  const [maxTeamSize, setMaxTeamSize] = useState(3);
  const [maxRounds, setMaxRounds] = useState(6);
  const [turnTimer, setTurnTimer] = useState(120);
  const [creating, setCreating] = useState(false);

  // Join form
  const [roomCode, setRoomCode] = useState('');
  const [joining, setJoining] = useState(false);

  /* ── Fetch rooms when browsing ── */
  useEffect(() => {
    if (tab === 'browse') {
      setLoading(true);
      axios
        .get('/api/rooms', {
          baseURL: API,
          headers: { Authorization: `Bearer ${token}` },
        })
        .then((res) => setRooms(res.data.rooms || []))
        .catch(() => setError('Failed to load rooms.'))
        .finally(() => setLoading(false));
    }
  }, [tab, token]);

  /* ── Create room ── */
  const handleCreate = async () => {
    if (!topic.trim() || topic.trim().length < 5) {
      setError('Topic must be at least 5 characters.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await axios.post(
        '/api/rooms',
        { topic: topic.trim(), maxTeamSize, maxRounds, turnTimerSecs: turnTimer },
        { baseURL: API, headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create room.');
    } finally {
      setCreating(false);
    }
  };

  /* ── Join room ── */
  const handleJoin = async () => {
    if (!roomCode.trim()) {
      setError('Enter a room code.');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await axios.post(
        '/api/rooms/join',
        { roomCode: roomCode.trim().toUpperCase() },
        { baseURL: API, headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${res.data.roomId}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not join room.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mp-lobby">
      <header className="mp-lobby-header">
        <h1 className="premium-title">⚔️ Multiplayer Arena</h1>
        <p className="premium-subtitle">Compete with friends in real-time with AI-powered judicial oversight</p>
        <div className="back-link-wrap">
          <Link to="/lobby" className="glass-back-link">
            ← Return to Solo Mode
          </Link>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="mp-tabs-glass">
        <button 
          className={`mp-tab-btn ${tab === 'create' ? 'active' : ''}`} 
          onClick={() => { setTab('create'); setError(''); }}
        >
          ✨ Create Room
        </button>
        <button 
          className={`mp-tab-btn ${tab === 'join' ? 'active' : ''}`} 
          onClick={() => { setTab('join'); setError(''); }}
        >
          🔑 Join Room
        </button>
        <button 
          className={`mp-tab-btn ${tab === 'browse' ? 'active' : ''}`} 
          onClick={() => { setTab('browse'); setError(''); }}
        >
          📋 Public Rooms
        </button>
      </div>

      <div className="mp-content-card">
        {/* ── Create ── */}
        {tab === 'create' && (
          <div className="mp-create-form-wrap animate-fade">
            <div className="mp-field">
              <label>Debate Topic</label>
              <textarea
                className="glass-input"
                rows={3}
                placeholder="e.g. 'Universal Basic Income is necessary in the age of AI'"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={200}
              />
            </div>

            <div className="mp-field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="mp-field">
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Team Size</label>
                <select className="glass-select" value={maxTeamSize} onChange={(e) => setMaxTeamSize(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} per side</option>
                  ))}
                </select>
              </div>

              <div className="mp-field">
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Rounds</label>
                <select className="glass-select" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>
                  {[2, 4, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>{n} rounds</option>
                  ))}
                </select>
              </div>

              <div className="mp-field">
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Turn Timer</label>
                <select className="glass-select" value={turnTimer} onChange={(e) => setTurnTimer(Number(e.target.value))}>
                  {[30, 60, 90, 120, 180, 300].map((s) => (
                    <option key={s} value={s}>{s >= 60 ? `${s / 60}m` : `${s}s`}</option>
                  ))}
                </select>
              </div>
            </div>

            <button className="premium-btn mp-main-btn" onClick={handleCreate} disabled={creating || !topic.trim()} style={{ marginTop: '2rem' }}>
              {creating ? 'Opening Portal...' : 'Initialize War Room 🚀'}
            </button>
          </div>
        )}

        {/* ── Join ── */}
        {tab === 'join' && (
          <div className="mp-join-form-wrap animate-fade" style={{ textAlign: 'center' }}>
            <p className="field-hint">Enter the 6-character room code shared by your host</p>
            <div className="code-input-container">
              <input
                className="glass-code-input"
                type="text"
                maxLength={6}
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                style={{ display: 'block', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'var(--text-primary)', fontFamily: 'Outfit', fontSize: '2.5rem', textAlign: 'center', letterSpacing: '8px', textTransform: 'uppercase', maxWidth: '350px', margin: '1.5rem auto' }}
              />
            </div>
            <button className="premium-btn mp-main-btn" onClick={handleJoin} disabled={joining || roomCode.length < 6}>
              {joining ? 'Connecting...' : 'Secure Join →'}
            </button>
          </div>
        )}

        {/* ── Browse ── */}
        {tab === 'browse' && (
          <div className="mp-room-list animate-fade">
            {loading ? (
              <div className="loader-wrap" style={{ textAlign: 'center', padding: '2rem' }}><div className="mp-loader" /></div>
            ) : rooms.length === 0 ? (
              <p className="no-data" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No active rooms found. Start a new debate!</p>
            ) : (
              rooms.map((room) => (
                <div
                  key={room._id}
                  className="mp-glass-card"
                  onClick={() => navigate(`/room/${room._id}`)}
                >
                  <div className="mp-card-info">
                    <div className="mp-card-topic" style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.3rem' }}>{room.topic}</div>
                    <div className="mp-card-meta" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <span className="meta-item">👥 {(room.teamFor?.length || 0) + (room.teamAgainst?.length || 0)}/{(room.maxTeamSize || 3) * 2}</span>
                      <span className="meta-item" style={{marginLeft: '12px'}}>👀 {room.audience?.length || 0}</span>
                    </div>
                  </div>
                  <div className="mp-card-right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <span className={`mp-status-glow status-${room.status}`} style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                      {room.status === 'waiting' ? 'Open' : 'Live'}
                    </span>
                    <span className="mp-card-code" style={{ color: '#00aaff', fontFamily: 'Outfit', fontWeight: 800, letterSpacing: '1px' }}>{room.roomCode}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {error && <div className="mp-error-glow" style={{ color: '#ff3366', textAlign: 'center', marginTop: '1rem', fontWeight: 700, background: 'rgba(255, 51, 102, 0.1)', padding: '1rem', borderRadius: '12px' }}>{error}</div>}
    </div>
  );
}
