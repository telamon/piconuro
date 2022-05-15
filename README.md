[`pure | 📦`](https://github.com/telamon/create-pure)
[`code style | standard`](https://standardjs.com/)
# piconuro

> A functional approach to the reactive-store pattern
> delivering indiscriminate minimalism.

Nuro let's you build [https://en.wikipedia.org/wiki/Reactive_programming](reactive) pathways using only functions.

It's a part of [picostack](https://github.com/telamon/picostack) created
to develop famework-agnostic app-kernels/blockends that can be easily
unit-tested and run in both node and browser.

Aside from having a smaller API it offers similar workflows as
svelte/stores or react/useState but without dependencies.

### The Contract
- A __neuron__ is a function that takes a __callback__ as input and returns an `unsubscribe` function.
- The __callback__ is invoked synchroneously once during subscribe
- The __callback__ is invoked every time the neuron fires.
- After `unsubscribe` is called, the __callback__ is nolonger invoked.


## Use

```bash
$ npm install piconuro
```

```js
import { init } = require('piconuro')

const $n = init('Hello')

// Subscribe
const unsubscribe = $n(value => console.log(value))

// Unsubscribe
unsubscribe()
```

# API

> We prepend all neurons with a `$`-sign to avoid confusing them with values.

`$n` is an imaginary neuron

If you're having issues and need to inspect your neural path
don't fret, just insert an `nfo()` neuron in your pathway.

### `write (value) // => [$n, setter]`

A writable neuron, easiest way to start a new path.

```js
const [$name, setName] = writable('')
setName('bobby')
```

### `init (value, $n)`

Init is an immutable neuron that fires the initial value once.
Use it to create placeholders or build new pathways.

Example:
```js
const $age = init(28)
const $postType = init('image')
const $friends = init([])
```

If optional `$n` was passed, then init will fire a second time
with the value of `$n` resolves

Example of a neuron that fires `true`, and after
1 second delay notifies all existing and future subscribers with `false`:

```js
const $loading = init(
  true,
  when(new Promise(resolve =>
    setTimeout(() => resolve(false), 1000)
  ))
)
```

### `mute ($n, fn)`
Short for `MUTatE`, mutates input values
using return value of provided `fn`-function.

> Fires on immediate or async result.

If `fn` is an async function or you return a promise.
Then the output will fire when the value resolves.

Does not fire placeholders, prepend with init() if you need an
immediate sync value.

Sync example:
```js
[$x, setX] = write(0)
const $squared = mute($x, x => x * x)

setX(2) // $squared fires: 4
setX(8) // $squared fires: 64
```

Async example that fetch comments for a post whenever `$postId` changes:

```js
[$postId, setPostId] => write(77)

$comments => init(
 [], // Empty array as placeholder
 mute($postId, async id => {
  const resp = await fetch(`https://dinosaurTech/api/posts/${id}`)
  return JSON.parse(resp.data)
 })
)

// Connect $comments to console.log
$comments(value => console.log('Comments: ', value))

setPostId(32) // causes mute to fire a second time with a different set.
```

### `combine (...neurons)`
A neuron that combines the output of multiple neurons into a single output.
The first output is held until all neurons have fired once.

There are two ways of using it.

Passing a list of neurons:
```js
const $n = combine($dogAge, $numberofCats, $year)

$n(console.log) // Outputs an array
// => [13, 2, 2022]
```

Or passing a map of neurons:
```js
const $n = combine({
  age: $dogAge,
  cats: $numberofCats,
  year: $year
})

$n(console.log) // Outputs an object
// => { age: 13, cats: 2, year: 2022 }
```

### `memo ($n)`

One to many neuron (opposite of combine)
Memo is similar to an EventEmitter that keeps a list of
subscribers/connections and remembers the last fired value
so new subscribers do not re-trigger the entire pathway.

Use memo to tradeoff computation for memory if you have
multiple dynamic subscribers.

### `gate ($n, shallow = false)`

Gate dirty-checks values that passes through it, preventing
the path from firing same value twice.

Example:

```js
const [$x, setX] = write(0)

const $n = gate($x) // $n is gated version of $x

