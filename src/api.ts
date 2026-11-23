import { auth } from "./firebase";

export type Dle = {
  id: number;
  name: string;
  description: string;
  categories: string[];
  characters: string[][];
  name_column: number;
};

export type DleSummary = Omit<Dle, "characters"> & {
  character_count: number;
  updated_at: string;
};

export type Round = {
  id: string;
  dleId: number;
  name: string;
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
};

export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  const token = await auth.currentUser?.getIdToken();
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
