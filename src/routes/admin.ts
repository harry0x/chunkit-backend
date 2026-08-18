import { Router, Request, Response } from "express";
import prisma from "../lib/prisma.js";
import { authenticate, requireAdmin } from "../middleware/auth.js";

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

// ─── GET /api/admin/users ───────────────────────────────────────────────────
router.get("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || "";
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          subscriptions: {
            where: {
              status: "active",
              expiresAt: { gt: new Date() },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              planType: true,
              status: true,
              expiresAt: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    // Flatten subscription info
    const usersWithMembership = users.map((u) => ({
      ...u,
      membership: u.subscriptions[0] || null,
      subscriptions: undefined,
    }));

    res.json({
      users: usersWithMembership,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Admin list users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ─── PATCH /api/admin/users/:id ─────────────────────────────────────────────
router.patch("/users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const fullName = req.body.fullName as string | undefined;
    const email = req.body.email as string | undefined;

    const data: Record<string, string> = {};
    if (fullName) data.fullName = fullName.trim();
    if (email) data.email = email.toLowerCase().trim();

    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
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
    console.error("Admin update user error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// ─── PATCH /api/admin/users/:id/status ──────────────────────────────────────
router.patch(
  "/users/:id/status",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const isActive = req.body.isActive as boolean;

      if (typeof isActive !== "boolean") {
        res.status(400).json({ error: "isActive must be a boolean" });
        return;
      }

      const updated = await prisma.user.update({
        where: { id },
        data: { isActive },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      const action = isActive ? "activated" : "deactivated";
      console.log(`👤 Admin ${action} user ${updated.email}`);

      res.json({ user: updated, message: `User ${action} successfully` });
    } catch (err) {
      console.error("Admin toggle user status error:", err);
      res.status(500).json({ error: "Failed to update user status" });
    }
  },
);

// ─── DELETE /api/admin/users/:id ────────────────────────────────────────────
router.delete("/users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    // Prevent self-deletion
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await prisma.user.delete({ where: { id } });
    console.log(`🗑️  Admin deleted user ${user.email}`);

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ─── GET /api/admin/subscriptions ───────────────────────────────────────────
router.get(
  "/subscriptions",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const planType = req.query.planType as string | undefined;
      const skip = (page - 1) * limit;

      const where = planType ? { planType } : {};

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
              },
            },
          },
        }),
        prisma.subscription.count({ where }),
      ]);

      res.json({
        subscriptions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("Admin list subscriptions error:", err);
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  },
);

// ─── PATCH /api/admin/plans/:planType ───────────────────────────────────────
router.patch(
  "/plans/:planType",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planType } = req.params;
      const { priceInr, features, isPopular } = req.body;

      if (!["monthly", "half-yearly", "yearly"].includes(planType as string)) {
        res.status(400).json({ error: "Invalid planType" });
        return;
      }

      const data: any = {};
      if (priceInr !== undefined) {
        if (typeof priceInr !== "number" || priceInr <= 0) {
          res.status(400).json({ error: "priceInr must be a positive number" });
          return;
        }
        data.priceInr = priceInr;
      }

      if (features !== undefined) {
        if (!Array.isArray(features)) {
          res.status(400).json({ error: "features must be an array of strings" });
          return;
        }
        data.features = features;
      }

      if (isPopular !== undefined) {
        if (typeof isPopular !== "boolean") {
          res.status(400).json({ error: "isPopular must be a boolean" });
          return;
        }
        data.isPopular = isPopular;

        // If making this plan popular, optionally make all others not popular
        if (isPopular) {
          await prisma.subscriptionPlan.updateMany({
            where: { planType: { not: planType } },
            data: { isPopular: false }
          });
        }
      }

      if (Object.keys(data).length === 0) {
        res.status(400).json({ error: "Nothing to update" });
        return;
      }

      const updated = await prisma.subscriptionPlan.update({
        where: { planType: planType as string },
        data,
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

      console.log(`💰 Admin updated ${planType} plan`);

      res.json({ plan: updated });
    } catch (err) {
      console.error("Admin update plan price error:", err);
      res.status(500).json({ error: "Failed to update plan price" });
    }
  },
);

export default router;
