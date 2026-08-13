// Regression fixture: Loader prefers this default and drops the sibling
// `inject`/`Config` metadata. Production function plugins must not do this.
export { name, inject, Config, apply } from '../../src/index.ts'
export { apply as default } from '../../src/index.ts'
