import express from "express";
import cors from "cors";
import pg from "pg";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { requireUser } from "./auth.js";
import { validateDle, compare, publicRound } from "./game.js";
import type { Dle, Round } from "./game.js";
import { registerDailyRoutes, initializeDailySchema } from "./daily.js";

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

const rounds = new Map<string, Round>();
registerDailyRoutes(app, pool);

app.get("/api/dles", async (_request, response) => {
  const result =
    await pool.query(`SELECT id, name, description, categories, name_column, creator_name,
    (SELECT count(*)::int FROM jsonb_array_elements(characters) AS roster(row)
      WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(roster.row) AS cell(value)
        WHERE trim(cell.value) <> '')) AS character_count,
    updated_at FROM dles ORDER BY updated_at DESC, id DESC`);
  response.set(
    "Cache-Control",
    "public, max-age=30, stale-while-revalidate=60",
  );
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
    `INSERT INTO dles (name, description, categories, characters, name_column, creator_uid, creator_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, creator_name`,
    [
      data.name,
      data.description,
      JSON.stringify(data.categories),
      JSON.stringify(data.characters),
      data.name_column,
      response.locals.user.uid,
      typeof response.locals.user.name === "string" &&
      response.locals.user.name.trim()
        ? response.locals.user.name.trim().slice(0, 100)
        : "DLE creator",
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
    characters = $4, name_column = $5, updated_at = NOW() WHERE id = $6 RETURNING id, name, creator_name`,
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
const frontendDirectory = path.resolve(directory, "../dist");
const frontendEntry = path.join(frontendDirectory, "index.html");
if (existsSync(frontendEntry)) {
  app.use(express.static(frontendDirectory));
  app.get("/{*path}", (_request, response) => response.sendFile(frontendEntry));
} else {
  app.get("/", (_request, response) =>
    response.json({
      service: "DLEMaker API",
      website: "https://dlemaker.web.app",
    }),
  );
}
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
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS creator_uid TEXT,
    ADD COLUMN IF NOT EXISTS creator_name TEXT`);
  await initializeDailySchema(pool);
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
