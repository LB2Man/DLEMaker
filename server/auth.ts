import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Request, Response, NextFunction } from "express";

const firebaseApp = initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || "dlemaker",
});
const firebaseAuth = getAuth(firebaseApp);

export async function requireUser(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  response.set("Cache-Control", "private, no-store");
  const authorization = request.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    response
      .status(401)
      .json({ message: "Sign in with Google to save or edit a DLE." });
    return;
  }

  try {
    // Verification checks the signature, expiry, issuer, and project audience.
    response.locals.user = await firebaseAuth.verifyIdToken(token);
  } catch {
    response.status(401).json({
      message: "Your login could not be verified. Sign in again and retry.",
    });
    return;
  }
  next();
}
