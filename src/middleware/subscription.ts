import { Request, Response, NextFunction } from "express";
import prisma from "../lib/prisma.js";
import { AuthRequest } from "./auth.js";

/**
 * Middleware to check if the authenticated user has an active, non-expired subscription.
 * Used to gate the download endpoint (paywall).
 * Must be used AFTER authenticate middleware.
 */
export async function requireActiveSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = (req as AuthRequest).user;

  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId: user.id,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!activeSubscription) {
    res.status(402).json({
      error: "An active subscription is required to download.",
      code: "SUBSCRIPTION_REQUIRED",
    });
    return;
  }

  next();
}
