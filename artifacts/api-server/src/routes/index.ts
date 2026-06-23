import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(ordersRouter);
router.use(settingsRouter);

export default router;
