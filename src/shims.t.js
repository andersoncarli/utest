// Os shims deixam uma suite legada (estilo jest) rodar aqui sem reescrita. Um matcher
// que erra o veredito e pior que um ausente: a suite legada passa a mentir
// silenciosamente sobre o que ela verifica.
//
// Cada matcher devolve um Check; .state ('passed'/'failed') e o veredito.
// expect/describe/it/spyOn/jest/vi/mock ja sao globais (src/setup.js os injeta);
// importa-los aqui colidiria com o header que o onLoad prepende.

// Cada matcher chama o check() global, que REGISTRA o resultado no teste
// corrente. Um caso negativo (`expect(1).toBe(2)`) gravaria uma falha no proprio
// teste que o verifica. `probe` silencia esse registro durante a chamada, entao
// o matcher e avaliado pelo Check que devolve, sem poluir o veredito.
const probe = (fn) => {
  const salvo = check.test
  check.test = null
  try { return fn() } finally { check.test = salvo }
}
const probeAsync = async (fn) => {
  const salvo = check.test
  check.test = null
  try { return await fn() } finally { check.test = salvo }
}
const ok   = (fn) => probe(fn)?.state === 'passed'
const fail = (fn) => probe(fn)?.state === 'failed'
// Alguns matchers (toThrow e familia) registram o check mas nao o devolvem.
// `registra` captura o ultimo check gravado durante a chamada.
const registra = (fn) => {
  const salvo = check.test
  let ultimo = null
  check.test = { oncheck: (c) => { ultimo = c } }
  try { fn() } finally { check.test = salvo }
  return ultimo?.state
}
const registraA = async (fn) => {
  const salvo = check.test
  let ultimo = null
  check.test = { oncheck: (c) => { ultimo = c } }
  try { await fn() } finally { check.test = salvo }
  return ultimo?.state
}
const okA   = async (fn) => (await probeAsync(fn))?.state === 'passed'
const failA = async (fn) => (await probeAsync(fn))?.state === 'failed'

