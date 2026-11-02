# The map shows the code where you are looking

The map is read from the code at one point: by default the live folder,
unsaved and uncommitted changes included, so a person can watch an agent build
in real time; or any branch or commit, picked per software system. Looking at
a branch or commit reads it straight out of git and never touches the folder.

The alternative was to switch the folder over, as `git checkout` does, which is
simpler to read but would put a person's unsaved work at risk every time they
looked around. Supersedes 0001.
