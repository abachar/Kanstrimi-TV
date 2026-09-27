import { Hono } from "hono";
import { recentLogs } from "@/sync";
import { page } from "../http";
import { LogsView } from "./view";

export const logsRoutes = new Hono();

logsRoutes.get("/logs", async (c) => page(c, "Journaux", <LogsView logs={await recentLogs(100)} />));
