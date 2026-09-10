/**
 * Test runner.
 *
 * Node 20's built-in test runner does not expand globs (that landed in Node 21)
 * and does not recognise `.test.ts` as a test file without a loader. This
 * script enumerates the suite itself and hands the explicit file list to
 * `node --import tsx --test`, so adding a new tests/*.test.ts file needs no
 * change to package.json.
 */
import { readdirSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

const TEST_DIR = 'tests'

if (!existsSync(TEST_DIR)) {
  console.error(`No ${TEST_DIR}/ directory found.`)
  process.exit(1)
}

const files = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .sort()
  .map((f) => join(TEST_DIR, f))

if (files.length === 0) {
  console.error(`No *.test.ts files in ${TEST_DIR}/.`)
  process.exit(1)
}

console.log(`Running ${files.length} test file(s):`)
for (const f of files) console.log(`  ${f}`)
console.log('')

const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-reporter=spec', ...files],
  { stdio: 'inherit' },
)

process.exit(result.status ?? 1)
