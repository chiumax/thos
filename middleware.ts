import { NextRequest, NextResponse } from "next/server";

/** Check if an IP is localhost or in the Tailscale CGNAT range (100.64.0.0/10). */
function isAllowedIP(ip: string): boolean {
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (addr === "127.0.0.1" || addr === "::1" || addr === "localhost") return true;
  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  const first = parseInt(parts[0], 10);
  const second = parseInt(parts[1], 10);
  return first === 100 && second >= 64 && second <= 127;
}

export function middleware(req: NextRequest) {
  const ip = req.ip ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (!ip || isAllowedIP(ip)) return NextResponse.next();
  return new NextResponse("Forbidden", { status: 403 });
}
