
test('check', ({ check, checkFail, checkException }) => {
  check(2, () => 2)
  check('', '')
  check(0, 0)

  check(true)
  check(() => true)
  check('a', () => 'a')
  check([1], '[1]')
  check({}, '{}')

  checkFail()
  checkFail(false)
  checkFail(1)
  checkFail(undefined, 1)
  checkFail(() => 1)

  check(1 == 1)
  check(2, 2)
  checkFail(1, 2)
  checkFail(null)
  checkFail(() => '1', 'b')
  checkException(() => {
    throw new Error()
  })

  // // Forced failures for demo purposes (comment out for passing tests)
  // check(1, 2) // force a failure
  // check(() => { throw new Error('Bang!') }) // force an exception

  // Test nested exception stack trace
  function level1() {
    function level2() {
      throw new Error('Nested!')
    }
    level2()
  }
  checkException(() => level1())
})
