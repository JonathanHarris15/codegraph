# codegraph: test module shapes
"""Reading a schema's fields, whatever wrote it."""
from __future__ import annotations

import unittest

from modules import shapes
from tests.helpers import Folder, tree


class Shapes(unittest.TestCase):
    """Reading a schema's fields, whatever wrote it."""

    def fields(self, rel: str, text: str, name: str | None = None) -> list:
        found = shapes.schemas_in(rel, text)
        return next(s for s in found if name is None or s.name == name).fields

    def test_a_dataclass_and_a_typed_dict(self):
        self.assertEqual(self.fields("a.py", "@dataclass\nclass A:\n    x: int\n    y: str = ''\n"),
                         [("x", "int"), ("y", "str")])
        self.assertEqual(self.fields("a.py", "class A(TypedDict):\n    x: list[int]\n"),
                         [("x", "list[int]")])

    def test_sqlalchemy_columns_and_the_table_they_map(self):
        found = shapes.schemas_in("m.py", (
            "class Member(Base):\n    __tablename__ = 'members'\n"
            "    id = Column(Integer, primary_key=True)\n    name: Mapped[str] = mapped_column()\n"))
        self.assertEqual((found[0].table, found[0].fields),
                         ("members", [("id", "Integer"), ("name", "str")]))

    def test_sql_create_table(self):
        self.assertEqual(self.fields("s.sql", "CREATE TABLE IF NOT EXISTS members (\n"
                                     "  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n"
                                     "  PRIMARY KEY (id)\n);"),
                         [("id", "INTEGER"), ("name", "TEXT")])

    def test_typescript_interfaces_types_and_zod(self):
        src = ("export interface Member { id: number; name?: string; onJoin: () => void }\n"
               "type Service = {\n  date: Date,\n  hymns: string[]\n}\n"
               "const Paid = z.object({ amount: z.number(), note: z.string().optional() })\n")
        self.assertEqual(self.fields("t.ts", src, "Member"),
                         [("id", "number"), ("name", "string"), ("onJoin", "() => void")])
        self.assertEqual(self.fields("t.ts", src, "Service"), [("date", "Date"), ("hymns", "string[]")])
        self.assertEqual(self.fields("t.ts", src, "Paid"), [("amount", "number"), ("note", "string")])

    def test_prisma(self):
        found = shapes.schemas_in("schema.prisma", 'model Member {\n  id Int @id\n  name String\n'
                                  '  @@map("members")\n}\n')
        self.assertEqual((found[0].table, found[0].fields),
                         ("members", [("id", "Int"), ("name", "String")]))

    def test_a_store_finds_its_schema_singular_or_plural(self):
        found = shapes.schemas_in("a.py", "class Member(BaseModel):\n    x: int\n")
        self.assertEqual(shapes.find(found, "members").name, "Member")
        self.assertIsNone(shapes.find(found, "services"))
        self.assertIsNone(shapes.find(found, "member", exact=True))


class Helpers(Folder):
    """A module's own answer to what its store holds (docs/adr/0006)."""

    def helper(self, source: str, store: str = "sales", timeout: float = 30):
        tree(self.root, {"shape.py": source})
        return shapes.helper_shape(self.root, "shape.py", store, timeout=timeout)

    def test_a_helper_reports_the_shape_it_works_out_while_it_runs(self):
        found, why = self.helper(
            "import json\n"
            "print(json.dumps({'name': 'Sale', 'fields': {'saleNo': 'text', 'acres': 'number'}}))\n")
        self.assertEqual(why, "")
        self.assertEqual((found.name, found.lines()), ("Sale", ["saleNo: text", "acres: number"]))
        self.assertEqual((found.rel, found.table), ("shape.py", "sales"))

    def test_it_takes_pairs_too_and_keeps_their_order(self):
        found, _ = self.helper("print('[[\"b\", \"int\"], [\"a\", \"text\"]]')")
        self.assertEqual(found.lines(), ["b: int", "a: text"])

    def test_the_store_names_the_shape_when_the_helper_does_not(self):
        found, _ = self.helper('print(\'{"fields": {"x": "text"}}\')')
        self.assertEqual(found.name, "sales")

    def test_chatter_before_the_json_does_not_matter(self):
        found, _ = self.helper("import sys\n"
                               "print('reading the catalogue...')\n"
                               "print('{\"fields\": {\"x\": \"text\"}}')\n")
        self.assertEqual(found.lines(), ["x: text"])

    def test_a_helper_that_fails_says_why_and_reports_no_shape(self):
        found, why = self.helper("import sys\nsys.stderr.write('no credentials\\\\n')\nraise SystemExit(1)\n")
        self.assertIsNone(found)
        self.assertIn("no credentials", why)

    def test_a_helper_that_prints_nothing_useful(self):
        found, why = self.helper("print('all done')")
        self.assertIsNone(found)
        self.assertIn("JSON", why)

    def test_a_helper_that_never_finishes_is_given_up_on(self):
        found, why = self.helper("import time\ntime.sleep(30)\n", timeout=1)
        self.assertIsNone(found)
        self.assertIn("finish", why)

    def test_a_file_codegraph_cannot_run(self):
        tree(self.root, {"shape.rb": "puts 1\n"})
        found, why = shapes.helper_shape(self.root, "shape.rb", "sales")
        self.assertIsNone(found)
        self.assertIn(".rb", why)
