import { Router, type IRouter } from "express";
import healthRouter from "./health";
import ordersRouter from "./orders";
import eventsRouter from "./events";
import settingsRouter from "./settings";
import whatsappRouter from "./whatsapp";
import shiprocketRouter from "./shiprocket";
import emailRouter from "./email";
import checkoutsRouter from "./checkouts";

const router: IRouter = Router();

router.use(healthRouter);
router.use(eventsRouter);
router.use(ordersRouter);
router.use(settingsRouter);
router.use(whatsappRouter);
router.use(shiprocketRouter);
router.use(emailRouter);
router.use(checkoutsRouter);

export default router;
