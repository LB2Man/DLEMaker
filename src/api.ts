import { auth } from "./firebase";

export type Dle = {
  id: number;
  name: string;
  description: string;
  categories: string[];
  characters: string[][];
  name_column: number;
  creator_name?: string | null;
};

export type DleSummary = Omit<Dle, "characters"> & {
  character_count: number;
  updated_at: string;
};

export type Round = {
  id: string;
  dleId: number;
  name: string;
  creator_name?: string | null;
  categories: string[];
  options: { index: number; name: string }[];
  guesses: {
    index: number;
    name: string;
    cells: {
      value: string;
      match: "correct" | "partial" | "incorrect";
      direction?: "higher" | "lower";
    }[];
  }[];
  won: boolean;
  answer: string | null;
  daily?: DailyStatus;
};

export type DailyStatus = {
  date: string;
  timeZone: string;
  resetAt: string;
  streak: number;
  completedToday: boolean;
};

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (options?.body) headers.set("Content-Type", "application/json");
  const needsLogin =
    url.startsWith("/daily/") ||
    (url === "/dles" ? options?.method === "POST" : /^\/dles\/\d+$/.test(url));
  const token = needsLogin ? await auth.currentUser?.getIdToken() : undefined;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const origin = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
  const response = await fetch(`${origin}/api${url}`, {
    ...options,
    headers,
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.message || "Something went wrong. Please try again.",
    );
  return result;
}

const gameListKey = "dlemaker-games-v1";
export function cachedGames(): DleSummary[] | null {
  try {
    const saved = JSON.parse(localStorage.getItem(gameListKey) || "null");
    if (
      saved &&
      Date.now() - saved.time < 24 * 60 * 60 * 1000 &&
      Array.isArray(saved.games) &&
      saved.games.every(
        (game: DleSummary) =>
          typeof game.id === "number" &&
          typeof game.name === "string" &&
          Array.isArray(game.categories),
      )
    )
      return saved.games;
  } catch {
    /* A missing cache falls back to the API. */
  }
  return null;
}
export function storeGames(games: DleSummary[]) {
  try {
    localStorage.setItem(
      gameListKey,
      JSON.stringify({ time: Date.now(), games }),
    );
  } catch {
    /* Browsing works without storage. */
  }
}
export function clearGameCache() {
  try {
    localStorage.removeItem(gameListKey);
  } catch {
    /* Storage may be disabled. */
  }
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function palette(name: string) {
  return [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 5;
}
