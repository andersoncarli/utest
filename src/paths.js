import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Internal paths for utest
export const ROOT     = resolve(__dirname)
export const TEST_DIR = join(ROOT, 'test')
export const SRC_DIR  = resolve(ROOT, '..')

export default { ROOT, TEST_DIR, SRC_DIR }
