import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import eventsRouter from "./events";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(ordersRouter);
router.use(settingsRouter);

export default router;
