import { NextResponse } from "next/server";
import { GUEST_COOKIE } from "@/lib/guest-token";

// "Exit" on the guest banner: clear the guest cookie and go back to /login.
export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  res.cookies.set(GUEST_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
