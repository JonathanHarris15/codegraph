# Terms

A term is one word a project uses for one thing, written down: what it means,
the words to avoid for it, the store whose records it is, and the terms those
records point at. A set-up repo keeps its terms one to a file in
`codegraph/terms/`, named for the term: `codegraph/terms/garment.md`. Together
with the repo's ADRs they are its part of the project's **ontology map**. There
is no `CONTEXT.md` in a set-up repo: the terms are the glossary.

## A term's file

Markdown with a YAML head. The head is what the check reads; the prose under it
is what the word means, for people and agents, and no rule is read from it.

```markdown
---
term: Garment
store: garments
points at:
  - term: Wardrobe
    how many: one
    says: the wardrobe it hangs in
  - term: Category
    how many: many
avoid: [item, piece, clothing]
settled by: [4]
---
One piece of clothing a person owns. A pair of socks is one garment.
```

- **term**: its name, as people say it. Capitalised as a name.
- **store**: the store whose records are this term, by its name in the code.
  Leave it out for a word that names no records, like *Waiting*.
- **points at**: the terms its records point at, each with **how many** (`one`,
  `none or one`, `many`) and the words for that wire. Write a link once, on the
  term whose records do the pointing: Outfit says it points at many Garments;
  Garment says nothing about outfits.
- **avoid**: the words people reach for that mean this term. Code may not be
  named with them.
- **settled by**: the numbers of the ADRs that decided it, in this repo.

The prose says what one of these *is*, in a sentence or two, plainly enough to
settle an argument: is a pair of socks one garment or two?

## Writing one

1. **Look first.** Read `codegraph/terms/` for a term that already means this
   thing, under its name or one of its avoid words. Change that one rather than
   adding another. Call the codegraph `map` tool to see the store, if there is
   one, and what its fields point at.
2. **Ask before naming.** The name is the person's call, not yours. Offer the
   word the code and the person already use; say which words you would avoid
   and why.
3. **Hold it to the code.** If it has a store, `points at` must match the
   store's shape: a field pointing at the other term's store, holding one or a
   list as it says. A term that says `one` needs a field every record has.
4. **Rename the code too.** A component, store, field or front-door name made
   of an avoid word is a mismatch. Rename it, or ask the person first when the
   rename reaches far.
5. **Check.** Call the codegraph `check` tool. A term is done when the check
   lists nothing about it.

## A term two repos share

A term used by more than one repo is defined in one of them and borrowed by the
rest, like an API contract.

- **Where it is defined**: in the repo that keeps its records, the one with its
  `store`. Where no repo does, the one the others call.
- **Borrowing it**: the other repo keeps a copy, written by codegraph's
  `borrow` tool, never by hand. Its head names where it came from and the commit it was taken at, and a
  `sum`, a fingerprint of the term as the defining repo wrote it:

  ```markdown
  ---
  term: Garment
  borrowed from: acme/wardrobe-api @ a1b2c3d
  sum: 9f2e41
  ...
  ```

- **Never edit a borrowed copy.** The check says when one has been touched, or
  when the term has changed in its defining repo since. Change the term there,
  commit it, then call `borrow` again.
- **Two repos defining the same word** is fine while neither reaches the other:
  the same word can mean two things in two systems. Once one calls the other, or
  they are one software system, one must borrow from the other.

A borrowed copy's own `store` and `points at` are held in its defining repo, not
here; its avoid words still hold here.
