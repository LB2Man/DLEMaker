import express from "express";
import cors from "cors";
import pg from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireUser } from "./auth.js";

const app = express();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
const allowedOrigins = new Set([
  "http://localhost:3001",
  "http://localhost:5173",
  "https://dlemaker.web.app",
  "https://dlemaker.firebaseapp.com",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);
app.use(
  cors({
    origin: (origin, callback) =>
      callback(null, !origin || allowedOrigins.has(origin)),
    methods: ["GET", "POST", "PUT", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  }),
);
app.use(express.json({ limit: "2mb" }));

type Dle = {
  id: number;
  name: string;
  description: string;
  categories: string[];
  characters: string[][];
  name_column: number;
};
type Cell = {
  value: string;
  match: "correct" | "partial" | "incorrect";
  direction?: "higher" | "lower";
};
type Guess = { index: number; name: string; cells: Cell[] };
type Round = { dle: Dle; answer: number; guesses: Guess[]; created: number };
const rounds = new Map<string, Round>();
const normalize = (value: string) => value.trim().toLocaleLowerCase();

function validateDle(body: unknown): {
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

function compare(value: string, answer: string): Cell {
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

function publicRound(id: string, round: Round) {
  const won = round.guesses.some((guess) => guess.index === round.answer);
  return {
    id,
    dleId: round.dle.id,
    name: round.dle.name,
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

app.get("/api/dles", async (_request, response) => {
  const result =
    await pool.query(`SELECT id, name, description, categories, name_column,
    (SELECT count(*)::int FROM jsonb_array_elements(characters) AS roster(row)
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(roster.row) AS cell(value)
        WHERE trim(cell.value) <> '')) AS character_count,
    updated_at FROM dles ORDER BY updated_at DESC, id DESC`);
  response.json(result.rows);
});

app.get("/api/dles/:id", requireUser, async (request, response) => {
  if (typeof request.params.id !== "string" || !/^\d+$/.test(request.params.id))
    return response.status(400).json({ message: "Invalid DLE ID." });
  const result = await pool.query("SELECT * FROM dles WHERE id = $1", [
    request.params.id,
  ]);
  if (!result.rows[0])
    return response
      .status(404)
      .json({ message: "This DLE could not be found." });
  response.json(result.rows[0]);
});

app.post("/api/dles", requireUser, async (request, response) => {
  const { data, error } = validateDle(request.body);
  if (!data) return response.status(400).json({ message: error });
  const result = await pool.query(
    `INSERT INTO dles (name, description, categories, characters, name_column)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, name`,
    [
      data.name,
      data.description,
      JSON.stringify(data.categories),
      JSON.stringify(data.characters),
      data.name_column,
    ],
  );
  response.status(201).json({ message: "DLE published", dle: result.rows[0] });
});

app.put("/api/dles/:id", requireUser, async (request, response) => {
  if (typeof request.params.id !== "string" || !/^\d+$/.test(request.params.id))
    return response.status(400).json({ message: "Invalid DLE ID." });
  const { data, error } = validateDle(request.body);
  if (!data) return response.status(400).json({ message: error });
  const result = await pool.query(
    `UPDATE dles SET name = $1, description = $2, categories = $3,
    characters = $4, name_column = $5, updated_at = NOW() WHERE id = $6 RETURNING id, name`,
    [
      data.name,
      data.description,
      JSON.stringify(data.categories),
      JSON.stringify(data.characters),
      data.name_column,
      request.params.id,
    ],
  );
  if (!result.rows[0])
    return response
      .status(404)
      .json({ message: "This DLE could not be found." });
  response.json({ message: "Changes saved", dle: result.rows[0] });
});

app.post("/api/dles/:id/rounds", async (request, response) => {
  if (typeof request.params.id !== "string" || !/^\d+$/.test(request.params.id))
    return response.status(400).json({ message: "Invalid DLE ID." });
  const result = await pool.query("SELECT * FROM dles WHERE id = $1", [
    request.params.id,
  ]);
  const dle: Dle | undefined = result.rows[0];
  if (!dle)
    return response
      .status(404)
      .json({ message: "This DLE could not be found." });
  dle.characters = dle.characters.filter((row) =>
    row.some((value) => value.trim()),
  );
  if (
    !dle.characters.length ||
    dle.categories.length < 2 ||
    dle.characters.some(
      (row) =>
        !row[dle.name_column] ||
        row.length !== dle.categories.length ||
        row.some((value) => !value.trim()),
    )
  ) {
    return response.status(400).json({
      message:
        "This DLE needs a complete roster before it can be played. Open it in the editor to finish it.",
    });
  }
  const id = randomUUID();
  const round: Round = {
    dle,
    answer: Math.floor(Math.random() * dle.characters.length),
    guesses: [],
    created: Date.now(),
  };
  rounds.set(id, round);
  response.status(201).json(publicRound(id, round));
});

app.get("/api/rounds/:id", (request, response) => {
  const round = rounds.get(request.params.id);
  if (!round)
    return response
      .status(404)
      .json({ message: "This round has expired. Start a new round." });
  response.json(publicRound(request.params.id, round));
});

app.post("/api/rounds/:id/guesses", (request, response) => {
  const round = rounds.get(request.params.id);
  if (!round)
    return response
      .status(404)
      .json({ message: "This round has expired. Start a new round." });
  const index = request.body?.index;
  if (!Number.isInteger(index) || !round.dle.characters[index])
    return response
      .status(400)
      .json({ message: "Choose a character from the list." });
  if (round.guesses.some((guess) => guess.index === index))
    return response.json(publicRound(request.params.id, round));
  if (round.guesses.some((guess) => guess.index === round.answer))
    return response
      .status(400)
      .json({ message: "You already solved this round." });
  const character = round.dle.characters[index];
  const answer = round.dle.characters[round.answer];
  const cells = character.flatMap((value, column) =>
    column === round.dle.name_column ? [] : [compare(value, answer[column])],
  );
  round.guesses.unshift({
    index,
    name: character[round.dle.name_column],
    cells,
  });
  response.json(publicRound(request.params.id, round));
});

// Preserve the original learning endpoints.
app.use("/dles", (request, response) =>
  response.redirect(307, `/api/dles${request.url === "/" ? "" : request.url}`),
);
app.get("/api/health", async (_request, response) => {
  await pool.query("SELECT 1");
  response.json({ ready: true });
});
app.use("/api", (_request, response) =>
  response.status(404).json({ message: "This API route could not be found." }),
);

const directory = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.resolve(directory, "../dist")));
app.get("/{*path}", (_request, response) =>
  response.sendFile(path.resolve(directory, "../dist/index.html")),
);
app.use(
  (
    error: Error,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    console.error(error.message);
    if (error instanceof SyntaxError && "body" in error) {
      return response
        .status(400)
        .json({ message: "The request must contain valid JSON." });
    }
    response.status(500).json({
      message: "The server could not complete that request. Please try again.",
    });
  },
);

const cleanup = setInterval(
  () => {
    for (const [id, round] of rounds)
      if (Date.now() - round.created > 24 * 60 * 60 * 1000) rounds.delete(id);
  },
  60 * 60 * 1000,
);
cleanup.unref();

async function start() {
  await pool.query(`CREATE TABLE IF NOT EXISTS dles (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT NOT NULL,
    categories JSONB NOT NULL DEFAULT '[]', characters JSONB NOT NULL DEFAULT '[]')`);
  await pool.query(`ALTER TABLE dles
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS name_column INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  const port = Number(process.env.PORT) || 3001;
  app.listen(port, process.env.HOST || "0.0.0.0", (error?: Error) => {
    if (error) {
      console.error("Could not start the website:", error.message);
      process.exitCode = 1;
      void pool.end();
      return;
    }
    console.log(`DLEMaker running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Could not connect to PostgreSQL:", error.message);
  process.exitCode = 1;
  pool.end();
});
