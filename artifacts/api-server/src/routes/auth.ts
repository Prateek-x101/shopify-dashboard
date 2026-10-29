import { Router } from "express";
import { isPasswordSet, setPassword, verifyPassword, issueSession, clearSession, hasValidSession } from "../lib/auth";

const router = Router();

router.get("/auth/status", async (req, res) => {
  res.json({ passwordSet: await isPasswordSet(), loggedIn: await hasValidSession(req) });
});

// First run only: choose the dashboard password
router.post("/auth/setup", async (req, res) => {
  if (await isPasswordSet()) {
    res.status(400).json({ error: "Password already set" });
    return;
  }
  const password = String(req.body?.password ?? "");
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  await setPassword(password);
  await issueSession(res);
  res.json({ ok: true });
});

router.post("/auth/login", async (req, res) => {
  if (!(await verifyPassword(String(req.body?.password ?? "")))) {
    await new Promise((r) => setTimeout(r, 800));
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  await issueSession(res);
  res.json({ ok: true });
});

router.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.post("/auth/change-password", async (req, res) => {
  if (!(await hasValidSession(req)) || !(await verifyPassword(String(req.body?.current ?? "")))) {
    res.status(401).json({ error: "Current password is wrong" });
    return;
  }
  const next = String(req.body?.next ?? "");
  if (next.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  await setPassword(next);
  res.json({ ok: true });
});

export default router;
