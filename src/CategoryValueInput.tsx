import { useId, useRef, useState } from "react";

type Props = {
  label: string;
  category: string;
  placeholder: string;
  value: string;
  suggestions: string[];
  onChange: (value: string) => void;
};

export default function CategoryValueInput({
  label,
  category,
  placeholder,
  value,
  suggestions,
  onChange,
}: Props) {
  const listId = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLocaleLowerCase();
  const matches = suggestions
    .filter((candidate) => {
      const normalized = candidate.toLocaleLowerCase();
      return normalized !== query && normalized.includes(query);
    })
    .slice(0, 8);
  const visible = open && matches.length > 0;

  function choose(candidate: string) {
    onChange(candidate);
    input.current?.focus({ preventScroll: true });
    setOpen(false);
    setActive(-1);
  }

  return (
    <div
      className="category-value-input"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <textarea
        ref={input}
        rows={2}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={200}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={
          visible && active >= 0 && active < matches.length
            ? `${listId}-${active}`
            : undefined
        }
        onFocus={() => {
          setOpen(true);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.currentTarget.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
            return;
          }
          if (
            (event.key === "ArrowDown" || event.key === "ArrowUp") &&
            matches.length
          ) {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              event.key === "ArrowDown"
                ? (current + 1) % matches.length
                : (current <= 0 ? matches.length : current) - 1,
            );
          } else if (
            event.key === "Enter" &&
            visible &&
            active >= 0 &&
            active < matches.length &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            choose(matches[active]);
          }
        }}
      />
      {visible && (
        <div
          className="category-suggestions"
          role="listbox"
          id={listId}
          aria-label={`${category} suggestions`}
        >
          {matches.map((candidate, index) => (
            <button
              type="button"
              role="option"
              tabIndex={-1}
              key={candidate}
              id={`${listId}-${index}`}
              aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
