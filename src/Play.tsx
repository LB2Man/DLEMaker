import { useEffect, useRef, useState } from "react";
import { api, initials, palette } from "./api";
import type { Round } from "./api";

export default function Play({ id }: { id: number }) {
  const clueTableRef = useRef<HTMLDivElement>(null);
  const [cluesOverflow, setCluesOverflow] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [inputError, setInputError] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        let data: Round | null = null;
        const saved = sessionStorage.getItem(`dlemaker-round-${id}`);
        if (saved) {
          try {
            data = await api<Round>(`/rounds/${saved}`);
          } catch {
            sessionStorage.removeItem(`dlemaker-round-${id}`);
          }
        }
        if (!data)
          data = await api<Round>(`/dles/${id}/rounds`, { method: "POST" });
        if (active) {
          sessionStorage.setItem(`dlemaker-round-${id}`, data.id);
          setRound(data);
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Could not start this game.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const container = clueTableRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setCluesOverflow(container.scrollWidth > container.clientWidth + 1);
    });
    observer.observe(container);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [round?.id]);

  async function guess(index: number) {
    if (!round || busy || round.won) return;
    setBusy(true);
    setError("");
    setInputError("");
    setSelectedIndex(-1);
    try {
      setRound(
        await api<Round>(`/rounds/${round.id}/guesses`, {
          method: "POST",
          body: JSON.stringify({ index }),
        }),
      );
      setQuery("");
      setFocused(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not check your guess.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restart() {
    setBusy(true);
    setError("");
    try {
      const data = await api<Round>(`/dles/${id}/rounds`, { method: "POST" });
      sessionStorage.setItem(`dlemaker-round-${id}`, data.id);
      setRound(data);
      setQuery("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not start a new round.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!round) return;
    try {
      const clues = [...round.guesses]
        .reverse()
        .map((guess) =>
          guess.cells
            .map((cell) =>
              cell.match === "correct"
                ? "🟩"
                : cell.match === "partial"
                  ? "🟨"
                  : "🟥",
            )
            .join(""),
        )
        .join("\n");
      await navigator.clipboard.writeText(
        `${round.name} · ${round.guesses.length} guesses\n${clues}\n${location.href}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Could not copy the result. You can share this page’s address instead.",
      );
    }
  }

  if (loading)
    return (
      <main className="page-loading">
        <span className="spinner" />
        Choosing your mystery character…
      </main>
    );
  if (!round)
    return (
      <main className="empty-state">
        <h1>We couldn’t start this game.</h1>
        <p>{error}</p>
        <div className="button-row">
          <a href="/" className="button secondary">
            Back to Explore
          </a>
          <a href={`/edit/${id}`} className="button primary">
            Open editor
          </a>
        </div>
      </main>
    );
  const available = round.options.filter(
    (option) => !round.guesses.some((guess) => guess.index === option.index),
  );
  const suggestions = available
    .filter((option) => option.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);
  const exact = available.find(
    (option) => option.name.toLowerCase() === query.trim().toLowerCase(),
  );

  return (
    <main className="play-page page-width">
      <div className="play-navigation">
        <a href="/" className="text-link">
          Back to Explore
        </a>
        <div>
          <button
            className="text-button"
            onClick={() => setShowRules(!showRules)}
          >
            How to play
          </button>
          <a className="text-link" href={`/edit/${id}`}>
            Edit DLE
          </a>
        </div>
      </div>
      <div className="play-title">
        <span className={`game-emblem palette-${palette(round.name)}`}>
          {initials(round.name)}
          <span>?</span>
        </span>
        <h1>{round.name}</h1>
        <p>One secret character. Follow the clues to find them.</p>
        <div className="play-stats">
          <span>{round.options.length} characters</span>
          <span>·</span>
          <span>{round.categories.length} clues</span>
          <span>·</span>
          <span>
            {round.guesses.length}{" "}
            {round.guesses.length === 1 ? "guess" : "guesses"}
          </span>
        </div>
      </div>
      {showRules && (
        <section className="rules-panel">
          <h2>Know your clues</h2>
          <p>
            Choose any character from the roster. Each clue compares your guess
            with the secret character. Green matches, yellow shares a value, and
            red is different. ↑ means the answer is higher, and ↓ means it is
            lower. Keep guessing until you find the character.
          </p>
          <p>
            A new round picks a fresh random character. Everyone can play at
            their own pace.
          </p>
        </section>
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button className="text-button" onClick={restart}>
            Start a new round
          </button>
        </div>
      )}
      {round.won ? (
        <section className="win-panel" aria-live="polite">
          <div className="eyebrow">MYSTERY SOLVED</div>
          <h2>You found {round.answer}!</h2>
          <p>
            {round.guesses.length === 1
              ? "First try. You really know your world."
              : `Solved in ${round.guesses.length} guesses.`}
          </p>
          <div className="button-row">
            <button
              className="button primary"
              onClick={restart}
              disabled={busy}
            >
              Play again
            </button>
            <button className="button secondary" onClick={share}>
              {copied ? "Copied!" : "Share result"}
            </button>
          </div>
        </section>
      ) : (
        <div
          className="guess-area"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              setFocused(false);
          }}
        >
          <label htmlFor="character-guess">Who’s your guess?</label>
          <form
            className="guess-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (exact) void guess(exact.index);
              else {
                setInputError("Choose a character from the suggestions below.");
                setFocused(true);
              }
            }}
          >
            <span className="guess-search-icon" aria-hidden="true">
              ⌕
            </span>
            <input
              id="character-guess"
              autoComplete="off"
              placeholder="Start typing a character’s name…"
              value={query}
              onFocus={() => setFocused(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setFocused(true);
                setSelectedIndex(-1);
                setInputError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFocused(false);
                if (
                  (event.key === "ArrowDown" || event.key === "ArrowUp") &&
                  suggestions.length
                ) {
                  event.preventDefault();
                  setFocused(true);
                  setSelectedIndex((current) =>
                    event.key === "ArrowDown"
                      ? (current + 1) % suggestions.length
                      : (current <= 0 ? suggestions.length : current) - 1,
                  );
                }
                if (
                  event.key === "Enter" &&
                  focused &&
                  selectedIndex >= 0 &&
                  suggestions[selectedIndex]
                ) {
                  event.preventDefault();
                  void guess(suggestions[selectedIndex].index);
                }
              }}
              aria-controls="character-options"
              aria-expanded={focused}
              aria-activedescendant={
                focused && selectedIndex >= 0 && suggestions[selectedIndex]
                  ? `character-option-${suggestions[selectedIndex].index}`
                  : undefined
              }
              role="combobox"
            />
            <button className="button primary" disabled={busy || !query.trim()}>
              {busy ? "Checking…" : "Guess"}
            </button>
          </form>
          {inputError && (
            <p className="guess-input-error" role="alert">
              {inputError}
            </p>
          )}
          {focused && (
            <div
              className="suggestions"
              id="character-options"
              role="listbox"
              aria-label="Available characters"
            >
              {suggestions.length ? (
                suggestions.map((option, optionIndex) => (
                  <button
                    key={option.index}
                    type="button"
                    role="option"
                    id={`character-option-${option.index}`}
                    aria-selected={optionIndex === selectedIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => guess(option.index)}
                    disabled={busy}
                  >
                    <span
                      className={`option-avatar palette-${palette(option.name)}`}
                    >
                      {initials(option.name)}
                    </span>
                    {option.name}
                    <span className="option-action">Guess</span>
                  </button>
                ))
              ) : (
                <p>No available characters match that name.</p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="match-legend">
        <span>
          <i className="correct" />
          Correct
        </span>
        <span>
          <i className="partial" />
          Partial match
        </span>
        <span>
          <i className="incorrect" />
          Different
        </span>
        <span className="direction-legend">
          ↑ Higher <span>↓ Lower</span>
        </span>
      </div>
      <div className="guess-table-scroll" ref={clueTableRef}>
        <table
          className="guess-table"
          style={{
            minWidth: Math.max(570, 180 + round.categories.length * 115),
          }}
        >
          <thead>
            <tr>
              <th>Character</th>
              {round.categories.map((category, index) => (
                <th key={index}>{category}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {round.guesses.map((guess) => (
              <tr key={guess.index}>
                <th scope="row">
                  <span
                    className={`guess-avatar palette-${palette(guess.name)}`}
                  >
                    {initials(guess.name)}
                  </span>
                  <span>{guess.name}</span>
                </th>
                {guess.cells.map((cell, index) => (
                  <td key={index}>
                    <div className={`clue-cell ${cell.match}`}>
                      <span>{cell.value}</span>
                      <span
                        className="clue-symbol"
                        aria-label={
                          cell.direction
                            ? `Answer is ${cell.direction}`
                            : cell.match
                        }
                      >
                        {cell.direction === "higher"
                          ? "↑"
                          : cell.direction === "lower"
                            ? "↓"
                            : cell.match === "correct"
                              ? "✓"
                              : cell.match === "partial"
                                ? "≈"
                                : "×"}
                      </span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cluesOverflow && round.guesses.length > 0 && (
        <p className="clue-scroll-hint">Scroll sideways to view all clues.</p>
      )}
      {!round.guesses.length && (
        <div className="first-guess">
          <span>?</span>
          <h2>A good mystery starts with a guess.</h2>
          <p>Choose a character above. Your clues will appear here.</p>
        </div>
      )}
      <div className="play-bottom">
        <span>Each round is a new mystery.</span>
        {!round.won && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (
                !round.guesses.length ||
                confirm("Start over with a new random character?")
              )
                void restart();
            }}
          >
            New round
          </button>
        )}
      </div>
    </main>
  );
}
