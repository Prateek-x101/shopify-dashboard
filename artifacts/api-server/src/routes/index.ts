import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import webhooksRouter from "./webhooks";
import accountsRouter from "./accounts";
import ordersRouter from "./orders";
import checkoutsRouter from "./checkouts";
import messagesRouter from "./messages";
import automationsRouter from "./automations";
import systemRouter from "./system";
import analyticsRouter from "./analytics";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(webhooksRouter);
router.use(requireAuth);
router.use(accountsRouter);
router.use(ordersRouter);
router.use(checkoutsRouter);
router.use(messagesRouter);
router.use(automationsRouter);
router.use(systemRouter);
router.use(analyticsRouter);

export default router;
