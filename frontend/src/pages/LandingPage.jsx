import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

const FEATURES = [
  { icon: '🎙️', title: 'Real-Time Voice Analysis', desc: 'Debate naturally. Our system transcribes and analyzes your speech patterns, cadence, and tone live.' },
  { icon: '🎯', title: 'Fallacy Detection', desc: 'Identify Slippery Slopes and Strawman arguments as you make them. Perfect your logic in real-time.' },
  { icon: '🧠', title: 'Neural Memory', desc: 'The AI doesn\'t just respond; it remembers. It tracks your contradictions across rounds to force consistency.' },
  { icon: '📈', title: 'Elo Progression', desc: 'Climb the global ranks. Our scoring engine uses competitive debate standards to rate your performance.' },
  { icon: '🏆', title: 'Tournament Mode', desc: 'Join structured competitions, follow Oxford Union rules, and earn your spot on the leaderboard.' },
  { icon: '⚡', title: 'Instant Rebuttal', desc: 'Powered by Groq speed, our AI generates researched, evidence-backed rebuttals in milliseconds.' },
];

const STATS = [
  { value: '10K+', label: 'Active Debaters' },
  { value: '250K+', label: 'Debates Completed' },
  { value: '98%', label: 'Improved Win Rate' },
  { value: '40+', label: 'Debate Formats' },
];

