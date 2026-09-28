module.exports = {
  root: true, parser: '@typescript-eslint/parser', plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: { '@typescript-eslint/no-explicit-any': 'off', 'react-hooks/rules-of-hooks': 'error', '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  ignorePatterns: ['dist', 'node_modules', 'supabase/functions/**', '*.cjs'],
};
