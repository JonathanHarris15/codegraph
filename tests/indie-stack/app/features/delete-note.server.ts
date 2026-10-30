// codegraph: feature delete-note in notes
// codegraph: uses notes, session
import { redirect } from "@remix-run/node";

import { deleteNote } from "~/models/note.server";
import { requireUserId } from "~/session.server";

// A person deletes one of their notes, and goes back to the list.
export async function deleteOne(request: Request, noteId: string) {
  const userId = await requireUserId(request);
  await deleteNote({ id: noteId, userId });
  return redirect("/notes");
}
