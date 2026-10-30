// codegraph: page logout at /logout
import type { ActionFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

import { logOut } from "~/features/log-out.server";

export const action = async ({ request }: ActionFunctionArgs) =>
  logOut(request);

export const loader = async () => redirect("/");
