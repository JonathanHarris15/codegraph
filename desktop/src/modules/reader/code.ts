// codegraph: module reader
import { posix } from 'node:path'
import ts from 'typescript'

/** What one file's code says, as far as the reader can tell. */
export type FileCode = {
  names: string[]
  /** What it imports, by the words it uses and the line it does it on, and
   *  the names it takes: `default` for a default import, `*` for all. */
  imports: { from: string; line: number; names: string[] }[]
  /** Strings that look like an address in the app, for leads-to. */
  addresses: string[]
}

const SCRIPT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/i

const kindOf = (path: string): ts.ScriptKind =>
  /\.tsx$/i.test(path) ? ts.ScriptKind.TSX : /\.jsx$/i.test(path) ? ts.ScriptKind.JSX : /\.(js|mjs|cjs)$/i.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS

/** Only TypeScript and JavaScript are read for now; other files still count
 *  by their tags, with no names inside. */
export const readCode = (path: string, text: string): FileCode => {
  const code: FileCode = { names: [], imports: [], addresses: [] }
  if (!SCRIPT.test(path)) return code
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, kindOf(path))
  const lineOf = (node: ts.Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1

  for (const statement of file.statements) {
    if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      code.names.push(statement.name.text)
    else if (ts.isVariableStatement(statement))
      for (const declared of statement.declarationList.declarations)
        if (ts.isIdentifier(declared.name)) code.names.push(declared.name.text)

    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    )
      code.imports.push({ from: statement.moduleSpecifier.text, line: lineOf(statement), names: takenBy(statement) })
  }

  // A statement's own first line, so a require deep in a file reports the
  // line a person would write its wire's words on, as an import does.
  const isStatement = (node: ts.Node): boolean =>
    node.kind >= ts.SyntaxKind.FirstStatement && node.kind <= ts.SyntaxKind.LastStatement
  const bound = new Set<ts.Node>()
  const walk = (node: ts.Node, at: number): void => {
    const line = isStatement(node) ? lineOf(node) : at
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^\/[\w\-/:]*$/.test(node.text))
      code.addresses.push(node.text)
    // An address built as it runs, `/notes/${id}`, stands for any value there.
    if (ts.isTemplateExpression(node)) {
      const built = node.head.text + node.templateSpans.map((span) => ':any' + span.literal.text).join('')
      if (/^\/[\w\-/:]*$/.test(built)) code.addresses.push(built)
    }
    // `const { a } = require('./m')` reaches the same way an import does, and
    // takes the names it picks out; the module whole is `*`.
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const call = ts.isAwaitExpression(node.initializer) ? node.initializer.expression : node.initializer
      const from = asksFor(call)
      if (from) {
        bound.add(call)
        code.imports.push({ from, line, names: pickedOut(node.name) })
      }
    }
    const from = asksFor(node)
    if (from && !bound.has(node)) code.imports.push({ from, line, names: ['*'] })
    node.forEachChild((child) => walk(child, line))
  }
  walk(file, 1)
  return code
}

/** What a `require('…')` or an `import('…')` reaches, where its address is
 *  written out. A container written in CommonJS makes its wires this way, and
 *  the reader must see them, or nothing a tag says could match (ADR 0008). */
const asksFor = (node: ts.Node): string | null => {
  if (!ts.isCallExpression(node)) return null
  const called = node.expression
  const asks = (ts.isIdentifier(called) && called.text === 'require') || called.kind === ts.SyntaxKind.ImportKeyword
  const [first] = node.arguments
  return asks && first && ts.isStringLiteral(first) ? first.text : null
}

/** The names a require picks out of what it reaches, or `*` for the whole of
 *  it, which is held to no front door. */
const pickedOut = (name: ts.BindingName): string[] => {
  if (!ts.isObjectBindingPattern(name)) return ['*']
  return name.elements.map((element) => {
    const taken = element.propertyName ?? element.name
    return !element.dotDotDotToken && ts.isIdentifier(taken) ? taken.text : '*'
  })
}

/** The names an import or re-export takes from the file it reaches. */
const takenBy = (statement: ts.ImportDeclaration | ts.ExportDeclaration): string[] => {
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause
    if (!clause) return ['*']
    return ts.isNamedExports(clause) ? clause.elements.map((e) => (e.propertyName ?? e.name).text) : ['*']
  }
  const clause = statement.importClause
  if (!clause) return []
  const names = clause.name ? ['default'] : []
  const bound = clause.namedBindings
  if (bound && ts.isNamespaceImport(bound)) names.push('*')
  else if (bound) names.push(...bound.elements.map((e) => (e.propertyName ?? e.name).text))
  return names
}

/** Path aliases a repo's tsconfig sets, like `~/*` to `./app/*`. */
export type Aliases = { prefix: string; to: string[] }[]

export const readAliases = (text: string | undefined): Aliases => {
  if (!text) return []
  const parsed = ts.parseConfigFileTextToJson('tsconfig.json', text).config as
    | { compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }
    | undefined
  const options = parsed?.compilerOptions ?? {}
  const base = options.baseUrl ?? '.'
  return Object.entries(options.paths ?? {}).map(([pattern, targets]) => ({
    prefix: pattern.replace(/\*$/, ''),
    to: targets.map((target) => posix.normalize(posix.join(base, target.replace(/\*$/, '')))),
  }))
}

const ENDINGS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx']

/** The file an import reaches, if it is one in this repo. */
export const resolveImport = (
  from: string,
  specifier: string,
  files: Set<string>,
  aliases: Aliases,
): string | null => {
  const bases: string[] = []
  if (specifier.startsWith('.')) bases.push(posix.normalize(posix.join(posix.dirname(from), specifier)))
  else
    for (const alias of aliases)
      if (alias.prefix && specifier.startsWith(alias.prefix))
        for (const to of alias.to) bases.push(posix.normalize(posix.join(to, specifier.slice(alias.prefix.length))))

  for (const base of bases) {
    const plain = base.replace(/^\.\//, '')
    const tries = [plain, plain.replace(/\.(m|c)?js$/, '')]
    for (const tried of tries) for (const ending of ENDINGS) if (files.has(tried + ending)) return tried + ending
  }
  return null
}
