<div align="center">
<h1>react-copy-write</h1>

<a href="https://emojipedia.org/writing-hand/">
<img height="80" width="80" alt="goat" src="https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/131/writing-hand_270d.png" />
</a>

An immutable React state management library with a simple mutable API, memoized selectors, and structural sharing. Powered by [Immer](https://github.com/mweststrate/immer).

</div>

<hr />


## Installation

react-copy-write requires React 16.3 or later, as it depends on the new `React.createContext` API.

```bash
yarn add react-copy-write
```

## Usage

react-copy-write exports a function which takes your base state and returns an object with the `Provider` and `Consumer` components, along with a few other utility methods.

```js
import createState from 'react-copy-write'

const UserState = createState({
  user: null,
  loggedIn: false,
});
```
