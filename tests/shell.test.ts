/**
 * Shell commands said in words, for the agents that run them without saying
 * why. These read the phrase the strip and the sentence would draw.
 */

import { expect, test } from 'claude-code/testing'

import { describe } from '../hooks/shell'

const past = (command: string) => describe(command)?.past

test('a read of some lines names the lines and the file, and a pipe after it says nothing', () => {
  expect(past("sed -n '81,131p' README.md | head -20")).toBe('read lines 81–131 of README.md')
  expect(past('git show HEAD:src/stores/config.ts | sed -n 119p')).toBe('read the committed config.ts')
})

test('the steps of one line are said in order, each once', () => {
  expect(past("sed -n '81,131p' README.md; ls -a")).toBe('read lines 81–131 of README.md and listed the files')
  expect(past('npm run lint && npm run lint')).toBe('ran the linter')
  expect(past('git status; git diff; git log -3; ls')).toBe('checked the git status, looked at the changes and 2 more steps')
})

test('package scripts and test runners are said by what they do', () => {
  expect(past('npm run type-check')).toBe('type-checked the code')
  expect(past('npx vitest run __tests__/unit/AiStatusPill.test.ts 2>&1 | tail -25')).toBe('ran the tests for AiStatusPill.test.ts')
  expect(past('bun install')).toBe('installed the dependencies')
  expect(describe('npm run lint')?.ing).toBe('running the linter')
})

test('markers, redirects and variables are not steps', () => {
  expect(past('echo "--- lint ---"; FORCE_COLOR=0 npm run lint > /tmp/out.txt 2>&1; echo $?')).toBe('ran the linter')
  expect(describe('echo done; true')).toBeUndefined()
})

test('a program the table does not know is named, not guessed at', () => {
  expect(past('terraform plan -out tf.plan')).toBe('ran terraform')
})

test('a script is read as shell only where it is shell', () => {
  // A heredoc's body is a script handed to the command, not steps of its own.
  expect(past("python3 - \"$DIR/body.txt\" <<'PY'\nimport sys\nbody = open(sys.argv[1]).read()\nPY\ngh pr edit 3 --body-file x")).toBe(
    'ran some inline code and updated the pull request',
  )
  // Comments, continued lines, arrays and the shell's own keywords say nothing.
  expect(past('# context files\nCTX=(CLAUDE.md REVIEW.md)\nfor f in "${CTX[@]}"; do\n  cat "$f" \\\n    | head -5\ndone')).toBe('read a file')
  expect(past('case "$f" in\n  CLAUDE.md|REVIEW.md) git add "$f" ;;\n  *) rm "$f" ;;\nesac')).toBe('staged a file and deleted a file')
})

test('a function the script defines is not said again where it is called', () => {
  expect(past('emit() {\n  echo "$1"\n}\nemit start\nnpm test\nemit end')).toBe('ran the tests')
})

test('a wrapper that only proxies the command is looked through', () => {
  expect(past('rtk proxy git status')).toBe('checked the git status')
})

test('a sed that edits in place is an edit of the file, not a read of it', () => {
  expect(past("sed -i 's/a/b/' src/x.ts")).toBe('edited x.ts')
})

test('a sed with no range and no file in place rewrites text', () => {
  expect(past("sed 's/a/b/'")).toBe('rewrote some text')
})
