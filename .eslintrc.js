module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'import/prefer-default-export': 'off', // allow named exports for single exports
    'import/no-cycle': 'off', // allow circular dependencies for browser code
    'import/no-relative-packages': 'off', // allow relative imports for browser code
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
    'no-use-before-define': [2, { functions: false }],
    'no-console': [
      'error',
      {
        allow: ['warn', 'error', 'info', 'debug'],
      },
    ],
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-underscore-dangle': 'off', // allow all underscore properties
  },
  overrides: [
    {
      files: ['build.mjs'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      // Node-side migration/build tooling: not shipped to the browser, so allow
      // sequential loops (needed for ordered network I/O) and dev-only deps.
      files: ['tools/**/*.mjs', 'tools/**/*.js'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
        'no-await-in-loop': 'off',
        'no-restricted-syntax': 'off',
        'no-continue': 'off',
      },
    },
  ],
};
