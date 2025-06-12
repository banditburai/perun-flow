import js from '@eslint/js';
import jest from 'eslint-plugin-jest';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      'no-console': 'off',
      'no-useless-catch': 'off',
    },
  },
  {
    files: ['**/*.test.js', 'tests/**/*.js'],
    plugins: {
      jest,
    },
    languageOptions: {
      globals: {
        ...jest.environments.globals.globals,
        jest: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      ...jest.configs.recommended.rules,
      'jest/no-conditional-expect': 'off',
    },
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '.tasks/**',
      'tasks/**',
      '*.db',
      '.husky/**',
      'package-lock.json',
    ],
  },
];
