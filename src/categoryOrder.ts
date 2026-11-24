type Columns = {
  categories: string[];
  characters: string[][];
  name_column: number;
};

// Move headings and their values together, preserving which column names characters.
export function moveCategory<T extends Columns>(
  draft: T,
  from: number,
  to: number,
): T {
  const order = draft.categories.map((_, index) => index);
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= order.length ||
    to >= order.length ||
    from === to
  )
    return draft;
  order.splice(to, 0, order.splice(from, 1)[0]);
  return {
    ...draft,
    categories: order.map((index) => draft.categories[index]),
    characters: draft.characters.map((row) =>
      order.map((index) => row[index] ?? ""),
    ),
    name_column: order.indexOf(draft.name_column),
  };
}
