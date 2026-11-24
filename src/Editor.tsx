import { useEffect, useRef, useState } from "react";
import { api, clearGameCache } from "./api";
import type { Dle } from "./api";
import { moveCategory } from "./categoryOrder";
import type { PointerEvent } from "react";

type Draft = Omit<Dle, "id">;
const emptyDraft: Draft = {
  name: "",
  description: "",
  categories: ["", "", ""],
  characters: [],
  name_column: 0,
};

function loadDraft(): Draft {
  try {
    const saved = JSON.parse(localStorage.getItem("dlemaker-draft") || "null");
    if (
      saved &&
      typeof saved.name === "string" &&
      typeof saved.description === "string" &&
      Array.isArray(saved.categories) &&
      saved.categories.length >= 2 &&
      saved.categories.length <= 12 &&
      saved.categories.every((item: unknown) => typeof item === "string") &&
      Array.isArray(saved.characters) &&
      saved.characters.every(
        (row: unknown) =>
          Array.isArray(row) && row.every((cell) => typeof cell === "string"),
      ) &&
      Number.isInteger(saved.name_column) &&
      saved.name_column >= 0 &&
      saved.name_column < saved.categories.length
    )
      return saved;
  } catch {
    /* An invalid local draft falls back to a clean editor. */
  }
  return emptyDraft;
}

