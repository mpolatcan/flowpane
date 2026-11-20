/**
 * Shell commands said in words: `git show HEAD:src/stores/config.ts | sed -n
 * '119p'` as `read the committed config.ts`.
 *
 * A command line says what ran, to a reader who reads shell. A pipeline's reader
 * is asking what the agent was doing, and a develop step's commands are mostly
 * the same six programs wrapped in markers and pipes, so a table of those
 * programs says most of them.
 *
 * This is the fallback. What an agent writes between its calls says why it ran
 * a command, which no table can, and the strip leads with that wherever there is
 * any. A table rather than a small model, because a model would bill every run
 * for a few dozen requests the reader did not ask for, and draw each line twice:
 * the command, then the words a second later.
 */

/** One description in the two tenses the pane needs: the strip's past, the sentence's present. */
export type Phrase = { past: string; ing: string }

const p = (past: string, ing: string): Phrase => ({ past, ing })

/** The steps of a command line: each step's first stage, as words, quotes taken off. */
function stepsOf(command: string): string[][] {
  const steps: string[][] = []
  let words: string[] = []
  let word = ''
  let quote: string | null = null
  let depth = 0
  // A stage after a pipe is filtering what the first one printed — `| tail -25`,
  // `| grep FAIL` — and says nothing about what the step did.
  let piped = false
  // The words that end the heredocs opened on this line. What comes between is
  // a script handed to the command — Python, a PR body — and read as shell it
  // said `ran import`.
  const heredocs: string[] = []
  // Inside a `case`, a step starts with a pattern — `CLAUDE.md|REVIEW.md)` —
  // whose bars are not pipes and whose words are not a command.
  let cases = 0
  let pattern = false

  const endWord = () => {
    if (word !== '' && !piped) {
      words.push(word)
    }

    if (word === 'esac') {
      cases = Math.max(0, cases - 1)
    }

    const opensCase = word === 'in' && words[0] === 'case'

    word = ''

    if (opensCase) {
      cases++
      endStep()
      pattern = true
    }
  }

  const endStep = () => {
    endWord()

    if (words.length > 0) {
      steps.push(words)
    }

    words = []
    piped = false
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    const next = command[i + 1]

    if (pattern && words.length === 0 && word === '' && !/\s/.test(ch)) {
      pattern = false

      if (ch !== 'e' || !command.startsWith('esac', i)) {
        const close = command.indexOf(')', i)

        if (close >= 0) {
          i = close
          continue
        }
      }
    }

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        word += ch
      }

      continue
    }

    if (ch === "'" || ch === '"') {
      quote = ch
      continue
    }

    // A line continued is one line.
    if (ch === '\\' && next === '\n') {
      endWord()
      i++
      continue
    }

    // A comment runs to the end of its line; `#` inside a word is part of it.
    if (ch === '#' && word === '') {
      while (i + 1 < command.length && command[i + 1] !== '\n') {
        i++
      }

      continue
    }

    // An array assigned — `CTX=(CLAUDE.md REVIEW.md)` — is values, not a step.
    if (ch === '(' && /^[A-Za-z_][A-Za-z0-9_]*\+?=$/.test(word)) {
      const close = command.indexOf(')', i)

      if (close >= 0) {
        word += '()'
        i = close
        continue
      }
    }

    if (ch === '$' && next === '(') {
      depth++
      word += '$('
      i++
      continue
    }

    if (depth > 0) {
      if (ch === ')') {
        depth--
      }

      word += ch
      continue
    }

    if ((ch === '&' && next === '&') || (ch === '|' && next === '|')) {
      endStep()
      i++
      continue
    }

    if (ch === '<' && next === '<') {
      const opened = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(command.slice(i))

      if (opened) {
        heredocs.push(opened[2]!)
      }
    }

    if (ch === '\n' && heredocs.length > 0) {
      endStep()

      for (const tag of heredocs.splice(0)) {
        const lines = command.slice(i + 1).split('\n')
        const end = lines.findIndex(line => line.trim() === tag)
        const skipped = end < 0 ? lines.length : end + 1

        i += lines.slice(0, skipped).reduce((sum, line) => sum + line.length + 1, 0)
      }

      continue
    }

    if (ch === ';' && next === ';') {
      endStep()
      i++
      pattern = cases > 0
      continue
    }

    if (ch === ';' || ch === '\n') {
      endStep()
      continue
    }

    if (ch === '|') {
      endWord()
      piped = true
      continue
    }

    if (ch === ' ' || ch === '\t') {
      endWord()
      continue
    }

    word += ch
  }

  endStep()

  return steps.map(step => withoutRedirects(step)).filter(step => step.length > 0)
}

