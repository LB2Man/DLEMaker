import { useEffect, useState } from "react";
import { api } from "./api";
import type { DailyStatus } from "./api";

export function FlameIcon() {
  return (
    <svg
      className="flame-icon"
      width="22"
      height="24"
      viewBox="0 0 24 28"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 1c1 7 8 8 8 16a9 9 0 1 1-18 0c0-4 2-7 5-10 0 4 1 5 2 6 3-4 4-7 3-12Z"
        fill="#f58938"
      />
      <path
        d="M13 13c1 4 4 5 4 8a5 5 0 0 1-10 0c0-2 1-4 3-6 0 3 1 3 1 4 1-2 2-4 2-6Z"
        fill="#ffdc83"
      />
    </svg>
  );
}

export function DailyStreak() {
  const [status, setStatus] = useState<DailyStatus | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    let queued = false;
    async function refresh() {
      if (document.hidden) return;
      if (pending) {
        queued = true;
        return;
      }
      pending = true;
      clearTimeout(timer);
      try {
        const result = await api<DailyStatus>("/daily/streak");
        if (!active) return;
        setStatus(result);
        timer = setTimeout(
          () => void refresh(),
          Math.max(1000, Date.parse(result.resetAt) - Date.now() + 200),
        );
      } catch {
        if (active) timer = setTimeout(() => void refresh(), 60000);
      } finally {
        pending = false;
        if (queued && active) {
          queued = false;
          void refresh();
        }
      }
    }
    const update = () => void refresh();
    update();
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("daily-streak-updated", update);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("daily-streak-updated", update);
    };
  }, []);
  return (
    <a
      className={`daily-streak ${status?.streak ? "streak-active" : ""}`}
      href="/daily"
      aria-label={
        status
          ? `Daily streak: ${status.streak} ${status.streak === 1 ? "day" : "days"}`
          : "Open daily DLE; streak loading"
      }
      title={
        status?.completedToday
          ? "Daily complete. Come back tomorrow!"
          : "Solve today’s daily DLE to keep your streak."
      }
    >
      <FlameIcon />
      <span>{status?.streak ?? "…"}</span>
    </a>
  );
}

export function DailyCard() {
  return (
    <section className="daily-card" aria-labelledby="daily-heading">
      <div className="daily-card-icon">
        <FlameIcon />
      </div>
      <div>
        <h2 id="daily-heading">Daily DLE</h2>
        <p>A shared mystery every day. Solve it to build your streak.</p>
        <small>Resets at midnight, Israel time.</small>
      </div>
      <a className="button primary" href="/daily">
        Play today’s DLE <span aria-hidden="true">↗</span>
      </a>
    </section>
  );
}
