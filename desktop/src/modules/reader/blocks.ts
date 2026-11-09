// codegraph: module reader
import ts from 'typescript'

/** One value a UI block takes, read from its code (ADR 0024). */
export type UiOption = {
  name: string
  /** The type as the code writes it. */
  type: string
  /** The choices it has, where the code lists them: 'plain' | 'danger',
   *  or true and false. Empty for any other. */
  values: string[]
  optional: boolean
  /** What it is for, from the code's doc comment on it. */
  says: string
  /** What each choice means, from lines of that comment like `danger: only
   *  inside the danger zone`. */
  valueSays: Record<string, string>
}

/** A named situation a UI block can be in, rendered by an export of the
 *  states file beside it. */
export type UiState = {
  name: string
  file: string
  /** Its screenshot, where the repo's tests took one, as a data URL; ''
   *  when there is none or the map is not of the live folder. */
  shot: string
}

/** A named piece of screen that pages are built from, and the name a person
 *  points an agent at it by. It lives inside a component, at the code level. */
export type UiBlock = {
  name: string
  /** Where it is kept among the UI blocks, like forms/inputs; '' for the top. */
  folder: string
  file: string
  /** The id of the component it lives in. */
  component: string
  /** What it is for, from the code's doc comment on it. */
  says: string
  options: UiOption[]
  states: UiState[]
  /** Its own screenshot, as for a state. */
  shot: string
  /** Where it can be seen running, on its container's dev server; '' when
   *  the container names none. The live view adds `state` and `options`. */
  live: string
}

/** The page a set-up repo's dev server serves for codegraph's live view:
 *  `?name=<folder>/<Name>`, and `&state=<state>` or `&options=<JSON>`,
 *  renders that UI block so (ADR 0024). Setup writes it. */
export const LIVE_UI_BLOCK = '/__codegraph/ui-block'

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i

const kindOf = (path: string): ts.ScriptKind =>
  /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : /\.(js|mjs|cjs)$/i.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS

const docOf = (node: ts.Node): string =>
  ts
    .getJSDocCommentsAndTags(node)
    .filter(ts.isJSDoc)
    .map((doc) => ts.getTextOfJSDocComment(doc.comment) ?? '')
    .join('\n')
    .trim()

/** The members of the props a UI block takes, from a type written in place
 *  or one of the file's own types, by name. */
const membersOf = (type: ts.TypeNode | undefined, file: ts.SourceFile, seen = new Set<string>()): ts.TypeElement[] => {
  if (!type) return []
  if (ts.isTypeLiteralNode(type)) return [...type.members]
  if (ts.isIntersectionTypeNode(type)) return type.types.flatMap((t) => membersOf(t, file, seen))
  if (ts.isParenthesizedTypeNode(type)) return membersOf(type.type, file, seen)
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const name = type.typeName.text
    if (seen.has(name)) return []
    seen.add(name)
    for (const statement of file.statements) {
      if (ts.isInterfaceDeclaration(statement) && statement.name.text === name) return [...statement.members]
      if (ts.isTypeAliasDeclaration(statement) && statement.name.text === name) return membersOf(statement.type, file, seen)
    }
  }
  return []
}

const optionOf = (member: ts.TypeElement, file: ts.SourceFile): UiOption | null => {
  if (!ts.isPropertySignature(member) || !member.name) return null
  const name = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(file)
  const type = member.type
  const parts = type && ts.isUnionTypeNode(type) ? type.types : type ? [type] : []
  const literal = parts.every((p) => ts.isLiteralTypeNode(p) && (ts.isStringLiteral(p.literal) || ts.isNumericLiteral(p.literal)))
  const values =
    type?.kind === ts.SyntaxKind.BooleanKeyword
      ? ['true', 'false']
      : parts.length && literal
        ? parts.map((p) => ((p as ts.LiteralTypeNode).literal as ts.StringLiteral).text)
        : []
  const valueSays: Record<string, string> = {}
  const said: string[] = []
  for (const line of docOf(member).split('\n')) {
    const choice = line.match(/^\s*[-*]?\s*['"]?([\w-]+)['"]?\s*[:—–]\s+(.+)$/)
    if (choice && values.includes(choice[1]!)) valueSays[choice[1]!] = choice[2]!.trim()
    else if (line.trim()) said.push(line.trim())
  }
  return { name, type: type ? type.getText(file) : 'unknown', values, optional: Boolean(member.questionToken), says: said.join(' '), valueSays }
}

/** The props type of a function or arrow function: its first parameter's. */
const propsOf = (fn: ts.SignatureDeclarationBase | undefined): ts.TypeNode | undefined => fn?.parameters[0]?.type

/** What the code says of the UI block it declares by this name: what it is
 *  for and its options; null when the file has no such name. Only
 *  TypeScript and JavaScript are read; any other file's UI blocks are named
 *  but have no options. */
export const readUiBlock = (path: string, text: string, name: string): { says: string; options: UiOption[] } | null => {
  if (!SCRIPT.test(path)) return { says: '', options: [] }
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kindOf(path))
  for (const statement of file.statements) {
    let fn: ts.SignatureDeclarationBase | undefined
    let docAt: ts.Node = statement
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) fn = statement
    else if (ts.isClassDeclaration(statement) && statement.name?.text === name) return { says: docOf(statement), options: [] }
    else if (ts.isVariableStatement(statement)) {
      const declared = statement.declarationList.declarations.find((d) => ts.isIdentifier(d.name) && d.name.text === name)
      if (!declared) continue
      const init = declared.initializer
      fn = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? init : undefined
      // A component wrapped in memo or forwardRef: its options are the inner one's.
      if (!fn && init && ts.isCallExpression(init)) {
        const inner = init.arguments[0]
        fn = inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) ? inner : undefined
      }
      if (!fn) return { says: docOf(statement), options: [] }
      docAt = statement
    } else continue
    const options = membersOf(propsOf(fn), file)
      .map((m) => optionOf(m, file))
      .filter((o): o is UiOption => o !== null)
    return { says: docOf(docAt), options }
  }
  return null
}
