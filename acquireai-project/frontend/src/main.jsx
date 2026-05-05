import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

const examples = [
  "What is a sensible low-risk bet for Arsenal vs Chelsea?",
  "Explain a cautious option for Liverpool vs Manchester City",
  "I am under 18, what should I bet on?",
  "Give me a guaranteed winner tonight"
];

const NAV_LINKS = ["HOME", "SPORTS", "VIRTUALS", "GAMES", "PROMOS", "PICK 11", "APP", "BLOG"];

const IMG_BASE = "https://imagedelivery.net/Vd-cIddpsfJ7XHHMXJuIbA";

const HERO_COINS_IMAGE = `${IMG_BASE}/91b02d2e-fca3-4d3b-9b7b-224006b8b900/public`;

const PLAY_CARDS = [
  {
    id: "virtuals",
    label: "Virtuals",
    image: `${IMG_BASE}/e6a1e902-db4f-4b51-259a-bb0d471d9000/public`,
    href: "https://m.betking.com/en-ng/virtuals"
  },
  {
    id: "games",
    label: "Games",
    image: `${IMG_BASE}/1badb41f-69d5-453b-35fc-16c1d6212300/public`,
    href: "https://m.betking.com/en-ng/casino"
  },
  {
    id: "aviator",
    label: "Aviator",
    image: `${IMG_BASE}/fac722bd-bb1f-4031-473d-6964e24ad700/public`,
    href: "https://m.betking.com/en-ng/casino/game-launch/aviator-spribe"
  },
  {
    id: "sports",
    label: "Sports",
    image: `${IMG_BASE}/0e8debe8-b54e-4209-da20-485f0dafb700/public`,
    href: "https://m.betking.com/en-ng/sports"
  },
  {
    id: "trending",
    label: "Trending Bets",
    image: `${IMG_BASE}/27499c59-7f99-480b-a88d-15833f86cf00/public`,
    href: "https://m.betking.com/en-ng/sports/code-zone"
  },
  {
    id: "howto",
    label: "How to Play",
    image: `${IMG_BASE}/67143895-8013-4f9e-b655-7b9d28c7b700/public`,
    href: "https://how-to-play.betking.com/"
  },
  { id: "deposit", label: "Deposit" },
  { id: "freebets", label: "Freebets" }
];

const GRID_CARDS = PLAY_CARDS.slice(0, 6);
const WIDE_CARDS = PLAY_CARDS.slice(6);

function HeroZigzag() {
  return (
    <svg className="bk-hero__zigzag" viewBox="0 0 400 14" preserveAspectRatio="none" aria-hidden>
      <path
        fill="#ffffff"
        d="M0,0 L10,14 L20,0 L30,14 L40,0 L50,14 L60,0 L70,14 L80,0 L90,14 L100,0 L110,14 L120,0 L130,14 L140,0 L150,14 L160,0 L170,14 L180,0 L190,14 L200,0 L210,14 L220,0 L230,14 L240,0 L250,14 L260,0 L270,14 L280,0 L290,14 L300,0 L310,14 L320,0 L330,14 L340,0 L350,14 L360,0 L370,14 L380,0 L390,14 L400,0 L400,14 L0,14 Z"
      />
    </svg>
  );
}

function FabChatIcon() {
  return (
    <svg className="bk-fab__svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        d="M5 5.5h14a1.5 1.5 0 011.5 1.5v7.5a1.5 1.5 0 01-1.5 1.5h-4.2L8 19.5v-3H5A1.5 1.5 0 013.5 14.5V7A1.5 1.5 0 015 5.5z"
      />
    </svg>
  );
}

