---
name: terms
description: Terms — write, change, wire or borrow a word in a codegraph repo's codegraph/terms/. Use when a new thing needs a name, when the person says what a word means or that two words are one thing, when code is named with a word a term avoids, or when a word another repo defines is needed here.
---

# Terms

A term is the project's one word for one thing. In a repo with a `codegraph.config.json`, terms live one to a file in `codegraph/terms/`, never in `CONTEXT.md`.

1. **Get the rules.** Call the codegraph `instructions` tool with topic `terms`: the file's layout, how a term is held to its store, and how borrowing works.
2. **Find what is there.** Read `codegraph/terms/` for a term that already means this thing, under its name or an avoid word. Change it rather than add another.
3. **Settle the word with the person.** Offer the word the code and the person already use, and the words to avoid. The name is theirs to choose.
4. **Write it, and the code to match.** Write or change the file. Where it names records, its store and `points at` match the store's shape. Rename code named with an avoid word, asking first when the rename reaches far.
5. **Borrow, never copy.** For a term another repo of the project defines, call the codegraph `borrow` tool; call it again when the check says the copy is stale. Never edit a borrowed copy.
6. **Check.** Call the codegraph `check` tool.

Done when the term reads as the person would say it, and the check lists nothing about it or the names it governs.