$n(console.log) // pipe $n to console.log

setX(2) // logs '2'
setX(3) // logs '3'
setX(3) // Nothing fired
setX(0) // logs '0'
```

### `nfo ($n, name)`

This neuron logs all values passes through it.
It's a very useful tool to inspect your path showing when
subscribers connect and disconnect.

```js
const { write, gate, mute, nfo } = require('.')
// or:  import { write, gate, mute, nfo } from 'piconuro'

const [$birthday, setBirthday] = write(new Date())

const $age = nfo(
  mute($birthday, dob => new Date().getYear() - dob.getYear()),
  'Age'
)

const $ageCheck = gate(
  mute($age, age => age > 13)
)
const $n = nfo($ageCheck, 'Check')

const unsub = $n(v => console.log('Final Output', v)) // connect dummy

setBirthday(new Date('1984-03-24'))
setBirthday(new Date('1999-09-10'))
setBirthday(new Date('2018-07-01'))

unsub() // disconnect dummy
```

### `when (promise)`

Experimental promise to async neuron converter.
fires once when promise resolves or symbol `ERROR` if promise rejects.

### `settle (neuron, debounceMs = 10, risingEdge = false)`

Buffers a signal and outputs last value

> ⚠️WARNING⚠️
> Use with care, this neuron introduces unchecked asyncronity into
> your path causing racing conditions along the way.
> Only use is for buffering final outputs to silly frameworks such as react
> that render with a built-in rising-edge buffer. 🤦

## Helpers

### `get (neuron) // => value`

Gets the synchroneous value of a neuron

```js
const $n = init('Hello')
const v = get($n)
console.log(v) // => 'Hello'
```

### `next (neuron, skip = 1, inspect = false) // => Promise`

Async version of get() that `skip`-s amount of values before resolving.

Imagine a neuron value stream to be an array:
['a', 'b', 'c']
setting `skip` to 0 will return 'a', set it to 2 to get 'c'

```js
const value = await next($n)
```

### `until (neuron, condition, timeout = -1) // => Promise`

Sibling of next(), an async utility getter that
resolves value when 'condition'-function returns truthy.

```js
const hiFive = await until($clock, time => t > 5)
```


### `isSync (neuron, ms = 100) // => Promise`

Utility method that tests a neuron for synchronity.
returns true if and only if the neuron fired once immediately
throws error if the neuron did not fire within the grace period.

Designed to make unit-testing easier

```js
import { $users } from './blockend.js'

testOk(await isSync($users), 'Users output has a placeholder')
```

### `* iter (neuron, nValues = 5)`

Converts a neuron into an async iterator:
- {neuron} Neuron to generate from
- {nValues} Number of values to generate, 1 will yield 1 value, setting it to -1 will cause an eternal loop.

```js
$clock = ... // imaginary clock neuron that fires once every second.

for await (const time of iter(clock)) {
  console.log('The time is:', time)
}
```

## Donations

```ad
|  __ \   Help Wanted!     | | | |         | |
| |  | | ___  ___ ___ _ __ | |_| |     __ _| |__  ___   ___  ___
| |  | |/ _ \/ __/ _ \ '_ \| __| |    / _` | '_ \/ __| / __|/ _ \
| |__| |  __/ (_|  __/ | | | |_| |___| (_| | |_) \__ \_\__ \  __/
|_____/ \___|\___\___|_| |_|\__|______\__,_|_.__/|___(_)___/\___|

If you're reading this it means that the docs are missing or in a bad state.

Writing and maintaining friendly and useful documentation takes
effort and time.


  __How_to_Help____________________________________.
 |                                                 |
 |  - Open an issue if you have questions!         |
 |  - Star this repo if you found it interesting   |
 |  - Fork off & help document <3                  |
 |  - Say Hi! :) https://discord.gg/K5XjmZx        |
 |.________________________________________________|
```


## Changelog

### 0.1.0 first release

## Contributing

By making a pull request, you agree to release your modifications under
the license stated in the next section.

Only changesets by human contributors will be accepted.

## License

[AGPL-3.0-or-later](./LICENSE)

2022 &#x1f12f; Tony Ivanov
