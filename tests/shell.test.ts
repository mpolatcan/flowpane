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
