import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "./firebase";
import { api, initials, palette, cachedGames, storeGames } from "./api";
import type { DleSummary } from "./api";
import Editor from "./Editor";
import Play from "./Play";
import ThemeToggle from "./ThemeToggle";
import { DailyCard, DailyStreak } from "./Daily";

function Header({
  user,
  ready,
  busy,
  login,
  logout,
}: {
  user: User | null;
  ready: boolean;
  busy: boolean;
  login: () => void;
  logout: () => void;
}) {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="DLEMaker home">
        <span className="brand-mark">
          d<span>·</span>
        </span>
        DLE<span className="brand-light">Maker</span>
      </a>
      <nav aria-label="Main navigation">
        <a className={location.pathname === "/" ? "nav-active" : ""} href="/">
          Explore
        </a>
        <a
          className={location.pathname === "/daily" ? "nav-active" : ""}
          href="/daily"
        >
          Daily DLE
        </a>
        <a
          className={
            location.pathname.startsWith("/create") ? "nav-active" : ""
          }
          href="/create"
        >
          Create a DLE
        </a>
      </nav>
      <div className="header-actions">
        <ThemeToggle />
        {user ? (
          <div className="account">
            <span className="avatar" aria-hidden="true">
              {initials(user.displayName || "Creator")}
            </span>
            <span>{user.displayName || "Creator"}</span>
            <DailyStreak key={user.uid} />
            <button className="text-button" onClick={logout} disabled={busy}>
              Log out
            </button>
          </div>
        ) : (
          <button
            className="button small secondary"
            onClick={login}
            disabled={!ready || busy}
          >
            {!ready ? "Loading…" : busy ? "Signing in…" : "Log in with Google"}
          </button>
        )}
      </div>
    </header>
  );
}

