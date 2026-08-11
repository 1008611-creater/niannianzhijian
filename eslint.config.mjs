import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores:[
      'node_modules/**',
      'studio/assets/**',
      'director-desk/assets/**',
      'tools/vendor/**',
      'authority/**',
      'data*/**'
    ]
  },
  {
    files:['server.js'],
    languageOptions:{ecmaVersion:'latest', sourceType:'commonjs', globals:globals.node}
  },
  {
    ...js.configs.recommended,
    files:[
      'bridge/niannian_release_identity.js',
      'scripts/build_ci_candidate.js',
      'scripts/verify_exact_preview.js',
      'test_release_identity.js'
    ],
    languageOptions:{ecmaVersion:'latest', sourceType:'commonjs', globals:{...globals.node, fetch:'readonly', AbortSignal:'readonly'}}
  }
];
