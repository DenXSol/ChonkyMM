export interface ActivityEntry {
  timestamp: number;
  type: "rebalance" | "withdraw" | "deposit" | "harvest" | "sell_fill" | "buy_fill" | "pause" | "resume" | "alert" | "info";
  message: string;
  value?: string;
}

const activityFeed: ActivityEntry[] = [];
const MAX_ENTRIES = 100;

export function log(message: string, type: ActivityEntry["type"] = "info", value?: string) {
  const entry: ActivityEntry = {
    timestamp: Date.now(),
    type,
    message,
    value,
  };
  activityFeed.unshift(entry); // newest first
  if (activityFeed.length > MAX_ENTRIES) activityFeed.pop();
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export function getActivityFeed(): ActivityEntry[] {
  return activityFeed;
}
