/**
 * Lets `node --experimental-strip-types` run the app's own modules.
 *
 * lib/ imports without file extensions, the way the bundler expects. Node's ESM
 * resolver needs them, so rather than change app code to suit a test runner,
 * this hook retries an extensionless relative import as `.ts`.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types <script>
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

register('./ts-resolve-hooks.mjs', pathToFileURL('./scripts/'))
