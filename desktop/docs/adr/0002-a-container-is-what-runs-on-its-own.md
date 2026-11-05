# A container is what runs on its own

A container is C4's container: a part of a software system that runs on its
own — a browser app, a server, a database, a function, a command-line tool.
Modules, features, pages and triggers are kinds of component inside a
container, not containers themselves, and everything outside the project's
own repos is a shallow software system rather than an "external" container.

We considered making the containers the kinds of code (modules, features, UI,
triggers, external, database), which is what codegraph read before. It is
simpler and matches the old map, but it hides the one thing a newcomer most
needs to see: that a repo ships a website, some cloud functions and a
command-line tool as three separate things. It also gave outside services two
homes. The cost of C4's way is an extra level on small repos, which the
canvas can pass straight through where a level holds only one card.
