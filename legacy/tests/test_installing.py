# codegraph: test module installing
"""Installing codegraph in a repo: the settings that turn the plugin on for
everyone who opens it, the rules every agent there reads, and the drawn map
kept out of git. Run twice, it changes nothing the second time."""
from __future__ import annotations

import json
import unittest

from modules.installing import CONTEXT_BLOCK, PLUGIN, install_for_profile, install_in
from tests.helpers import Folder, tree

START, END = "<!-- codegraph:start -->", "<!-- codegraph:end -->"


class Installing(Folder):
    def settings(self) -> dict:
        return json.loads((self.root / ".claude/settings.json").read_text(encoding="utf-8"))

    def test_a_fresh_repo_gets_the_plugin_the_rules_and_the_ignore_line(self):
        done = install_in(self.root)
        self.assertEqual(done.problems, [])
        s = self.settings()
        self.assertIs(s["enabledPlugins"][PLUGIN], True)
        market = s["extraKnownMarketplaces"]["codegraph"]
        self.assertEqual(market["source"], {"source": "github", "repo": "JonathanHarris15/codegraph"})
        self.assertIs(market["autoUpdate"], True)
        rules = (self.root / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertIn(START, rules)
        self.assertIn("mcp__codegraph__check", rules)
        self.assertIn(".codegraph/", (self.root / ".gitignore").read_text(encoding="utf-8").splitlines())
        self.assertEqual(sorted(done.changed), [".claude/settings.json", ".gitignore", "CLAUDE.md"])

    def test_what_the_repo_already_has_is_kept(self):
        tree(self.root, {
            ".claude/settings.json": json.dumps({
                "permissions": {"allow": ["Bash(npm test)"]},
                "enabledPlugins": {"other@shop": True},
            }),
            "CLAUDE.md": "# my app\n\nUse tabs.\n",
            ".gitignore": "node_modules/\n",
        })
        install_in(self.root)
        s = self.settings()
        self.assertEqual(s["permissions"], {"allow": ["Bash(npm test)"]})
        self.assertEqual(s["enabledPlugins"], {"other@shop": True, PLUGIN: True})
        rules = (self.root / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertTrue(rules.startswith("# my app\n\nUse tabs.\n"))
        self.assertIn(START, rules)
        self.assertEqual((self.root / ".gitignore").read_text(encoding="utf-8"), "node_modules/\n.codegraph/\n")

    def test_an_old_block_is_replaced_where_it_stands(self):
        tree(self.root, {"CLAUDE.md": "# top\n\n{}\nold rules\n{}\n\n# bottom\n".format(START, END)})
        install_in(self.root)
        rules = (self.root / "CLAUDE.md").read_text(encoding="utf-8")
        self.assertNotIn("old rules", rules)
        self.assertTrue(rules.startswith("# top\n\n" + START))
        self.assertTrue(rules.endswith(END + "\n\n# bottom\n"))
        self.assertEqual(rules.count(START), 1)

    def test_a_repo_that_keeps_its_rules_in_agents_md_gets_them_there(self):
        tree(self.root, {"AGENTS.md": "# agents\n"})
        done = install_in(self.root)
        self.assertIn(START, (self.root / "AGENTS.md").read_text(encoding="utf-8"))
        self.assertFalse((self.root / "CLAUDE.md").exists())
        self.assertIn("AGENTS.md", done.changed)

    def test_installing_twice_changes_nothing_the_second_time(self):
        install_in(self.root)
        before = {p: (self.root / p).read_text(encoding="utf-8")
                  for p in (".claude/settings.json", "CLAUDE.md", ".gitignore")}
        again = install_in(self.root)
        self.assertEqual(again.changed, [])
        for p, text in before.items():
            self.assertEqual((self.root / p).read_text(encoding="utf-8"), text)

    def test_settings_it_cannot_read_are_left_alone_and_said(self):
        tree(self.root, {".claude/settings.json": "{ not json"})
        done = install_in(self.root)
        self.assertEqual((self.root / ".claude/settings.json").read_text(encoding="utf-8"), "{ not json")
        self.assertTrue(any(".claude/settings.json" in p for p in done.problems))
        self.assertIn("CLAUDE.md", done.changed)

    def test_a_marketplace_the_repo_already_names_is_kept(self):
        mine = {"source": {"source": "github", "repo": "someone/codegraph-fork"}}
        tree(self.root, {".claude/settings.json": json.dumps({"extraKnownMarketplaces": {"codegraph": mine}})})
        install_in(self.root)
        self.assertEqual(self.settings()["extraKnownMarketplaces"]["codegraph"], mine)
        self.assertIs(self.settings()["enabledPlugins"][PLUGIN], True)

    def test_the_block_is_the_one_setup_writes(self):
        self.assertTrue(CONTEXT_BLOCK.startswith(START))
        self.assertTrue(CONTEXT_BLOCK.rstrip().endswith(END))


class ForTheProfile(Folder):
    """Codegraph turned on once, in a person's own Claude settings, for every
    project they open."""

    def test_the_profile_gets_the_plugin_and_keeps_its_other_settings(self):
        path = self.root / "settings.json"
        path.write_text(json.dumps({"model": "opus", "enabledPlugins": {"other@shop": False}}), encoding="utf-8")
        done = install_for_profile(path)
        s = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(done.changed, [str(path)])
        self.assertEqual(s["model"], "opus")
        self.assertEqual(s["enabledPlugins"], {"other@shop": False, PLUGIN: True})
        self.assertEqual(s["extraKnownMarketplaces"]["codegraph"]["source"]["repo"], "JonathanHarris15/codegraph")
        self.assertEqual(install_for_profile(path).changed, [])

    def test_a_profile_with_no_settings_yet_gets_them(self):
        path = self.root / "fresh/settings.json"
        install_for_profile(path)
        self.assertIs(json.loads(path.read_text(encoding="utf-8"))["enabledPlugins"][PLUGIN], True)

    def test_a_copy_of_codegraph_added_from_a_folder_keeps_its_folder(self):
        path = self.root / "settings.json"
        mine = {"source": {"source": "directory", "path": "/dev/codegraph"}}
        path.write_text(json.dumps({"extraKnownMarketplaces": {"codegraph": mine}}), encoding="utf-8")
        install_for_profile(path)
        self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["extraKnownMarketplaces"]["codegraph"], mine)


if __name__ == "__main__":
    unittest.main()
