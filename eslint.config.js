// Flat ESLint config for the build-less browser app.
// Goal: catch real bugs (undefined names, obvious mistakes) without fighting
// the existing style. Kept lenient so CI starts green on the current codebase.
import globals from 'globals';

export default [
  {
    ignores: ['tests/**', 'scripts/**', 'node_modules/**'],
  },
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        supabase: 'readonly',   // global Supabase client (loaded via CDN in app.html)
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'valid-typeof': 'error',
    },
  },
];