/** A step with its redirections taken out: `> /dev/null`, `2>&1`, `< in.txt`. */
function withoutRedirects(words: string[]): string[] {
  const out: string[] = []

  for (let i = 0; i < words.length; i++) {
    const w = words[i]!

    if (/^\d*[<>]{1,2}&?\d*$/.test(w) || w === '&>') {
      // A bare operator takes the next word as its target; `2>&1` has none.
      if (!/&\d$/.test(w)) {
        i++
      }

      continue
    }

    if (/^\d*[<>]{1,2}/.test(w) || /^&>/.test(w)) {
      continue
    }

    out.push(w)
  }

  return out
}

/** The file part of a path: what a reader recognises it by. */
function base(path: string): string {
  const parts = path.replace(/\/+$/, '').split('/')

  return parts[parts.length - 1] || path
}

/** The arguments that are not flags. */
function plain(args: string[]): string[] {
  // `.` and `./` name the place the agent already is, which says nothing.
  return args.filter(a => !a.startsWith('-') && a !== '.' && a !== './')
}

/** `a`, `a and b`, or `3 files`. */
function files(paths: string[]): string {
  // A path held in a variable — `cat "$f"` in a loop — names no file a reader knows.
  if (paths.some(path => path.startsWith('$'))) {
    return paths.length === 1 ? 'a file' : `${paths.length} files`
  }

  return paths.length <= 2 ? paths.map(base).join(' and ') : `${paths.length} files`
}

/** Prefixes that change how a command runs, not what it does. */
const WRAPPERS = new Set(['sudo', 'time', 'env', 'exec', 'nice', 'nohup', 'command', 'npx', 'bunx', 'xargs', 'rtk'])

