export type Dle = {
  id: number;
  name: string;
  description: string;
  categories: string[];
  characters: string[][];
  name_column: number;
  creator_name?: string | null;
};
export type Cell = {
  value: string;
  match: "correct" | "partial" | "incorrect";
  direction?: "higher" | "lower";
};
export type Guess = { index: number; name: string; cells: Cell[] };
export type Round = {
  dle: Dle;
  answer: number;
  guesses: Guess[];
  created: number;
};
const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function validateDle(body: unknown): {
  data?: Omit<Dle, "id">;
  error?: string;
} {
  if (!body || typeof body !== "object") return { error: "A DLE is required." };
  const input = body as Record<string, unknown>;
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 100
  ) {
    return { error: "Give your DLE a name of up to 100 characters." };
  }
  const description = input.description ?? "";
  if (typeof description !== "string" || description.length > 500) {
    return { error: "Keep the description under 500 characters." };
  }
  if (
    !Array.isArray(input.categories) ||
    input.categories.length < 2 ||
    input.categories.length > 12 ||
    input.categories.some(
      (value) =>
        typeof value !== "string" || !value.trim() || value.length > 60,
    )
  ) {
    return {
      error: "Add 2–12 named columns, including a character name column.",
    };
  }
  const categories = input.categories.map((value: string) => value.trim());
  if (new Set(categories.map(normalize)).size !== categories.length)
    return { error: "Give each category a different name." };
  const nameColumn = input.name_column ?? 0;
  if (
    !Number.isInteger(nameColumn) ||
    Number(nameColumn) < 0 ||
    Number(nameColumn) >= categories.length
  ) {
    return { error: "Choose the column containing character names." };
  }
  if (
    !Array.isArray(input.characters) ||
    input.characters.length < 2 ||
    input.characters.length > 500 ||
    input.characters.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== categories.length ||
        row.some(
          (value) =>
            typeof value !== "string" || !value.trim() || value.length > 200,
        ),
    )
  ) {
    return {
      error:
        "Add 2–500 characters and fill every cell. Each row must match the column count.",
    };
  }
  const characters = input.characters.map((row: string[]) =>
    row.map((value) => value.trim()),
  );
  const names = characters.map((row) => normalize(row[Number(nameColumn)]));
  if (new Set(names).size !== names.length)
    return { error: "Character names must be unique." };
  return {
    data: {
      name: input.name.trim(),
      description: description.trim(),
      categories,
      characters,
      name_column: Number(nameColumn),
    },
  };
}

export function compare(value: string, answer: string): Cell {
  if (normalize(value) === normalize(answer))
    return { value, match: "correct" };
  const numericValue = value.match(/^(-?\d+(?:\.\d+)?)\s*([^\d]*)$/);
  const numericAnswer = answer.match(/^(-?\d+(?:\.\d+)?)\s*([^\d]*)$/);
  if (
    numericValue &&
    numericAnswer &&
    normalize(numericValue[2]) === normalize(numericAnswer[2])
  ) {
    const difference = Number(numericAnswer[1]) - Number(numericValue[1]);
    if (difference === 0) return { value, match: "correct" };
    return {
      value,
      match: "incorrect",
      direction: difference > 0 ? "higher" : "lower",
    };
  }
  const options = normalize(value)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const answers = normalize(answer)
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const uniqueOptions = new Set(options);
  const uniqueAnswers = new Set(answers);
  if (
    uniqueOptions.size === uniqueAnswers.size &&
    [...uniqueOptions].every((item) => uniqueAnswers.has(item))
  ) {
    return { value, match: "correct" };
  }
  if (options.some((item) => answers.includes(item)))
    return { value, match: "partial" };
  return { value, match: "incorrect" };
}

export function publicRound(id: string, round: Round) {
  const won = round.guesses.some((guess) => guess.index === round.answer);
  return {
    id,
    dleId: round.dle.id,
    name: round.dle.name,
    creator_name: round.dle.creator_name ?? null,
    categories: round.dle.categories.filter(
      (_, index) => index !== round.dle.name_column,
    ),
    options: round.dle.characters.map((row, index) => ({
      index,
      name: row[round.dle.name_column],
    })),
    guesses: round.guesses,
    won,
    answer: won
      ? round.dle.characters[round.answer][round.dle.name_column]
      : null,
  };
}
