// codegraph: feature log-out in accounts
// codegraph: uses session
import { logout } from "~/session.server";

// A person logs out, and lands back on the start page.
export async function logOut(request: Request) {
  return logout(request);
}
