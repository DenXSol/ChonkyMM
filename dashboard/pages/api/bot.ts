import { NextApiRequest, NextApiResponse } from "next";

const BOT_API_URL = process.env.BOT_API_URL!;
const API_SECRET = process.env.BOT_API_SECRET!;

async function proxyToBotApi(path: string, method: string, body?: any) {
  const res = await fetch(`${BOT_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": API_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      const data = await proxyToBotApi("/status", "GET");
      return res.json(data);
    }
    if (req.method === "POST") {
      const { type, ...body } = req.body;
      if (type === "control") {
        const data = await proxyToBotApi("/control", "POST", body);
        return res.json(data);
      }
      if (type === "settings") {
        const data = await proxyToBotApi("/settings", "POST", body);
        return res.json(data);
      }
    }
    res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: "Bot unreachable" });
  }
}
