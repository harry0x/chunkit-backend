import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";

const router = Router();

// ─── GET /api/plans ─────────────────────────────────────────────────────────
// Public route — returns current prices for both plans
router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { durationDays: "asc" },
      select: {
        id: true,
        planType: true,
        priceInr: true,
        durationDays: true,
        features: true,
        isPopular: true,
        updatedAt: true,
      },
    });

    res.json({ plans });
  } catch (err) {
    console.error("Get plans error:", err);
    res.status(500).json({ error: "Failed to fetch plans" });
  }
});

export default router;
