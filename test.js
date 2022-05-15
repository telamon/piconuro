const test = require('tape')
const {
  notEqual,
  notEqualDeep,
  combine,
  memo,
  mute,
  init,
  gate,
  get,
  next,
  write,
  settle,
  isSync,
  iter,
  nfo,
  ERROR
} = require('.')

test('notEqual(a, b)', async t => {
  // some random primitives
  t.ok(notEqual(null, 1))
  t.ok(notEqual('a', 'b'))
  t.ok(notEqual('a', 'c'))
  t.ok(notEqual(1, 2))
  t.ok(notEqual(true, 1))
  // arrays
  t.notOk(notEqual([], []))
  t.notOk(notEqual(['a'], ['a']))
  t.notOk(notEqual(['a', 1], ['a', 1]))
  const p = { nam: 'dog', age: 'human', skills: 0 }
  t.notOk(notEqual([p], [p]))
  t.ok(notEqual([], [p]))

  // objects
  t.ok(notEqual({}, null))
  t.notOk(notEqual({}, {}))
  t.notOk(notEqual(p, p))
  t.notOk(notEqual({ a: 1 }, { a: 1 }))
  t.ok(notEqual({ a: 1 }, { a: 1, b: 2 }))
})

test('notEqualDeep(a, b)', async t => {
  const a = [
    {
      name: 'alice',
      pet: { state: 'loading' }
    }
  ]
  const b = [
    {
      name: 'alice',
      pet: { name: 'billy', type: 'iguana' }
    }
  ]
  t.ok(notEqual(a, b), 'children have different identities')
  t.ok(notEqualDeep(a, b), 'differences in children detected')
  a[0].pet = b[0].pet // a steal b's pet
  t.ok(notEqual(a, b), 'children still have different identities')
  t.not(notEqualDeep(a, b), 'equality in children detected')

  const c = [
    {
      name: 'alice',
      pet: { name: 'billy', type: 'iguana' }
    }
  ]
  t.notOk(notEqualDeep(b, c), 'detects deep equalities')

  const d = [...b]
  t.notOk(notEqual(d, b), 'shallow identity equality')
  t.notOk(notEqualDeep(d, b), 'deep check has same result')
})

// Something is off here
test('Schematic mute(): neuron that fires twice with placeholder then async value', async t => {
  const $n = init(
    'placeholder',
    mute(init('syncValue'), v => {
      // console.log('Computing:', v)
      return new Promise(resolve => {
        // console.log('Resolving for:', v)
        setTimeout(() => resolve('asyncValue'), 10)
      })
    })
  )

  const sync0 = get($n)
  t.equal(sync0, 'placeholder', 'placeholder1 visible')

  const async0 = await next($n, 0) // Issue, returns 'placeholder'
  t.equal(async0, 'placeholder', 'placeholder2 visible')

  const async1 = await next($n, 1)
  t.equal(async1, 'asyncValue', 'value resolved')
})

test('The Problem', async t => {
  const placeholder = { m: [], state: 'loading' }
  const $n = gate( // Gate final output
    init(placeholder,
      mute(
        init({ state: 'active' }), // input for mute; should never be visible
        chat => {
          chat.m = [1, 2, 3] // sync modification
          return new Promise(resolve => {
            setTimeout(() => {
              chat.m = [...chat.m, 4, 5] // async modifications
              chat.state = 'expired'
              // console.log('async resolve')
              resolve(chat)
            }, 50)
          })
        }
      )
    )
  )

  const syncValue = get($n)
  t.deepEqual(syncValue, placeholder, 'sync set')
  t.equal(syncValue.state, 'loading')
  const asyncValue = await next($n, 1)
  t.equal(asyncValue.m.length, 5, 'async set')
  t.equal(asyncValue.state, 'expired')
})

test('init(): a memory with initial value', async t => {
  const $n = init('hello')
  t.equal(get($n), 'hello')
  t.equal(await isSync($n), true)
})

test('init(): initializes async neuron', async t => {
  const $n = init(0, $timeout(5, 10))
  const v = await next($n)
  t.equal(v, 5)
})

test('mute(): modifies all values', async t => {
  const $n = mute(
    init(5),
    x => x + 2
  )
  t.equal(get($n), 7)
  t.equal(await isSync($n), true)
})

