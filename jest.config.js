// const {
//   jest: { config },
// } = require('alonzo/utils');

module.exports = {
  verbose: false,
  /**
   * these files must exist in root repo
   * and must reference to alonzo jest reporter classes
   * <root>/utils/jest/reporters
   * you can change this property in your repo
   */
  reporters: [
    '<rootDir>/utils/jest/reporters/no-logs-reporter.js',
    '<rootDir>/utils/jest/reporters/summary-reporter.js',
  ],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  collectCoverageFrom: [
    '**/*.js',
  ],
  coveragePathIgnorePatterns: [
    'coverage',
    'node_modules',
    'utils',
    /**
     * this file must be created and it must
     * import this configuration
     */
    'jest.config.js',
  ],
  testEnvironment: 'node',
};