const TESTIMONIALS = [
  { quote: '"The fallacy graphs were brutal—and exactly what I needed before my national qualifiers. It\'s like having a world-class coach in my pocket."', author: 'Maya', role: 'State Debate Champion', avatar: 'M' },
  { quote: '"Feels less like an app and more like sparring with a rival who has read every bad habit I have. My logic has never been tighter."', author: 'Andre', role: 'Law Student', avatar: 'A' },
  { quote: '"We use DebateForge for team practice now. The AI moderation in multiplayer rooms is a game changer for keeping rounds focused."', author: 'Lina', role: 'University Society Lead', avatar: 'L' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const pageRef = useRef(null);
  const canvasRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  /* ── Particle canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.5 + 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.6 ? '#00ff87' : Math.random() > 0.5 ? '#00aaff' : '#ff3366',
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  /* ── Scroll reveal (for sections BELOW the fold) ── */
  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('.landing-reveal');
    if (!els?.length) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* ── Mouse parallax on hero orb ── */
  useEffect(() => {
    const handler = (e) => setMousePos({ x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);

  return (
    <div className="lp-page" ref={pageRef}>
      {/* Particle canvas background */}
      <canvas ref={canvasRef} className="lp-canvas" />

      {/* ── NAVBAR ── */}
      <nav className="lp-nav">
        <div className="lp-nav-logo">
          <span className="lp-nav-logo-icon">⚔</span>
          <span className="lp-nav-logo-text">DebateForge</span>
        </div>
        <div className="lp-nav-links">
          <a href="#how" className="lp-nav-link">How It Works</a>
          <a href="#features" className="lp-nav-link">Features</a>
          <a href="#social" className="lp-nav-link">Community</a>
        </div>
        <div className="lp-nav-actions">
          <button className="lp-nav-signin" onClick={() => navigate('/login')}>Sign In</button>
          <button className="lp-nav-cta" onClick={() => navigate('/register')}>Get Started</button>
        </div>
      </nav>

      {/* ══════════ HERO ══════════ */}
      <section className="lp-hero" id="top">
        <div className="lp-hero-content">
          <div className="lp-hero-badge lp-anim-1">
            <span className="lp-hero-badge-dot" />
            Next-Gen AI Debate Engine
          </div>

          <h1 className="lp-hero-title lp-anim-2">
            Debate Smarter.
            <br />
            <span className="lp-hero-accent">Win Every Room.</span>
          </h1>

          <p className="lp-hero-sub lp-anim-3">
            Master the art of persuasion with the AI opponent that tracks your fallacies, 
            remembers your arguments, and pushes your logic to its absolute limit.
          </p>

          <div className="lp-hero-actions lp-anim-4">
            <button className="lp-btn-primary" onClick={() => navigate('/register')}>
              <span>Start Training Free</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button className="lp-btn-secondary" onClick={() => navigate('/login')}>
              Sign In
            </button>
          </div>

          <div className="lp-hero-trust lp-anim-5">
            <span className="lp-trust-dot" />
            <span>No credit card</span>
            <span className="lp-trust-sep">·</span>
            <span className="lp-trust-dot" />
            <span>10,000+ active users</span>
            <span className="lp-trust-sep">·</span>
            <span className="lp-trust-dot" />
            <span>Oxford-style rounds</span>
          </div>
        </div>

        {/* Orb visual */}
        <div
          className="lp-hero-visual lp-anim-3"
          style={{ transform: `translate(${mousePos.x * 18}px, ${mousePos.y * 14}px)` }}
        >
          <div className="lp-orb-wrap">
            <div className="lp-orb-ring lp-orb-ring--1" />
            <div className="lp-orb-ring lp-orb-ring--2" />
            <div className="lp-orb-ring lp-orb-ring--3" />
            <div className="lp-orb-core">
              <span className="lp-orb-icon">⚔</span>
            </div>
            {/* Floating stat chips */}
            <div className="lp-chip lp-chip--1">🏆 ELO +42</div>
            <div className="lp-chip lp-chip--2">⚠️ Fallacy Caught</div>
            <div className="lp-chip lp-chip--3">📈 Score: 87</div>
            <div className="lp-chip lp-chip--4">🎯 Round 4/6</div>
          </div>
        </div>
      </section>

      {/* ══════════ STATS STRIP ══════════ */}
      <section className="lp-stats-strip">
        {STATS.map((s, i) => (
          <div key={i} className="lp-stat-item landing-reveal">
            <div className="lp-stat-value">{s.value}</div>
            <div className="lp-stat-label">{s.label}</div>
          </div>
        ))}
      </section>

      {/* ══════════ HOW IT WORKS ══════════ */}
      <section className="lp-section" id="how">
        <div className="lp-section-label landing-reveal">How it works</div>
        <h2 className="lp-section-title landing-reveal">Three steps. Endless rounds.</h2>

        <div className="lp-how-grid">
          {[
            { step: '01', icon: '🎤', title: 'Speak Your Argument', desc: 'State your position naturally by voice or text — no scripts, no prompts. Just how you\'d argue in a real room.' },
            { step: '02', icon: '🤖', title: 'AI Fights Back', desc: 'DebateBot counters with researched facts, calls out your fallacies live, and pushes your position to its breaking point.' },
            { step: '03', icon: '📈', title: 'You Get Sharper', desc: 'Track which fallacies you lean on, see how your scores evolve, and close your weak spots one session at a time.' },
          ].map((item, i) => (
            <div key={i} className="lp-how-card landing-reveal">
              <div className="lp-how-step">{item.step}</div>
              <div className="lp-how-icon">{item.icon}</div>
              <h3 className="lp-how-title">{item.title}</h3>
              <p className="lp-how-desc">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ FEATURES ══════════ */}
      <section className="lp-section lp-section--dark" id="features">
        <div className="lp-section-label landing-reveal">Inside DebateForge</div>
        <h2 className="lp-section-title landing-reveal">Built for real competitors.</h2>
        <p className="lp-section-sub landing-reveal">Every feature was designed to expose your weaknesses and force you to fix them.</p>

        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-feature-card landing-reveal">
              <div className="lp-feature-icon">{f.icon}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
              <div className="lp-feature-glow" />
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ TESTIMONIALS ══════════ */}
      <section className="lp-section" id="social">
        <div className="lp-section-label landing-reveal">The Community</div>
        <h2 className="lp-section-title landing-reveal">Forged by 10,000+ competitors.</h2>

        <div className="lp-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="lp-testimonial-card landing-reveal">
              <div className="lp-testimonial-stars">★★★★★</div>
              <p className="lp-testimonial-quote">{t.quote}</p>
              <div className="lp-testimonial-author">
                <div className="lp-testimonial-avatar">{t.avatar}</div>
                <div>
                  <div className="lp-testimonial-name">{t.author}</div>
                  <div className="lp-testimonial-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ CTA BANNER ══════════ */}
      <section className="lp-cta-banner landing-reveal">
        <div className="lp-cta-content">
          <h2 className="lp-cta-title">Ready to forge your arguments?</h2>
          <p className="lp-cta-sub">Join thousands of debaters sharpening their skills every day. It's free to start.</p>
          <button className="lp-btn-primary lp-btn-large" onClick={() => navigate('/register')}>
            <span>Create Free Account</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div className="lp-cta-bg-glow" />
      </section>

      {/* ══════════ FOOTER ══════════ */}
      <footer className="lp-footer landing-reveal">
        <div className="lp-footer-logo">
          <span>⚔</span> DebateForge
        </div>
        <div className="lp-footer-links">
          <a href="#top" className="lp-footer-link">Home</a>
          <a href="#features" className="lp-footer-link">Features</a>
          <a href="#how" className="lp-footer-link">How It Works</a>
          <button className="lp-footer-link lp-footer-btn" onClick={() => navigate('/login')}>Sign In</button>
          <button className="lp-footer-link lp-footer-btn" onClick={() => navigate('/register')}>Register</button>
        </div>
        <div className="lp-footer-copy">© {new Date().getFullYear()} DebateForge. Built for relentless debaters.</div>
      </footer>
    </div>
  );
}