test('shims', ({ test }) => {

  test('igualdade: toBe / toEqual / toStrictEqual', ({ check }) => {
    check(ok(() => expect(1).toBe(1)), true, 'toBe igual passa')
    check(fail(() => expect(1).toBe(2)), true, 'toBe diferente falha')
    check(ok(() => expect({ a: 1 }).toEqual({ a: 1 })), true, 'toEqual compara por repr')
    check(ok(() => expect([1, 2]).toStrictEqual([1, 2])), true, 'toStrictEqual em array')
  })

  test('booleanos: toBeTrue / toBeFalse / toBeTruthy / toBeFalsy', ({ check }) => {
    check(ok(() => expect(true).toBeTrue()), true, 'toBeTrue')
    check(fail(() => expect(1).toBeTrue()), true, 'toBeTrue exige o booleano, não truthy')
    check(ok(() => expect(false).toBeFalse()), true, 'toBeFalse')
    check(ok(() => expect('x').toBeTruthy()), true, 'toBeTruthy aceita truthy')
    check(ok(() => expect(0).toBeFalsy()), true, 'toBeFalsy aceita falsy')
  })

  test('ordem: toBeGreaterThan / LessThan e os OrEqual', ({ check }) => {
    check(ok(() => expect(3).toBeGreaterThan(2)), true, '>')
    check(fail(() => expect(2).toBeGreaterThan(2)), true, '> é estrito')
    check(ok(() => expect(2).toBeGreaterThanOrEqual(2)), true, '>=')
    check(ok(() => expect(1).toBeLessThan(2)), true, '<')
    check(ok(() => expect(2).toBeLessThanOrEqual(2)), true, '<=')
  })

  test('presença: toContain / toHaveLength / toHaveProperty', ({ check }) => {
    check(ok(() => expect([1, 2]).toContain(2)), true, 'toContain em array')
    check(ok(() => expect('abc').toContain('b')), true, 'toContain em string')
    check(fail(() => expect([1]).toContain(9)), true, 'toContain ausente falha')
    check(ok(() => expect([1, 2, 3]).toHaveLength(3)), true, 'toHaveLength')
    check(ok(() => expect({ k: 1 }).toHaveProperty('k')), true, 'toHaveProperty só a chave')
    check(ok(() => expect({ k: 1 }).toHaveProperty('k', 1)), true, 'toHaveProperty chave e valor')
    check(fail(() => expect({ k: 1 }).toHaveProperty('k', 2)), true, 'valor errado falha')
  })

  test('nulidade: toBeDefined / toBeUndefined / toBeNull', ({ check }) => {
    check(ok(() => expect(1).toBeDefined()), true, 'toBeDefined')
    check(ok(() => expect(undefined).toBeUndefined()), true, 'toBeUndefined')
    check(ok(() => expect(null).toBeNull()), true, 'toBeNull')
    check(fail(() => expect(null).toBeUndefined()), true, 'null não é undefined')
  })

  test('tipo: toBeInstanceOf / toBeTypeOf', ({ check }) => {
    check(ok(() => expect(new Error('x')).toBeInstanceOf(Error)), true, 'toBeInstanceOf')
    check(ok(() => expect('s').toBeTypeOf('string')), true, 'toBeTypeOf')
    check(fail(() => expect(1).toBeTypeOf('string')), true, 'tipo errado falha')
  })

  test('toMatch e toBeCloseTo', ({ check }) => {
    check(ok(() => expect('abc').toMatch(/b/)), true, 'toMatch com regex')
    check(ok(() => expect(0.1 + 0.2).toBeCloseTo(0.3)), true, 'toBeCloseTo absorve o float')
    check(fail(() => expect(0.1).toBeCloseTo(0.3)), true, 'toBeCloseTo distante falha')
  })

  test('toMatchObject compara parcialmente, em profundidade', ({ check }) => {
    check(ok(() => expect({ a: 1, b: 2 }).toMatchObject({ a: 1 })), true, 'subconjunto passa')
    check(fail(() => expect({ a: 1 }).toMatchObject({ a: 2 })), true, 'valor errado falha')
    check(ok(() => expect({ a: { b: { c: 3 } } }).toMatchObject({ a: { b: { c: 3 } } })), true, 'aninhado')
    check(ok(() => expect({ a: 'xyz' }).toMatchObject({ a: /y/ })), true, 'regex como valor esperado')
  })

  test('expect.objectContaining', ({ check }) => {
    check(ok(() => expect({ a: 1, b: 2 }).toMatchObject(expect.objectContaining({ a: 1 }))), true,
      'objectContaining casa subconjunto')
  })

  test('toThrow: sem arg, com string, com regex, com classe', ({ check }) => {
    // NB: toThrow() nao faz `return check(...)` nos seus caminhos — ele
    // REGISTRA o check (o veredito do usuario sai certo) mas devolve undefined.
    // Por isso estes casos olham o registro, nao o retorno.
    check(ok(() => expect(() => { throw new Error('boom') }).toThrow()), true, 'lançou')
    check(registra(() => expect(() => 1).toThrow()), 'failed', 'não lançou registra falha')
    check(ok(() => expect(() => { throw new Error('boom') }).toThrow('boom')), true, 'mensagem por substring')
    check(ok(() => expect(() => { throw new Error('boom') }).toThrow(/bo+m/)), true, 'mensagem por regex')
    check(ok(() => expect(() => { throw new TypeError('t') }).toThrow(TypeError)), true, 'por classe')
  })

  test('.not inverte os matchers que o suportam', ({ check }) => {
    check(ok(() => expect(1).not.toBe(2)), true, '.not.toBe')
    check(fail(() => expect(1).not.toBe(1)), true, '.not.toBe igual falha')
    check(ok(() => expect([1]).not.toContain(9)), true, '.not.toContain')
    // null E definido, entao .not.toBeDefined(null) falha — igual ao jest.
    check(fail(() => expect(null).not.toBeDefined()), true, 'null é definido: .not.toBeDefined falha')
    check(ok(() => expect(undefined).not.toBeDefined()), true, '.not.toBeDefined em undefined passa')
    check(registra(() => expect(() => 1).not.toThrow()), 'passed', '.not.toThrow sem exceção')
  })

  test('.resolves espera a promessa', async ({ check }) => {
    check(await okA(() => expect(Promise.resolve(1)).resolves.toBe(1)), true, 'resolves.toBe')
    check(await failA(() => expect(Promise.resolve(1)).resolves.toBe(2)), true, 'valor errado falha')
    check(await okA(() => expect(Promise.resolve([1, 2])).resolves.toHaveLength(2)), true, 'resolves.toHaveLength')
    check(await okA(() => expect(Promise.resolve(null)).resolves.toBeNull(), true), true, 'resolves.toBeNull')
  })

  test('.rejects espera a rejeição', async ({ check }) => {
    // rejects.toThrow tambem registra sem retornar (ver NB acima).
    check(await registraA(() => expect(Promise.reject(new Error('x'))).rejects.toThrow()), 'passed', 'rejects.toThrow')
    check(await registraA(() => expect(Promise.reject(new Error('boom'))).rejects.toThrow('boom')), 'passed', 'com mensagem')
    check(await registraA(() => expect(Promise.resolve(1)).rejects.toThrow()), 'failed', 'promessa que resolve falha')
  })

  test('spyOn registra chamadas e restaura o método', ({ check }) => {
    const obj = { f: (a) => a * 2 }
    const spy = spyOn(obj, 'f')
    obj.f(3)
    obj.f(4)
    check(spy.calls.length, 2, 'registra cada chamada')
    check(ok(() => expect(spy).toHaveBeenCalled()), true, 'toHaveBeenCalled')
    check(ok(() => expect(spy).toHaveBeenCalledWith(3)), true, 'toHaveBeenCalledWith')
    check(fail(() => expect(spy).toHaveBeenCalledWith(99)), true, 'argumento não usado falha')
    spy.mockRestore()
    check(obj.f(5), 10, 'mockRestore devolve o original')
  })

  test('mockReturnValue e mockImplementation', ({ check }) => {
    const obj = { f: () => 'original' }
    const spy = spyOn(obj, 'f')
    spy.mockReturnValue('fixo')
    check(obj.f(), 'fixo', 'mockReturnValue')
    spy.mockImplementation(() => 'outro')
    check(obj.f(), 'outro', 'mockImplementation')
    spy.mockRestore()
    check(obj.f(), 'original', 'restaurado')
  })

  test('jest / vi / mock são o mesmo objeto', ({ check }) => {
    check(jest === vi, true, 'vi é alias de jest')
    check(jest === mock, true, 'mock é alias de jest')
    check(typeof jest.fn, 'function', 'jest.fn existe')
  })

  test('jest.fn() cria um spy chamável', ({ check }) => {
    const f = jest.fn(() => 7)
    check(f(), 7, 'usa a implementação dada')
    check(f.calls.length, 1, 'registra a chamada')
  })

  test('describe/it agrupam sem quebrar o veredito', ({ check }) => {
    check(typeof describe, 'function', 'describe existe')
    check(typeof it, 'function', 'it existe')
  })
})
