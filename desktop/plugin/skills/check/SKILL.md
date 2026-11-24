---
name: check
description: Check a codegraph repo and fix what it finds. Use before finishing any change in a repo with a codegraph.config.json, when the check fails, or when the person asks why the map shows something wrong, a tag is off, a rule is broken, or a term is out of date.
---

# Checking, and fixing what the check finds

1. **Run it.** Call the codegraph `check` tool on the repo. If the tool is missing, the codegraph MCP is not connected: say so rather than skip the check.
2. **Sort what it lists** by what each line is about, and get the rules for that kind:
   - tags, config, wires and stores: the codegraph `instructions` tool with topic `tags`;
   - a term, an avoid word or a borrowed copy: topic `terms`;
   - an ADR or a broken rule: topic `decisions`.
3. **Fix the code, never the rule, unless the person says so.** A broken rule means the code changes. When the rule itself looks wrong, say why and let the person decide; a change to a rule is a new decision through the `decide` skill. A borrowed term that has moved on is borrowed again by codegraph.
4. **Run it again** until nothing you added is listed.

Done when the check lists nothing you added, and anything left is named to the person with why it stays.
