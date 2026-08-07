// The runner is upstream's, jest, because upstream's snapshots are
// jest's and a suite that cannot read them would be throwing away the
// only recorded answers in this directory.
//
// The two mappings are the whole difference. Upstream's tests import
// the client from ../src, which is a checkout of storage-js they have
// and this does not, so the imports are pointed at the src the
// published package ships. Type checking is off because the tests are
// being run rather than compiled, and a type error in somebody else's
// source is not something this can act on.
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
  },
  transformIgnorePatterns: ['/node_modules/(?!@supabase/storage-js/src/)'],
  moduleNameMapper: {
    '^\\.\\./src$': '<rootDir>/node_modules/@supabase/storage-js/src/index.ts',
    '^\\.\\./src/(.*)$': '<rootDir>/node_modules/@supabase/storage-js/src/$1',
  },
}
