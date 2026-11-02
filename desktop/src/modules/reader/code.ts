// codegraph: module reader
import { posix } from 'node:path'
import ts from 'typescript'

/** What one file's code says, as far as the reader can tell. */
export type FileCode = {
  names: string[]
  /** What it imports, by the words it uses and the line it does it on. */
  imports: { from: string; line: number }[]
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
      code.imports.push({ from: statement.moduleSpecifier.text, line: lineOf(statement) })
  }

  const walk = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^\/[\w\-/:]*$/.test(node.text))
      code.addresses.push(node.text)
    node.forEachChild(walk)
  }
  walk(file)
  return code
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