export default function Editor({ id }: { id?: number }) {
  const [draft, setDraft] = useState<Draft>(() =>
    id ? emptyDraft : loadDraft(),
  );
  const [loading, setLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(id);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draftStored, setDraftStored] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableOverflow, setTableOverflow] = useState(false);
  const drag = useRef<{
    from: number;
    to: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const [dragTarget, setDragTarget] = useState<number | null>(null);
  const [columnAnnouncement, setColumnAnnouncement] = useState("");

  function reorderCategory(from: number, to: number) {
    if (from === to || to < 0 || to >= draft.categories.length) return;
    change(moveCategory(draft, from, to));
    setColumnAnnouncement(
      `${draft.categories[from] || "Category"} moved to position ${to + 1}.`,
    );
    requestAnimationFrame(() =>
      tableRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-category-index="${to}"] .category-drag-handle`,
        )
        ?.focus({ preventScroll: true }),
    );
  }

  function startColumnDrag(
    event: PointerEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      from: index,
      to: index,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
  }

  function moveColumnDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active) return;
    if (
      Math.hypot(event.clientX - active.x, event.clientY - active.y) < 8 &&
      !active.moved
    )
      return;
    active.moved = true;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-category-index]");
    if (cell) {
      active.to = Number(cell.dataset.categoryIndex);
      setDragTarget(active.to);
    }
    const container = tableRef.current;
    if (container) {
      const bounds = container.getBoundingClientRect();
      if (event.clientX > bounds.right - 35) container.scrollLeft += 18;
      else if (event.clientX < bounds.left + 35) container.scrollLeft -= 18;
    }
  }

  function finishColumnDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    drag.current = null;
    setDragTarget(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (active?.moved) reorderCategory(active.from, active.to);
  }

  useEffect(() => {
    const container = tableRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setTableOverflow(container.scrollWidth > container.clientWidth + 1);
    });
    observer.observe(container);
    const table = container.querySelector("table");
    if (table) observer.observe(table);
    return () => observer.disconnect();
  }, [loading]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    api<Dle>(`/dles/${id}`)
      .then((data) => {
        if (!active) return;
        const width = Math.max(2, data.categories.length);
        setDraft({
          name: data.name,
          description: data.description || "",
          name_column: data.name_column || 0,
          creator_name: data.creator_name,
          categories: Array.from(
            { length: width },
            (_, index) => data.categories[index] || "",
          ),
          characters: data.characters.map((row) =>
            Array.from({ length: width }, (_, index) => row[index] || ""),
          ),
        });
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (id || savedId || loading) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("dlemaker-draft", JSON.stringify(draft));
        setDraftStored(true);
      } catch {
        setDraftStored(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [draft, id, savedId, loading]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty || (!savedId && draftStored)) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, savedId, draftStored]);

  function change(next: Draft) {
    if (!savedId) setDraftStored(false);
    setDraft(next);
    setDirty(true);
    setSaved(false);
    setError("");
  }

  function changeCell(row: number, column: number, value: string) {
    change({
      ...draft,
      characters: draft.characters.map((cells, index) =>
        index === row
          ? cells.map((cell, col) => (col === column ? value : cell))
          : cells,
      ),
    });
  }

  function addCategory() {
    change({
      ...draft,
      categories: [...draft.categories, ""],
      characters: draft.characters.map((row) => [...row, ""]),
    });
    requestAnimationFrame(() =>
      tableRef.current?.scrollTo({
        left: tableRef.current.scrollWidth,
        behavior: "smooth",
      }),
    );
  }

  function removeCategory(column: number) {
    if (draft.categories.length <= 2) return;
    if (
      (draft.categories[column] ||
        draft.characters.some((row) => row[column])) &&
      !window.confirm("Remove this category and all its character values?")
    )
      return;
    change({
      ...draft,
      categories: draft.categories.filter((_, index) => index !== column),
      characters: draft.characters.map((row) =>
        row.filter((_, index) => index !== column),
      ),
      name_column:
        draft.name_column === column
          ? 0
          : draft.name_column > column
            ? draft.name_column - 1
            : draft.name_column,
    });
  }

  function removeRow(row: number) {
    if (
      draft.characters[row].some(Boolean) &&
      !window.confirm("Remove this character and its values?")
    )
      return;
    change({
      ...draft,
      characters: draft.characters.filter((_, index) => index !== row),
    });
  }

  async function save() {
    if (saving) return;
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...draft,
        name: draft.name.trim(),
        categories: draft.categories.map((category) => category.trim()),
        characters: draft.characters
          .filter((row) => row.some((cell) => cell.trim()))
          .map((row) => row.map((cell) => cell.trim())),
      };
      const result = await api<{
        dle: { id: number; creator_name?: string | null };
      }>(savedId ? `/dles/${savedId}` : "/dles", {
        method: savedId ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });
      setSavedId(result.dle.id);
      clearGameCache();
      setDraft({
        ...payload,
        creator_name: result.dle.creator_name ?? draft.creator_name,
      });
      setDirty(false);
      setSaved(true);
      if (!id) localStorage.removeItem("dlemaker-draft");
      // Refreshes now reopen the saved DLE rather than creating a duplicate.
      window.history.replaceState(null, "", `/edit/${result.dle.id}`);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save your DLE.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <main className="page-loading">
        <span className="spinner" />
        Opening your DLE…
      </main>
    );
  if (loadError)
    return (
      <main className="empty-state">
        <h1>We couldn’t open this DLE.</h1>
        <p>{loadError}</p>
        <a className="button secondary" href="/">
          Back to Explore
        </a>
      </main>
    );

  return (
    <main className="editor page-width">
      <div className="breadcrumbs">
        <a href="/">Explore</a>
        <span>/</span>
        <span>{savedId ? "Edit DLE" : "Create a DLE"}</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>{savedId ? "Edit DLE" : "Create a DLE"}</h1>
          {savedId && (
            <p className="creator-credit">
              {draft.creator_name
                ? `By ${draft.creator_name}`
                : "Creator not recorded"}
            </p>
          )}
          <p>
            {savedId
              ? "Add characters, update your clues, and save your changes."
              : "Set up your categories and characters, then publish your game."}
          </p>
        </div>
        <div className="page-actions">
          {savedId && (
            <a className="button secondary" href={`/play/${savedId}`}>
              Play DLE
            </a>
          )}
          <button className="button primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : savedId ? "Save changes" : "Publish DLE"}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert error" role="alert">
          <span>!</span>
          {error}
        </div>
      )}
      {saved && (
        <div className="alert success" role="status">
          <span>✓</span>
          <div>
            Saved. Your DLE is ready to play. You can keep editing below.
          </div>
          <a href="/">View on Explore</a>
        </div>
      )}

      <section className="editor-panel basics-panel">
        <div className="panel-title">
          <div>
            <h2>Game details</h2>
          </div>
        </div>
        <div className="basics-fields">
          <label>
            DLE name <span className="required">*</span>
            <input
              value={draft.name}
              maxLength={100}
              onChange={(event) =>
                change({ ...draft, name: event.target.value })
              }
              placeholder="e.g. Pokémon"
            />
          </label>
          <label>
            Short description <span className="optional">optional</span>
            <input
              value={draft.description}
              maxLength={500}
              onChange={(event) =>
                change({ ...draft, description: event.target.value })
              }
              placeholder="What is your game about?"
            />
          </label>
        </div>
      </section>

      <section className="editor-panel roster-panel">
        <div className="roster-toolbar">
          <div className="panel-title">
            <div>
              <h2>Characters and categories</h2>
              <p>Name your columns, then fill in a row for each character.</p>
            </div>
          </div>
          <button
            className="button secondary small"
            disabled={draft.categories.length >= 12}
            onClick={addCategory}
          >
            ＋ Add category
          </button>
        </div>
        <div className="roster-settings">
          <label>
            Character name column{" "}
            <select
              value={draft.name_column}
              onChange={(event) =>
                change({ ...draft, name_column: Number(event.target.value) })
              }
            >
              {draft.categories.map((category, index) => (
                <option key={index} value={index}>
                  {category || `Column ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <span>
            {draft.characters.length} characters{" "}
            <span className="meta-divider">·</span> {draft.categories.length}{" "}
            columns
          </span>
        </div>
        <div className="editor-table-scroll" ref={tableRef}>
          <table className="editor-table">
            <thead>
              <tr>
                <th className="row-number" aria-label="Row number">
                  #
                </th>
                {draft.categories.map((category, index) => (
                  <th
                    key={index}
                    data-category-index={index}
                    className={
                      dragTarget === index ? "category-drop-target" : ""
                    }
                  >
                    <div className="column-heading">
                      <button
                        type="button"
                        className="category-drag-handle"
                        aria-label={`Move ${category || `category ${index + 1}`}`}
                        title="Drag to reorder. Use left or right arrow keys when focused."
                        onPointerDown={(event) => startColumnDrag(event, index)}
                        onPointerMove={moveColumnDrag}
                        onPointerUp={finishColumnDrag}
                        onPointerCancel={() => {
                          drag.current = null;
                          setDragTarget(null);
                        }}
                        onLostPointerCapture={() => {
                          drag.current = null;
                          setDragTarget(null);
                        }}
                        onKeyDown={(event) => {
                          if (
                            event.key === "ArrowLeft" ||
                            event.key === "ArrowRight"
                          ) {
                            event.preventDefault();
                            reorderCategory(
                              index,
                              index + (event.key === "ArrowLeft" ? -1 : 1),
                            );
                          } else if (event.key === "Escape") {
                            drag.current = null;
                            setDragTarget(null);
                          }
                        }}
                      >
                        <span aria-hidden="true" className="drag-grip">
                          ⠿
                        </span>
                        <span className="column-tag">Category</span>
                      </button>
                      <button
                        className="icon-button remove-column"
                        title="Remove category"
                        aria-label={`Remove ${category || "category"}`}
                        disabled={draft.categories.length <= 2}
                        onClick={() => removeCategory(index)}
                      >
                        ×
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      aria-label={`Category ${index + 1} name`}
                      placeholder="Category name"
                      value={category}
                      maxLength={60}
                      onChange={(event) =>
                        change({
                          ...draft,
                          categories: draft.categories.map((value, column) =>
                            column === index ? event.target.value : value,
                          ),
                        })
                      }
                    />
                  </th>
                ))}
                <th className="row-action" aria-label="Remove character" />
              </tr>
            </thead>
            <tbody>
              {draft.characters.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="row-number">
                    {String(rowIndex + 1).padStart(2, "0")}
                  </td>
                  {draft.categories.map((_, column) => (
                    <td
                      key={column}
                      data-category-label={
                        draft.categories[column] || `Category ${column + 1}`
                      }
                    >
                      <textarea
                        rows={2}
                        aria-label={`Character ${rowIndex + 1}, ${draft.categories[column] || `column ${column + 1}`}`}
                        placeholder={
                          column === draft.name_column
                            ? "Character name"
                            : "Enter a clue…"
                        }
                        value={row[column] || ""}
                        maxLength={200}
                        onChange={(event) =>
                          changeCell(rowIndex, column, event.target.value)
                        }
                      />
                    </td>
                  ))}
                  <td className="row-action">
                    <button
                      className="icon-button"
                      aria-label={`Remove character ${rowIndex + 1}`}
                      onClick={() => removeRow(rowIndex)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sr-only" role="status">
          {columnAnnouncement}
        </p>
        {tableOverflow && (
          <p className="table-scroll-hint">
            Scroll sideways to view all columns.
          </p>
        )}
        {draft.characters.length === 0 && (
          <p className="no-rows">
            Add a character to start filling your table.
          </p>
        )}
        <button
          className="add-row"
          disabled={draft.characters.length >= 500}
          onClick={() =>
            change({
              ...draft,
              characters: [...draft.characters, draft.categories.map(() => "")],
            })
          }
        >
          ＋ Add character
        </button>
        <div className="table-help">
          <span>ⓘ</span>
          <p>
            Use the same units for numbers, such as <strong>1.7 m</strong>.
            Separate multiple values with commas for partial matches, such as{" "}
            <strong>Fire, Flying</strong>.
          </p>
        </div>
      </section>
      <div className="editor-bottom">
        <div>
          <span className="draft-indicator" />
          {saved
            ? "All changes saved"
            : dirty && savedId
              ? "You have unsaved changes"
              : savedId
                ? "Editing a published DLE"
                : draftStored
                  ? "Draft saved on this browser"
                  : "Draft open — publish to save"}
          <small>Published DLEs can be edited by any signed-in creator.</small>
        </div>
        <button className="button primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : savedId ? "Save changes" : "Publish DLE"}
        </button>
      </div>
    </main>
  );
}
