import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import prisma from "../lib/prisma.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

// All user routes require authentication
router.use(authenticate);

// ─── GET /api/user/profile ──────────────────────────────────────────────────
router.get("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthRequest).user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Get latest active subscription
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        planType: true,
        amountPaid: true,
        status: true,
        startedAt: true,
        expiresAt: true,
      },
    });

    res.json({
      user,
      subscription: subscription || null,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── PATCH /api/user/profile ────────────────────────────────────────────────
router.patch("/profile", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const { fullName } = req.body;

    if (!fullName || fullName.trim().length === 0) {
      res.status(400).json({ error: "fullName is required" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { fullName: fullName.trim() },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ user: updated });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ─── PATCH /api/user/password ───────────────────────────────────────────────
router.patch("/password", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "currentPassword and newPassword are required" });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ error: "New password must be at least 6 characters" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }

    // Hash and update
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Update password error:", err);
    res.status(500).json({ error: "Failed to update password" });
  }
});

export default router;