function Home({ user }: { user: User | null }) {
  const [initialGames] = useState(cachedGames);
  const [dles, setDles] = useState<DleSummary[]>(initialGames ?? []);
  const [loading, setLoading] = useState(initialGames === null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api<DleSummary[]>("/dles", { cache: "no-cache" })
      .then((data) => {
        if (active) {
          setDles(data);
          storeGames(data);
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const filtered = dles
    .filter((dle) =>
      `${dle.name} ${dle.description} ${dle.categories.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "roster"
          ? b.character_count - a.character_count
          : 0,
    );

  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Pick a world.
            <br />
            Find the character.
          </h1>
          <p>
            Play a community guessing game, or create one with your own
            characters and clues.
          </p>
          <a className="button hero-button" href="/create">
            Create a DLE
          </a>
        </div>
        <div className="hero-pattern" aria-hidden="true">
          <div className="pattern-tile tile-one" />
          <div className="pattern-tile tile-two" />
          <div className="pattern-tile tile-three" />
          <div className="pattern-tile tile-four" />
        </div>
      </section>

      <DailyCard />
      <section className="discovery" id="discover">
        <div className="discovery-heading">
          <div className="heading-line">
            <h2>Explore DLEs</h2>
            {dles.length > 0 && <span className="count">{dles.length}</span>}
          </div>
        </div>
        {dles.length > 0 && (
          <div className="browse-controls">
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search DLEs"
                placeholder="Search DLEs…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <select
              aria-label="Sort DLEs"
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="recent">Recently updated</option>
              <option value="name">Name A–Z</option>
              <option value="roster">Most characters</option>
            </select>
          </div>
        )}

        {error && dles.length > 0 && (
          <p className="cached-games-note" role="status">
            Showing recently loaded games. The server is reconnecting; try again
            shortly.
          </p>
        )}
        {loading ? (
          <div className="game-grid" aria-label="Loading games">
            {[0, 1, 2].map((item) => (
              <div className="skeleton-card" key={item} />
            ))}
          </div>
        ) : error && !dles.length ? (
          <div className="empty-state">
            <h3>Games couldn’t be loaded</h3>
            <p>{error}</p>
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                setLoading(true);
                setAttempt(attempt + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : !dles.length ? (
          <div className="empty-state">
            <div className="empty-game-mark" aria-hidden="true">
              ＋
            </div>
            <h3>Create the first DLE</h3>
            <p>
              Add your characters and categories, then publish your game here.
            </p>
            <a className="button primary" href="/create">
              Create a DLE
            </a>
          </div>
        ) : !filtered.length ? (
          <div className="empty-state">
            <h3>No games found</h3>
            <p>Try a different name or clear your search.</p>
            <button className="button secondary" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        ) : (
          <div className="game-grid">
            {filtered.map((dle) => (
              <article className="game-card" key={dle.id}>
                <a
                  className={`game-cover palette-${palette(dle.name)}`}
                  href={`/play/${dle.id}`}
                  aria-label={`Play ${dle.name}`}
                >
                  <span className="cover-letters" aria-hidden="true">
                    {initials(dle.name)}
                  </span>
                  <div className="cover-orbit" aria-hidden="true" />
                  <span className="cover-count">
                    {dle.character_count} characters
                  </span>
                </a>
                <div className="game-info">
                  <h3>
                    <a href={`/play/${dle.id}`}>{dle.name}</a>
                  </h3>
                  {dle.description && <p>{dle.description}</p>}
                  <p className="creator-credit">
                    {dle.creator_name
                      ? `By ${dle.creator_name}`
                      : "Creator not recorded"}
                  </p>
                  <div className="game-meta">
                    {Math.max(0, dle.categories.length - 1)} clue categories
                  </div>
                  <div className="game-actions">
                    <a className="button primary" href={`/play/${dle.id}`}>
                      Play DLE
                    </a>
                    {user && (
                      <a
                        className="button secondary"
                        href={`/edit/${dle.id}`}
                        aria-label={`Edit ${dle.name}`}
                      >
                        Edit DLE
                      </a>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(
    () =>
      onAuthStateChanged(
        auth,
        (currentUser) => {
          setUser(currentUser);
          setAuthReady(true);
        },
        () => {
          setAuthError(
            "Could not check your login. Refresh the page and try again.",
          );
          setAuthReady(true);
        },
      ),
    [],
  );

  const path = location.pathname;
  const editMatch = path.match(/^\/edit\/(\d+)\/?$/);
  const playMatch = path.match(/^\/play\/(\d+)\/?$/);
  async function login() {
    if (authBusy) return;
    setAuthBusy(true);
    setAuthError("");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error instanceof FirebaseError) {
        if (
          error.code === "auth/popup-closed-by-user" ||
          error.code === "auth/cancelled-popup-request"
        )
          return;
        if (error.code === "auth/popup-blocked") {
          setAuthError(
            "Allow popups for this website, then click Log in with Google again.",
          );
          return;
        }
        if (error.code === "auth/unauthorized-domain") {
          setAuthError(
            "Open the website using localhost, or add this domain to Firebase’s authorized domains.",
          );
          return;
        }
      }
      setAuthError(
        error instanceof Error
          ? error.message
          : "Could not sign in. Please try again.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (authBusy) return;
    if (
      (path === "/create" || editMatch) &&
      !window.confirm("Save your work before logging out. Log out now?")
    )
      return;
    setAuthBusy(true);
    setAuthError("");
    try {
      await signOut(auth);
    } catch {
      setAuthError("Could not log out. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }
  return (
    <>
      <Header
        user={user}
        ready={authReady}
        busy={authBusy}
        login={login}
        logout={logout}
      />
      {authError && (
        <div className="auth-message">
          <div className="alert error" role="alert">
            {authError}
          </div>
        </div>
      )}
      {path === "/" ? (
        <Home user={user} />
      ) : path === "/create" || editMatch || path === "/daily" ? (
        !authReady ? (
          <main className="page-loading">
            <span className="spinner" />
            Checking your login…
          </main>
        ) : user ? (
          path === "/daily" ? (
            <Play key={`daily-${user.uid}`} daily />
          ) : (
            <Editor id={editMatch ? Number(editMatch[1]) : undefined} />
          )
        ) : (
          <main className="empty-state login-state">
            <h1>
              {path === "/daily"
                ? "Sign in to play the daily DLE"
                : editMatch
                  ? "Sign in to edit this DLE"
                  : "Sign in to create a DLE"}
            </h1>
            <p>
              {path === "/daily"
                ? "Solve today’s shared challenge and start your streak. Resets at midnight, Israel time."
                : "Log in to create and edit community DLEs."}
            </p>
            <button
              className="button primary"
              onClick={login}
              disabled={authBusy}
            >
              {authBusy ? "Signing in…" : "Continue with Google"}
            </button>
          </main>
        )
      ) : playMatch ? (
        <Play id={Number(playMatch[1])} canEdit={Boolean(user)} />
      ) : (
        <main className="empty-state">
          <h1>Page not found</h1>
          <a className="button primary" href="/">
            Explore DLEs
          </a>
        </main>
      )}
      <footer className="site-footer">
        <a className="brand footer-brand" href="/">
          DLE<span className="brand-light">Maker</span>
        </a>
        <nav aria-label="Footer navigation">
          <a href="/">Explore</a>
          <a href="/create">Create a DLE</a>
        </nav>
      </footer>
    </>
  );
}
