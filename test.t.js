// Test.t.js - Tests for test.js
test('test', async ({ test, check, checkFail, checkException, log }) => {
  // Test 1: Basic check integration
  check(1 + 1, 2)
  check(true)
  check('hello', 'hello')

  // Test 2: Nested tests
  check(true, true)
  test('Child test 1', ({ check, checkFail }) => {
    check(2 * 3, 6)
    checkFail(2 * 3, 5) // This expects failure, so it passes
  })

  test('Child test 2', ({ check, test }) => {
    check(4 / 2, 2)

    test('Grandchild', ({ check }) => {
      check('a' + 'b', 'ab')
    })
  })

  // Test 3: Async test
  const value = await new Promise((resolve) => setTimeout(() => resolve(42), 30))
  check(value, 42)

  // Test 4: checkFail
  checkFail(1, 2)
  checkFail(false)

  // Test 5: Exception handling
  checkException(() => {
    throw new Error('Expected!')
  })

  // Test 6: Verify checkFail detects actual failures
  checkFail(1, 2)
  checkFail('a', 'b')

  // //Test 7: Uncomment to see errors on v 1
  log('log inside test')
  // check(1, 2)
  // check(() => { throw new Error('Bang!') })
});
