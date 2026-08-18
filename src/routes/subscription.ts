import { Router, Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import prisma from "../lib/prisma.js";
import { config } from "../config.js";
import { authenticate, AuthRequest } from "../middleware/auth.js";

const router = Router();

// Initialize Razorpay instance
function getRazorpayInstance(): Razorpay {
  return new Razorpay({
    key_id: config.razorpayKeyId,
    key_secret: config.razorpayKeySecret,
  });
}

// ─── POST /api/subscription/create-order ────────────────────────────────────
router.post(
  "/create-order",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { planType } = req.body;

      if (!planType || !["monthly", "half-yearly", "yearly"].includes(planType)) {
        res.status(400).json({ error: "Invalid planType" });
        return;
      }

      // Get plan price from DB
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { planType },
      });

      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      // Create Razorpay order (amount in paise)
      const razorpay = getRazorpayInstance();
      const amountInPaise = Math.round(Number(plan.priceInr) * 100);

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `chunkit_${planType}_${Date.now()}`,
        notes: {
          userId: (req as AuthRequest).user!.id,
          planType,
        },
      });

      res.json({
        orderId: order.id,
        amount: amountInPaise,
        currency: "INR",
        keyId: config.razorpayKeyId,
        planType,
        priceInr: Number(plan.priceInr),
      });
    } catch (err) {
      console.error("Create order error:", err);
      res.status(500).json({ error: "Failed to create order" });
    }
  },
);

// ─── POST /api/subscription/verify-payment ──────────────────────────────────
router.post(
  "/verify-payment",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planType } =
        req.body;

      if (
        !razorpay_order_id ||
        !razorpay_payment_id ||
        !razorpay_signature ||
        !planType
      ) {
        res.status(400).json({
          error:
            "razorpay_order_id, razorpay_payment_id, razorpay_signature, and planType are required",
        });
        return;
      }

      // HMAC signature verification (critical — never trust frontend-only)
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", config.razorpayKeySecret)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        res.status(400).json({ error: "Payment verification failed — invalid signature" });
        return;
      }

      // Get plan details
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { planType },
      });

      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      const userId = (req as AuthRequest).user!.id;
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

      // Insert subscription row
      const subscription = await prisma.subscription.create({
        data: {
          userId,
          planType,
          amountPaid: plan.priceInr,
          razorpayOrderId: razorpay_order_id,
          razorpayPaymentId: razorpay_payment_id,
          status: "active",
          startedAt: now,
          expiresAt,
        },
      });

      res.json({
        message: "Payment verified and subscription activated",
        subscription: {
          id: subscription.id,
          planType: subscription.planType,
          status: subscription.status,
          startedAt: subscription.startedAt,
          expiresAt: subscription.expiresAt,
        },
      });
    } catch (err) {
      console.error("Verify payment error:", err);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  },
);

// ─── POST /api/webhooks/razorpay ────────────────────────────────────────────
// Backup webhook for payment.captured events
router.post(
  "/webhooks/razorpay",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const webhookSignature = req.headers["x-razorpay-signature"] as string;

      if (!webhookSignature) {
        res.status(400).json({ error: "Missing webhook signature" });
        return;
      }

      // Verify webhook signature
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac("sha256", config.razorpayWebhookSecret)
        .update(body)
        .digest("hex");

      if (expectedSignature !== webhookSignature) {
        res.status(400).json({ error: "Invalid webhook signature" });
        return;
      }

      const event = req.body.event;
      const payload = req.body.payload;

      if (event === "payment.captured") {
        const payment = payload.payment.entity;
        const orderId = payment.order_id;
        const paymentId = payment.id;

        // Check if we already processed this payment
        const existing = await prisma.subscription.findFirst({
          where: { razorpayPaymentId: paymentId },
        });

        if (!existing) {
          // Try to find the subscription by order ID and update it
          const subscription = await prisma.subscription.findFirst({
            where: { razorpayOrderId: orderId },
          });

          if (subscription) {
            await prisma.subscription.update({
              where: { id: subscription.id },
              data: {
                razorpayPaymentId: paymentId,
                status: "active",
              },
            });
            console.log(`✅ Webhook: Updated subscription for order ${orderId}`);
          } else {
            console.log(
              `⚠️  Webhook: No subscription found for order ${orderId} — may have been created via verify-payment`,
            );
          }
        }
      }

      res.json({ status: "ok" });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  },
);

export default router;
