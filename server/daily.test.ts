import test from "node:test";
import assert from "node:assert/strict";
import { dailyClock, shiftDay, consecutiveStreak } from "./daily.js";

test("daily dates and reset boundaries follow Israel time throughout the year", () => {
  for (let n = 0; n < 365; n++) {
    const now = new Date(Date.UTC(2026, 0, 1 + n, 12));
    const clock = dailyClock(now);
    const reset = Date.parse(clock.resetAt);
    assert.ok(reset > now.getTime());
    assert.equal(dailyClock(new Date(reset - 1)).date, clock.date);
    assert.equal(dailyClock(new Date(reset)).date, shiftDay(clock.date, 1));
  }
});

test("streak stays active until a full day is missed", () => {
  const wins = ["2026-11-23", "2026-11-24"];
  assert.deepEqual(consecutiveStreak(wins, "2026-11-24"), {
    streak: 2,
    completedToday: true,
  });
  assert.deepEqual(consecutiveStreak(wins, "2026-11-25"), {
    streak: 2,
    completedToday: false,
  });
  assert.deepEqual(consecutiveStreak(wins, "2026-11-26"), {
    streak: 0,
    completedToday: false,
  });
  assert.deepEqual(consecutiveStreak([...wins, "2026-11-26"], "2026-11-26"), {
    streak: 1,
    completedToday: true,
  });
});

test("duplicate wins and future dates cannot increase today's streak", () => {
  assert.deepEqual(
    consecutiveStreak(
      ["2026-11-24", "2026-11-25", "2026-11-25", "2026-11-27"],
      "2026-11-25",
    ),
    { streak: 2, completedToday: true },
  );
  assert.deepEqual(consecutiveStreak([], "2026-11-25"), {
    streak: 0,
    completedToday: false,
  });
});

test("streaks cross month, year, and leap-day boundaries", () => {
  assert.equal(
    consecutiveStreak(["2024-02-28", "2024-02-29", "2024-03-01"], "2024-03-01")
      .streak,
    3,
  );
  assert.equal(
    consecutiveStreak(["2025-12-31", "2026-01-01"], "2026-01-01").streak,
    2,
  );
  assert.equal(shiftDay("2024-03-01", -1), "2024-02-29");
});
