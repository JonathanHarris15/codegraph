# codegraph: test module shapes
"""Reading a schema's fields, whatever wrote it."""
from __future__ import annotations

import unittest

from modules import shapes


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