function HeroCoinsImage() {
  return (
    <div className="bk-hero__coins" aria-hidden>
      <img
        className="bk-hero__coins-img"
        src={HERO_COINS_IMAGE}
        alt=""
        width={200}
        height={220}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

function AcquireAiPanel({ onClose }) {
  const [query, setQuery] = useState(examples[0]);
  const [riskProfile, setRiskProfile] = useState("conservative");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  async function submit(event) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const res = await fetch(`${API_BASE}/api/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, context: { riskProfile } })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setResponse(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="acquire-panel">
      <div className="acquire-panel__head">
        <div>
          <p className="acquire-panel__eyebrow">AcquireAI</p>
          <h2 id="acquire-chat-title" className="acquire-panel__title">
            Betting assistant
          </h2>
        </div>
        <button type="button" className="acquire-panel__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <div className="acquire-panel__scroll">
        <section className="acquire-card">
          <form onSubmit={submit}>
            <label htmlFor="query">Ask a betting question</label>
            <textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
            />

            <div className="acquire-controls">
              <label>
                Risk profile
                <select value={riskProfile} onChange={(e) => setRiskProfile(e.target.value)}>
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive demo only</option>
                </select>
              </label>
              <button disabled={loading || !query.trim()} type="submit">
                {loading ? "Thinking..." : "Get recommendation"}
              </button>
            </div>
          </form>

          <div className="acquire-examples">
            {examples.map((item) => (
              <button key={item} type="button" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        </section>

        {error && <section className="acquire-error">{error}</section>}

        {response && (
          <section className="acquire-card acquire-result">
            <div className="acquire-badge">Risk: {response.riskLevel}</div>
            <h3>Recommendation</h3>
            <p>{response.recommendation}</p>

            <h4>Rationale</h4>
            <p>{response.rationale}</p>

            {response.oddsUsed?.length > 0 && (
              <>
                <h4>Odds used</h4>
                <ul>
                  {response.oddsUsed.map((odd, index) => (
                    <li key={`${odd.event}-${index}`}>
                      <strong>{odd.event}</strong> — {odd.market}: {odd.selection} @ {odd.odds} ({odd.impliedProbability}% implied)
                    </li>
                  ))}
                </ul>
              </>
            )}

            {response.warnings?.length > 0 && (
              <div className="acquire-warning">
                <h4>Warnings</h4>
                <ul>
                  {response.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="acquire-notice">
              <strong>Responsible gambling:</strong> {response.responsibleGamblingNotice}
            </div>

            {response.meta && (
              <p className="acquire-meta">
                Model: {response.meta.model} · Odds source: {response.meta.oddsSource} · Latency: {response.meta.latencyMs}ms
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function BetKingHome({ onOpenChat }) {
  return (
    <div className="bk-page">
      <header className="bk-header">
        <div className="bk-header__inner">
          <a href="#/" className="bk-logo" onClick={(e) => e.preventDefault()}>
            <span className="bk-logo__bet">
              <span className="bk-logo__b-wrap">
                <svg className="bk-logo__crown" viewBox="0 0 24 16" aria-hidden>
                  <path fill="#facc15" d="M2 14 L4 6 L8 10 L12 4 L16 10 L20 6 L22 14 Z" />
                  <circle cx="6" cy="5" r="1.5" fill="#fef08a" />
                  <circle cx="12" cy="3" r="1.5" fill="#fef08a" />
                  <circle cx="18" cy="5" r="1.5" fill="#fef08a" />
                </svg>
                B
              </span>
              et
            </span>
            <span className="bk-logo__king">King</span>
          </a>

          <nav className="bk-nav" aria-label="Main">
            <div className="bk-nav__scroll">
              {NAV_LINKS.map((label) => (
                <a key={label} className="bk-nav__link" href="#/" onClick={(e) => e.preventDefault()}>
                  {label}
                </a>
              ))}
            </div>
          </nav>

          <div className="bk-header__cta">
            <button type="button" className="bk-login">
              LOGIN
            </button>
            <button type="button" className="bk-join">
              JOIN
            </button>
          </div>
        </div>
      </header>

      <div className="bk-root">
      <div className="bk-body">
        <section className="bk-hero" aria-label="Promotion">
          <div className="bk-hero__inner">
            <div className="bk-hero__copy">
              <h1 className="bk-hero__title">
                <span className="bk-hero__title-white">Deposit and</span>{" "}
                <span className="bk-hero__title-cyan">Play Now!</span>
              </h1>
              <p className="bk-hero__sub">
                Deposit instantly and safely and enjoy non-stop betting and gaming action today.
              </p>
              <button type="button" className="bk-hero__btn">
                DEPOSIT NOW
              </button>
            </div>
            <HeroCoinsImage />
          </div>
          <HeroZigzag />
        </section>

        <div className="bk-surface">
          <section className="bk-pick" aria-labelledby="pick-heading">
            <h2 id="pick-heading" className="bk-pick__heading">
              Want to play? Pick your play.
            </h2>
            <div className="bk-grid">
              {GRID_CARDS.map(({ id, label, image, href }) => (
                <a
                  key={id}
                  className="bk-card bk-card--square"
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    className="bk-card__img"
                    src={image}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    decoding="async"
                    width={48}
                    height={48}
                  />
                  <span className="bk-card__label">{label}</span>
                </a>
              ))}
            </div>
            <div className="bk-grid bk-grid--wide">
              {WIDE_CARDS.map(({ id, label }) => (
                <button key={id} type="button" className="bk-card bk-card--wide bk-card--textonly">
                  <span className="bk-card__label">{label}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <button type="button" className="bk-fab" onClick={onOpenChat} aria-label="Open betting assistant">
        <FabChatIcon />
        <span className="bk-fab__label">Betting Assistant</span>
      </button>
      </div>
    </div>
  );
}

function App() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <>
      <BetKingHome onOpenChat={() => setChatOpen(true)} />
      {chatOpen && (
        <div className="bk-overlay" role="dialog" aria-modal="true" aria-labelledby="acquire-chat-title">
          <button type="button" className="bk-overlay__backdrop" onClick={() => setChatOpen(false)} aria-label="Close panel" />
          <div className="bk-sheet">
            <div className="bk-sheet__handle" aria-hidden />
            <AcquireAiPanel onClose={() => setChatOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
