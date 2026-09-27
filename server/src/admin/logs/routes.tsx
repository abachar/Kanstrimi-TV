import { Hono } from "hono";
import { recentLogs } from "@/catalog";
import { page } from "../http";
import { LogsView } from "./view";

export const logsRoutes = new Hono();

logsRoutes.get("/", async (c) => page(c, "Journaux", <LogsView logs={await recentLogs(100)} />));
