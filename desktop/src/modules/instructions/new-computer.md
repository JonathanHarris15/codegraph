# A repo that is already set up, on a new computer

The repo has its `codegraph.config.json` and its tags already. What is
missing is this computer's side: the project knows the repo by its GitHub
address, but has no working copy of it here. The project's card in the app
says **no working copy here** on that repo's row. Nothing in the repo needs
to change.

## 1. See where it stands

Call `map` in the folder. Its second line says whether the folder is linked:

- **Linked on this computer as …**: nothing to do.
- **Not linked on this computer: … with no working copy here**: go to step 2.
- **… with its working copy at …**: another folder is already linked. Leave
  it unless the person says this folder should take over; then they pick it
  with **Link folder…** on the repo's row in the app.
- **… has no repo at …** or **No project on this computer is called …**:
  the project does not have this repo yet, or is not on this computer. That
  is the person's to add, with **+ Link a repo** on the project's card.
  Do not edit `projects.json` by hand.

## 2. Get a working copy and link it

- **No copy on this computer yet**: clone it, or ask the person to use
  **Clone here…** on the repo's row, which clones and links in one step. Put
  it beside the project's other repos, so the app can find it next time.
- **A copy is already here**: call `link` in its folder. It matches the
  folder to the project's repo by GitHub address and links it. It never adds
  a repo to a project, and never moves a link whose folder still exists.

The app also finds a copy by itself when it sits in a folder beside the
project's other repos, and offers **Link it** on the row.

## 3. Check

Call `map` again: it now says **Linked on this computer**. Tell the person
the row has their folder on it. The window updates the next time they come
back to it.
