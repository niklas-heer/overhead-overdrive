import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { createOnlineHandler } from "../server/online";
import { MemoryStore } from "../server/store";

if (process.env.VERCEL)
  throw new Error("The memory backend is for local development only.");
process.env.ONLINE_SESSION_SECRET ||= randomBytes(32).toString("hex");
process.env.ONLINE_DEV_ORIGIN ||= "http://localhost:5173";
const server = createServer(createOnlineHandler(new MemoryStore()));
server.listen(5174, "127.0.0.1", () =>
  console.log(
    "Online development API on 127.0.0.1:5174 (temporary in-memory records).",
  ),
);
