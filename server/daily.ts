import type { Express, Response } from "express";
import type { Pool, PoolClient } from "pg";
import { randomInt } from "node:crypto";
import { requireUser } from "./auth.js";
import { compare, publicRound, validateDle } from "./game.js";
import type { Dle, Guess } from "./game.js";

export const dailyTimeZone = "Asia/Jerusalem";
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: dailyTimeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function dailyClock(now = new Date()) {
  const parts = Object.fromEntries(
    dateFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrow = shiftDay(date, 1);
  const target = Date.parse(`${tomorrow}T00:00:00Z`);
  let reset = target;
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(
      dateFormatter
        .formatToParts(new Date(reset))
        .map((part) => [part.type, part.value]),
    );
    const wall = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    reset += target - wall;
  }
  return {
    date,
    timeZone: dailyTimeZone,
    resetAt: new Date(reset).toISOString(),
  };
}
export function consecutiveStreak(completed: string[], today: string) {
  const days = new Set(completed);
  let expected = days.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (days.has(expected)) {
    streak++;
    expected = shiftDay(expected, -1);
  }
  return { streak, completedToday: days.has(today) };
}

export async function initializeDailySchema(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_challenges (
    challenge_date DATE PRIMARY KEY, dle_id INTEGER NOT NULL,
    snapshot JSONB NOT NULL, answer_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS daily_progress (
    user_uid TEXT NOT NULL, challenge_date DATE NOT NULL REFERENCES daily_challenges(challenge_date),
    guesses JSONB NOT NULL DEFAULT '[]', won BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    PRIMARY KEY (user_uid, challenge_date)
  )`);
}

type Challenge = { snapshot: Dle; answer_index: number };
type Progress = { guesses: Guess[]; won: boolean };
class DailyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function registerDailyRoutes(
  app: Express,
  pool: Pool,
  now: () => Date = () => new Date(),
) {
  async function challenge(date: string): Promise<Challenge> {
    const existing = await pool.query(
      "SELECT snapshot, answer_index FROM daily_challenges WHERE challenge_date=$1",
      [date],
    );
    if (existing.rows[0]) return existing.rows[0];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // A single shared snapshot and answer, even when several people arrive together.
      await client.query("SELECT pg_advisory_xact_lock(410625, hashtext($1))", [
        date,
      ]);
      const saved = await client.query(
        "SELECT snapshot, answer_index FROM daily_challenges WHERE challenge_date=$1",
        [date],
      );
      if (saved.rows[0]) {
        await client.query("COMMIT");
        return saved.rows[0];
      }
      const candidates = await client.query(
        "SELECT * FROM dles ORDER BY random()",
      );
      let selected: Dle | undefined;
      for (const row of candidates.rows) {
        const { data } = validateDle(row);
        if (data) {
          selected = { ...data, id: row.id, creator_name: row.creator_name };
          break;
        }
      }
      if (!selected)
        throw new DailyError(
          503,
          "No complete DLEs are available for the daily challenge yet.",
        );
      const answer = randomInt(selected.characters.length);
      await client.query(
        "INSERT INTO daily_challenges (challenge_date,dle_id,snapshot,answer_index) VALUES ($1,$2,$3,$4)",
        [date, selected.id, JSON.stringify(selected), answer],
      );
      await client.query("COMMIT");
      return { snapshot: selected, answer_index: answer };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async function streak(
    uid: string,
    date: string,
    db: Pool | PoolClient = pool,
  ) {
    const result = await db.query(
      "SELECT challenge_date::text AS day FROM daily_progress WHERE user_uid=$1 AND won=TRUE AND challenge_date <= $2 ORDER BY challenge_date DESC",
      [uid, date],
    );
    return consecutiveStreak(
      result.rows.map((row) => row.day),
      date,
    );
  }

  async function view(
    uid: string,
    clock: ReturnType<typeof dailyClock>,
    selected: Challenge,
    progress: Progress,
    db: Pool | PoolClient = pool,
  ) {
    return {
      ...publicRound(`daily-${clock.date}`, {
        dle: selected.snapshot,
        answer: selected.answer_index,
        guesses: progress.guesses,
        created: 0,
      }),
      daily: { ...clock, ...(await streak(uid, clock.date, db)) },
    };
  }

  function failure(error: unknown, response: Response) {
    if (error instanceof DailyError)
      return response.status(error.status).json({ message: error.message });
    console.error(
      "Daily challenge failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    response
      .status(500)
      .json({
        message: "Could not load the daily challenge. Please try again.",
      });
  }

  app.get("/api/daily", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    try {
      const clock = dailyClock(now());
      const { snapshot } = await challenge(clock.date);
      response.json({
        ...clock,
        name: snapshot.name,
        creator_name: snapshot.creator_name,
        character_count: snapshot.characters.length,
      });
    } catch (error) {
      failure(error, response);
    }
  });

  app.get("/api/daily/streak", requireUser, async (_request, response) => {
    try {
      const clock = dailyClock(now());
      response.json({
        ...clock,
        ...(await streak(response.locals.user.uid, clock.date)),
      });
    } catch (error) {
      failure(error, response);
    }
  });

  app.get("/api/daily/round", requireUser, async (_request, response) => {
    try {
      const clock = dailyClock(now());
      const selected = await challenge(clock.date);
      const saved = await pool.query(
        "SELECT guesses,won FROM daily_progress WHERE user_uid=$1 AND challenge_date=$2",
        [response.locals.user.uid, clock.date],
      );
      response.json(
        await view(
          response.locals.user.uid,
          clock,
          selected,
          saved.rows[0] ?? { guesses: [], won: false },
        ),
      );
    } catch (error) {
      failure(error, response);
    }
  });

  app.post("/api/daily/guesses", requireUser, async (request, response) => {
    const clock = dailyClock(now());
    if (request.body?.date !== clock.date)
      return response
        .status(409)
        .json({ message: "A new daily DLE is ready. Load today’s challenge." });
    let client: PoolClient | undefined;
    try {
      const selected = await challenge(clock.date);
      const index = request.body?.index;
      if (!Number.isInteger(index) || !selected.snapshot.characters[index])
        throw new DailyError(400, "Choose a character from the list.");
      const uid: string = response.locals.user.uid;
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO daily_progress (user_uid,challenge_date) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [uid, clock.date],
      );
      const saved = await client.query(
        "SELECT guesses,won FROM daily_progress WHERE user_uid=$1 AND challenge_date=$2 FOR UPDATE",
        [uid, clock.date],
      );
      const progress: Progress = saved.rows[0];
      if (
        !progress.won &&
        !progress.guesses.some((guess) => guess.index === index)
      ) {
        const dle = selected.snapshot;
        const character = dle.characters[index];
        progress.guesses.unshift({
          index,
          name: character[dle.name_column],
          cells: character.flatMap((value, column) =>
            column === dle.name_column
              ? []
              : [compare(value, dle.characters[selected.answer_index][column])],
          ),
        });
        progress.won = index === selected.answer_index;
        await client.query(
          "UPDATE daily_progress SET guesses=$3,won=$4,completed_at=CASE WHEN $4 THEN NOW() ELSE NULL END WHERE user_uid=$1 AND challenge_date=$2",
          [uid, clock.date, JSON.stringify(progress.guesses), progress.won],
        );
      }
      if (dailyClock(now()).date !== clock.date)
        throw new DailyError(
          409,
          "A new daily DLE is ready. Load today’s challenge.",
        );
      const result = await view(uid, clock, selected, progress, client);
      await client.query("COMMIT");
      response.json(result);
    } catch (error) {
      if (client) await client.query("ROLLBACK");
      failure(error, response);
    } finally {
      client?.release();
    }
  });
}