test('mute(): handles promises', async t => {
  const $n = mute(
    init(5),
    async x => x + 2
  )
  t.equal(await next($n, 0), 7)

  const $nErr = mute(init(5),
    async () => { throw new Error('MockError') }
  )

  // async errors should be passed upwards
  const result = await next($nErr, 0)
  // Current design passes an error Symbol upwards
  // and logs the error as a last resort.
  // Errors should be handled within an async mute callback
  // maybe unsub() on ERROR for failfast behaviour
  t.equal(result, ERROR)
  t.equal(await isSync($n), false)
})

test('mute(): resolves correct order', async t => {
  const $n = mute($interval(6), async i => {
    return new Promise(resolve =>
      setTimeout(() => resolve(i), Math.random() * 100)
    )
  })
  const res = []
  for await (const i of iter($n, 6)) {
    res.push(i)
  }
  t.deepEqual(res, [0, 1, 2, 3, 4, 5])
})

test('mute(): asynchronity does not leak', async t => {
  const $n = init(-1, mute($interval(10, 10), async i => {
    return new Promise(resolve => {
      const ms = 50 + Math.random() * 200
      // console.log('Starting timer ', i, ms)
      setTimeout(() => resolve(i), ms)
    })
  }))
  const res = []
  /* $n(v => res.push(v))
  $n(v => res.push(v)) */
  const a = next($n, 9)
  const b = next($n, 9)

  t.equal(await a, 8)
  t.equal(await b, 8)
  console.log(res)
})

test('iter(): returns an async iterator', async t => {
  const $n = $interval(7, 0)
  const res = []
  for await (const i of iter($n, 6)) {
    res.push(i)
  }
  t.deepEqual(res, [0, 1, 2, 3, 4, 5])
  const n = await next($n, 5) // next uses iter now
  t.equal(n, 5)
})

test('gate(): fires only onchange', async t => {
  const values = [0, 1, 1, 1, 3, 5, 5, 7]
  const $n = gate(
    mute($interval(values.length), i => values[i])
  )
  const res = []
  for await (const i of iter($n, 5)) {
    res.push(i)
  }
  t.deepEqual(res, [0, 1, 3, 5, 7])
})

test('memo(): one to many', async t => {
  const $m = memo(gate(init([0, 0],
    combine(
      mute(init(5), async x => x + 2),
      init(10)
    )
  )))

  const $n = mute(
    combine(
      mute($m, ([a, b]) => a + b),
      mute($m, ([a, b]) => a - b),
      mute($m, ([a, b]) => a * b)
    ),
    ([sum, diff, product]) => ({ sum, diff, product })
  )
  const res = await next($n, 3)
  t.equal(res.sum, 17)
  t.equal(res.diff, -3)
  t.equal(res.product, 70)
})

// TODO: fix this, issue discovered during documentation *facepalm*
test.skip('write(): should not ignore different date objects', t => {
  const now = new Date()
  const a = new Date('1984-03-24')
  const b = new Date('1999-09-10')

  const [$x, setX] = write(now)

  t.equal(get($x)?.getTime(), now.getTime())

  setX(a)
  t.equal(get($x)?.getTime(), a.getTime())

  setX(b)
  t.equal(get($x)?.getTime(), b.getTime())
})

test.skip('memo(): having fun plotting a chart', async t => {
  const $x = nfo(memo(gate(init(0, nfo($interval(9), 'int')))), 'memo')
  const $n = init([0, 0, 0, 0], mute(
    nfo(settle(nfo(combine(
      $x,
      mute($x, x => 1 + x * 0.3),
      mute($x, x => -3 + x ** 2 * 0.05),
      init(4)
    ), 'comb')), 'settle'),
    ([x, y1, y2, ceil]) => ({ x, y1, y2, ceil })
  ))
  let i = 0
  for await (const sample of iter(nfo($n, 'OUTPUT'), 10)) {
    console.log(i++, sample)
  }
  t.equal(i, 10)
})

/*
 * Async dummy neurons
 */
function $interval (max = 3, ms = 10) {
  return syn => {
    let i = 0
    console.log('Starting interval')
    let t = setInterval(() => {
      syn(i++)
      if (i >= max) {
        clearInterval(t)
        t = null
      }
    }, ms)
    return () => {
      if (t) {
        console.warn('Warn: $interval cleared before reaching max')
        clearTimeout(t)
      }
    }
  }
}

function $timeout (value, ms) {
  return sub => {
    let t = setTimeout(() => { t = null; sub(value) }, ms)
    return () => {
      if (t) {
        console.warn('Warn: $timeout cleared before fire')
        clearTimeout(t)
      }
    }
  }
}
