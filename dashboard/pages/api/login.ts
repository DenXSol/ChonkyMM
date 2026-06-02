import { NextApiRequest, NextApiResponse } from "next";
import { serialize } from "cookie";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { password } = req.body;
  const correct = process.env.DASHBOARD_PASSWORD || "chonky";

  if (password !== correct) {
    return res.status(401).json({ error: "Invalid password" });
  }

  res.setHeader("Set-Cookie", serialize("mm_auth", password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  }));

  res.json({ success: true });
}