/** Commands that do nothing a reader is waiting to hear about. */
/**
 * The shell's own grammar, which says how the commands run rather than what
 * they are. A keyword that comes before a command — `then npm test`, `do rm
 * "$f"` — is taken off it; the ones that open a loop or a match over values —
 * `for f in *.ts`, `case $x in` — take their whole step with them, since what
 * follows them is a list of words, not a command.
 */
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', '{', '(', 'time'])
const CLAUSES = new Set(['for', 'case', 'select', 'function'])
const CLOSERS = new Set(['fi', 'done', 'esac', '}', ')', ';;'])

const QUIET = new Set(['echo', 'printf', 'true', 'false', ':', 'sleep', 'export', 'set', 'unset', 'cd', 'pwd', 'source', '.', 'exit', 'test', '[', '[[', 'read', 'wait', 'clear', 'date', 'realpath', 'basename', 'dirname', 'sort', 'uniq', 'tr', 'cut', 'tee', 'mktemp', 'trap', 'local', 'return', 'shift', 'declare', 'readonly', 'let', 'eval', 'break', 'continue'])

/** A package script's name in words. */
function scriptOf(name: string): Phrase {
  if (/lint:?fix|^fix/.test(name)) {
    return p('fixed the lint errors', 'fixing the lint errors')
  }

  if (/lint/.test(name)) {
    return p('ran the linter', 'running the linter')
  }

  if (/type-?check|tsc|types/.test(name)) {
    return p('type-checked the code', 'type-checking the code')
  }

  if (/test|spec|vitest|jest/.test(name)) {
    return p('ran the tests', 'running the tests')
  }

  if (/build/.test(name)) {
    return p('built the project', 'building the project')
  }

  if (/^(dev|start|serve)/.test(name)) {
    return p('started the app', 'starting the app')
  }

  if (/format|prettier/.test(name)) {
    return p('formatted the code', 'formatting the code')
  }

  return p(`ran the ${name} script`, `running the ${name} script`)
}

/** A test run, and what it ran over where it named it. */
function testsOf(args: string[]): Phrase {
  const targets = plain(args).filter(a => !['run', 'watch', 'test'].includes(a))
  const over = targets.length === 0 ? '' : targets.length === 1 ? ` for ${base(targets[0]!)}` : ` in ${targets.length} files`

  return p(`ran the tests${over}`, `running the tests${over}`)
}

function gitOf(args: string[]): Phrase {
  const rest = [...args]

  // Options that come before the subcommand, some with a value of their own.
  while (rest.length > 0 && rest[0]!.startsWith('-')) {
    const opt = rest.shift()!

    if (opt === '-C' || opt === '-c') {
      rest.shift()
    }
  }

  const sub = rest.shift() ?? ''
  const named = plain(rest)

  switch (sub) {
    case 'status':
      return p('checked the git status', 'checking the git status')
    case 'diff': {
      const paths = named.filter(a => a.includes('.') || a.includes('/'))

      return paths.length > 0
        ? p(`looked at the changes to ${files(paths)}`, `looking at the changes to ${files(paths)}`)
        : p('looked at the changes', 'looking at the changes')
    }
    case 'show': {
      const at = named.find(a => a.includes(':'))

      return at
        ? p(`read the committed ${base(at.split(':').slice(1).join(':'))}`, `reading the committed ${base(at.split(':').slice(1).join(':'))}`)
        : p('looked at a commit', 'looking at a commit')
    }
    case 'log':
      return p('read the git history', 'reading the git history')
    case 'add':
      return named.length > 0 && !named.includes('.')
        ? p(`staged ${files(named)}`, `staging ${files(named)}`)
        : p('staged the changes', 'staging the changes')
    case 'commit':
      return p('committed the changes', 'committing the changes')
    case 'push':
      return p('pushed the branch', 'pushing the branch')
    case 'pull':
    case 'fetch':
      return p('fetched from the remote', 'fetching from the remote')
    case 'checkout':
    case 'switch':
      return rest.includes('-b') || rest.includes('-c')
        ? p(`created the branch ${named[0] ?? ''}`.trim(), `creating the branch ${named[0] ?? ''}`.trim())
        : p(`switched to ${named[0] ?? 'another branch'}`, `switching to ${named[0] ?? 'another branch'}`)
    case 'branch':
      return p('listed the branches', 'listing the branches')
    case 'ls-files':
      return p('listed the tracked files', 'listing the tracked files')
    case 'rev-parse':
    case 'merge-base':
    case 'rev-list':
      return p('looked up the git state', 'looking up the git state')
    case 'stash':
      return p('stashed the changes', 'stashing the changes')
    case 'merge':
      return p(`merged ${named[0] ?? 'a branch'}`, `merging ${named[0] ?? 'a branch'}`)
    case 'rebase':
      return p(`rebased onto ${named[0] ?? 'the base'}`, `rebasing onto ${named[0] ?? 'the base'}`)
    case 'reset':
      return p('reset the branch', 'resetting the branch')
    case 'restore':
      return p(`restored ${named.length > 0 ? files(named) : 'files'}`, `restoring ${named.length > 0 ? files(named) : 'files'}`)
    case 'worktree':
      return p('managed the worktrees', 'managing the worktrees')
    default:
      return p(`ran git ${sub}`.trim(), `running git ${sub}`.trim())
  }
}

/** One step in words, or null for a step that says nothing worth saying. */
function stepOf(step: string[]): Phrase | null {
  let words = [...step]

  while (
    words.length > 0 &&
    (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!) || WRAPPERS.has(words[0]!) || KEYWORDS.has(words[0]!) || CLOSERS.has(words[0]!))
  ) {
    words.shift()

    // `rtk proxy <command>` runs the command as it is.
    if (words[0] === 'proxy') {
      words.shift()
    }
  }

  // A loop's or a match's head, a function being defined, a case's pattern:
  // none of them is a command.
  if (words.length === 0 || CLAUSES.has(words[0]!) || /^[^$(]*\)$/.test(words[0]!) || /\(\)\{?$/.test(words[0]!)) {
    return null
  }

  if (words[0] === 'timeout' || words[0] === 'gtimeout') {
    words = words.slice(2)
  }

  if (words.length === 0) {
    return null
  }

  const prog = base(words[0]!)
  const args = words.slice(1)
  const named = plain(args)

  if (QUIET.has(prog)) {
    return null
  }

  switch (prog) {
    case 'git':
      return gitOf(args)
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      const sub = args[0] ?? ''

      if (sub === 'run' || sub === 'run-script') {
        return scriptOf(args[1] ?? '')
      }

      if (['install', 'i', 'ci', 'add'].includes(sub)) {
        return p('installed the dependencies', 'installing the dependencies')
      }

      if (sub === 'test') {
        return testsOf(args.slice(1))
      }

      if (sub === 'x' || sub === 'exec' || sub === 'dlx') {
        return stepOf(args.slice(1))
      }

      if (/\.(ts|js|mjs|cjs)$/.test(sub)) {
        return p(`ran ${base(sub)}`, `running ${base(sub)}`)
      }

      return sub ? scriptOf(sub) : p(`ran ${prog}`, `running ${prog}`)
    }
    case 'vitest':
    case 'jest':
    case 'mocha':
    case 'pytest':
    case 'phpunit':
    case 'playwright':
      return testsOf(args)
    case 'go':
    case 'cargo':
      return args[0] === 'test'
        ? p('ran the tests', 'running the tests')
        : args[0] === 'build'
          ? p('built the project', 'building the project')
          : p(`ran ${prog} ${args[0] ?? ''}`.trim(), `running ${prog} ${args[0] ?? ''}`.trim())
    case 'tsc':
    case 'vue-tsc':
      return p('type-checked the code', 'type-checking the code')
    case 'eslint':
      return args.includes('--fix') ? p('fixed the lint errors', 'fixing the lint errors') : p('ran the linter', 'running the linter')
    case 'prettier':
      return p('formatted the code', 'formatting the code')
    case 'sed': {
      const file = named[named.length - 1]

      if (args.includes('-i') || args.some(a => a.startsWith('-i'))) {
        return p(`edited ${file ? base(file) : 'a file'}`, `editing ${file ? base(file) : 'a file'}`)
      }

      const range = args.find(a => /^\d+(,\d+)?p$/.test(a))

      if (range && file && file !== range) {
        const [from, to] = range.slice(0, -1).split(',')
        const lines = to ? `lines ${from}–${to}` : `line ${from}`

        return p(`read ${lines} of ${base(file)}`, `reading ${lines} of ${base(file)}`)
      }

      return p('rewrote some text', 'rewriting some text')
    }
    case 'cat':
    case 'head':
    case 'tail':
    case 'less':
    case 'more':
    case 'bat': {
      const targets = named.filter(a => !/^\d+$/.test(a))

      return targets.length > 0 ? p(`read ${files(targets)}`, `reading ${files(targets)}`) : null
    }
    case 'awk':
    case 'gawk':
    case 'perl': {
      const targets = named.slice(1)

      return targets.length > 0 ? p(`read ${files(targets)}`, `reading ${files(targets)}`) : null
    }
    case 'which':
    case 'type':
      return p(`checked ${named[0] ?? 'a tool'} is installed`, `checking ${named[0] ?? 'a tool'} is installed`)
    case 'lsof':
      return p('checked the open ports', 'checking the open ports')
    case 'wc':
      return p(`counted the lines in ${named.length > 0 ? files(named) : 'the output'}`, `counting the lines in ${named.length > 0 ? files(named) : 'the output'}`)
    case 'od':
    case 'xxd':
    case 'hexdump':
      return p(`looked at the raw bytes${named[0] ? ` of ${base(named[0])}` : ''}`, `looking at the raw bytes${named[0] ? ` of ${base(named[0])}` : ''}`)
    case 'grep':
    case 'egrep':
    case 'rg':
    case 'ag': {
      const flagged = args.indexOf('-e')
      const pattern = flagged >= 0 ? args[flagged + 1] : named[0]
      const where = named.slice(flagged >= 0 ? 0 : 1)
      const said = pattern ? ` for '${pattern.length > 30 ? `${pattern.slice(0, 29)}…` : pattern}'` : ''
      const inside = where.length === 1 ? ` in ${base(where[0]!)}` : ''

      return p(`searched${said}${inside}`, `searching${said}${inside}`)
    }
    case 'ls':
    case 'tree':
      return p(`listed ${named[0] ? `the files in ${base(named[0])}` : 'the files'}`, `listing ${named[0] ? `the files in ${base(named[0])}` : 'the files'}`)
    case 'find': {
      const at = args.indexOf('-name')
      const name = at >= 0 ? args[at + 1] : undefined

      return p(`looked for ${name ? `files named ${name}` : 'files'}`, `looking for ${name ? `files named ${name}` : 'files'}`)
    }
    case 'mkdir':
      return p(`created ${named[0] ? base(named[0]) : 'a folder'}`, `creating ${named[0] ? base(named[0]) : 'a folder'}`)
    case 'touch':
      return p(`created ${named.length > 0 ? files(named) : 'a file'}`, `creating ${named.length > 0 ? files(named) : 'a file'}`)
    case 'rm':
      return p(`deleted ${named.length > 0 ? files(named) : 'files'}`, `deleting ${named.length > 0 ? files(named) : 'files'}`)
    case 'cp':
      return p(`copied ${named[0] ? base(named[0]) : 'files'}`, `copying ${named[0] ? base(named[0]) : 'files'}`)
    case 'mv':
      return p(`moved ${named[0] ? base(named[0]) : 'files'}`, `moving ${named[0] ? base(named[0]) : 'files'}`)
    case 'chmod':
      return p('changed file permissions', 'changing file permissions')
    case 'diff':
    case 'cmp':
      return p(`compared ${files(named.slice(0, 2))}`, `comparing ${files(named.slice(0, 2))}`)
    case 'jq':
      return p('read some JSON', 'reading some JSON')
    case 'curl':
    case 'wget': {
      const url = named.find(a => /^https?:\/\//.test(a))
      const host = url ? url.replace(/^https?:\/\//, '').split('/')[0] : undefined

      return p(`fetched ${host ?? 'a URL'}`, `fetching ${host ?? 'a URL'}`)
    }
    case 'gh': {
      const [area, act] = named

      if (area === 'pr') {
        return act === 'create'
          ? p('opened a pull request', 'opening a pull request')
          : act === 'edit'
            ? p('updated the pull request', 'updating the pull request')
          : act === 'comment' || act === 'review'
            ? p('commented on the pull request', 'commenting on the pull request')
          : act === 'merge'
            ? p('merged the pull request', 'merging the pull request')
          : act === 'checks'
            ? p('checked the CI', 'checking the CI')
            : p('read the pull request', 'reading the pull request')
      }

      if (area === 'run') {
        return p('checked the CI runs', 'checking the CI runs')
      }

      return area === 'api' ? p('called the GitHub API', 'calling the GitHub API') : p('used GitHub', 'using GitHub')
    }
    case 'docker':
    case 'docker-compose':
      return p(`ran docker ${named[0] ?? ''}`.trim(), `running docker ${named[0] ?? ''}`.trim())
    case 'kubectl':
      return named[0] === 'get' || named[0] === 'describe' || named[0] === 'logs'
        ? p(`read Kubernetes ${named[1] ?? 'state'}`, `reading Kubernetes ${named[1] ?? 'state'}`)
        : p(`ran kubectl ${named[0] ?? ''}`.trim(), `running kubectl ${named[0] ?? ''}`.trim())
    case 'aws':
      return p(`called AWS ${named[0] ?? ''}`.trim(), `calling AWS ${named[0] ?? ''}`.trim())
    case 'make':
      return p(`ran make ${named[0] ?? ''}`.trim(), `running make ${named[0] ?? ''}`.trim())
    case 'node':
    case 'python':
    case 'python3':
    case 'deno':
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'php':
    case 'ruby': {
      const script = named[0]

      // `-` is the script read from stdin, which is where a heredoc puts it.
      return args.includes('-c') || args.includes('-e') || args[0] === '-' || !script
        ? p('ran some inline code', 'running some inline code')
        : p(`ran ${base(script)}`, `running ${base(script)}`)
    }
    default:
      return p(`ran ${prog}`, `running ${prog}`)
  }
}

/**
 * A command line in words by the table: each step that says something, in
 * order, the same thing said once.
 *
 * Undefined where no step says anything — a line of `echo` markers — so the
 * caller can show the command itself rather than a description of nothing.
 */
export function describe(command: string): Phrase | undefined {
  const said: Phrase[] = []
  // A function the script defines is its own shorthand: what it does was said
  // where its body ran, and its name — `emit`, `enc` — says nothing.
  const defined = new Set<string>()

  for (const step of stepsOf(command)) {
    const head =
      step[0] === 'function' ? step[1] : /^[A-Za-z_][\w-]*\(\)/.test(step[0]!) || step[1]?.startsWith('()') ? step[0] : undefined

    if (head) {
      defined.add(head.replace(/\(\).*$/, ''))
      continue
    }

    if (defined.has(step[0]!)) {
      continue
    }

    const phrase = stepOf(step)

    if (phrase && !said.some(s => s.past === phrase.past)) {
      said.push(phrase)
    }
  }

  if (said.length === 0) {
    return undefined
  }

  const join = (parts: string[]) =>
    parts.length === 1
      ? parts[0]!
      : parts.length === 2
        ? `${parts[0]} and ${parts[1]}`
        : `${parts[0]}, ${parts[1]} and ${parts.length - 2} more ${parts.length - 2 === 1 ? 'step' : 'steps'}`

  return p(join(said.map(s => s.past)), join(said.map(s => s.ing)))
}
