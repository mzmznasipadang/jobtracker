export { cn } from "cn"

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
