import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

// Route screens and small domain type slices deliberately stay compact in MVP.
// Import-boundary rules remain enabled; only structural heuristics that conflict
// with the documented Nuxt + FSD adapter are disabled.
export default defineConfig([
  ...fsd.configs.recommended,
  {
    rules: {
      'fsd/insignificant-slice': 'off',
      'fsd/no-segmentless-slices': 'off',
      'fsd/no-ui-in-app': 'off'
    }
  }
])
