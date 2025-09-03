module.exports = {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": [
    "<rootDir>/apps",
    "<rootDir>/packages"
  ],
  "testMatch": [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/*.(test|spec).+(ts|tsx|js)"
  ],
  "transform": {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
  "collectCoverageFrom": [
    "apps/**/*.{ts,tsx}",
    "packages/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/dist/**",
    "!**/*.config.{ts,js}",
    "!**/*.test.{ts,js}",
    "!**/__tests__/**"
  ],
  "coverageDirectory": "coverage",
  "coverageReporters": [
    "text",
    "lcov",
    "html",
    "json-summary"
  ],
  "coverageThreshold": {
    "global": {
      "branches": 75,
      "functions": 80,
      "lines": 80,
      "statements": 80
    }
  },
  "setupFilesAfterEnv": [
    "<rootDir>/tests/setup.ts"
  ],
  "testTimeout": 10000,
  "verbose": true,
  "moduleNameMapping": {
    "^@pake/common/(.*)$": "<rootDir>/packages/common/src/$1",
    "^@pake/types/(.*)$": "<rootDir>/packages/types/src/$1",
    "^@pake/config/(.*)$": "<rootDir>/packages/config/src/$1",
    "^@pake/database/(.*)$": "<rootDir>/packages/database/src/$1"
  }
};