<div align="center">
<h1>react-copy-write</h1>

<a href="https://emojipedia.org/writing-hand/">
<img height="80" width="80" alt="goat" src="https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/131/writing-hand_270d.png" />
</a>

An immutable React state management library with a simple mutable API, memoized selectors, and structural sharing. Powered by [Immer](https://github.com/mweststrate/immer).

</div>

## Overview

The benefits of immutable state are clear, but maintaining that immutable state can sometimes be burdensome and verbose: updating a value more than one or two levels deep in your state tree can require lots of object/array spreading, and it's relatively easy to accidentally mutate something.

react-copy-write lets you use straightforward mutations to update an immutable state tree, thanks to [Immer](https://github.com/mweststrate/immer). Since Immer uses the [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write) technique to update immutable values, we get the benefits of structural sharing and memoization. This means react-copy-write not only lets you use simple mutations to update state, but it's also very efficient about re-rendering.

## Documentation

react-copy-write is currently under-going significant API changes as it's tested in a production environment. Most documentation has been removed until we arrive at a stable API. Below you will find a bare-bones API reference that should get you started.


# `createState`

The default export of the package. Takes in an initial state object and returns a collection of components and methods for reading, rendering, and updating state.


```jsx
import createState from 'react-copy-write'

const {
  Provider,
  Consumer,
  createSelector,
  mutate,
} = createState({name: 'Brandon' });
```

# `Provider`

The Provider component provides state to all the consumers. All Consumer instances associated with a given provider must be rendered as children of the Provider.

```jsx
const App = () => (
  <Provider>
    <AppBody />
  </Provider>
)
```

If you need to initialize state from props you can use the `initialState` prop to do so. Note that it only initializes state, updating `initialState` will have no effect.

```jsx
const App = ({user}) => (
  <Provider initialState={{name: user.name }}>
    <AppBody />
  </Provider>
)
```


## `Consumer`

A Consumer lets you _consume_ some set of state. It uses a [render prop](https://reactjs.org/docs/render-props.html#use-render-props-for-cross-cutting-concerns) as a child for accessing and rendering state. This is identical to the [React Context Consumer API](https://reactjs.org/docs/context.html#consumer).

```jsx
const Avatar = () => (
  <Consumer>
   {state => (
     <img src={state.user.avatar.src} />
   )}
  </Consumer>
)
```

The render callback is always called with a tuple of the observed state, using an array. By default that tuple contains one element: the entire state tree.

### Selecting State

If a Consumer observes the entire state tree then it will update anytime _any_ value in state changes. This is usually not what you want. You can use the `select` prop to select a set of values from state that a Consumer depends on.

```jsx
const Avatar = () => (
  <Consumer select={[state => state.user.avatar.src]}>
    {src => <img src={src} />}
  </Consumer>
)
```

Now the Avatar component will only re-render if `state.user.avatar.src` changes. If a component depends on multiple state values you can just pass in more selectors.

```jsx
const Avatar = () => (
  <Consumer select={[
    state => state.user.avatar.src,
    state => state.theme.avatar,
  ]}>
    {(src, avatarTheme) => <img src={src} style={avatarTheme} />}
  </Consumer>
)
```

## Updating State

`createState` also returns a `mutate` function that you can use to make state updates.

```js
const {mutate, Consumer, Provider} = createState({...})
```

Mutate takes a single function as an argument, which will be passed a "draft" of the current state. This draft is a mutable copy that you can edit directly with simple mutations

```js
const addTodo = todo => {
  mutate(draft => {
    draft.todos.push(todo);
  })
}
```

You don't have to worry about creating new objects or arrays if you're only updating a single item or property. 

```js
const updateUserName = (id, name) => {
  mutate(draft => {
    // No object spread required 😍
    draft.users[id].name = name;
    draft.users[id].lastUpdate = Date.now();
  })
}
```

Check out [the Immer docs for more information](https://github.com/mweststrate/immer).

Since `mutate` is returned by `createState` you can call it anywhere. If you've used Redux you can think of it like `dispatch` in that sense.


## Optimized Selectors

`createState` also returns a `createSelector` function which you can use to create an _optimized selector_. This selector should be defined outside of render, and ideally be something you use across multiple components.

```jsx
const selectAvatar = createSelector(state => state.user.avatar.src);
```

You can get some really, really nice speed if you use this and follow a few rules:

### Don't call `createSelector` in render.


🚫
```jsx
const App = () => (
  // Don't do this 
  <Consumer select={[createSelector(state => state.user)]}>
    {...}
  </Consumer>
)
```

👍
```jsx
// Define it outside of render!
const selectUser = createSelector(state => state.user);
const App = () => (
  <Consumer select={[selectUser]}>
    {...}
  </Consumer>
)
```

### Avoid mixing optimized and un-optimized selectors

🚫
```jsx
const selectUser = createSelector(state => state.user);
const App = () => (
  // This isn't terrible but the consumer gets de-optimized so
  // try to avoid it
  <Consumer select={[selectUser, state => state.theme]}>
    {...}
  </Consumer>
)
```

👍
```jsx
const selectUser = createSelector(state => state.user);
const selectTheme = createSelector(state => state.theme);
const App = () => (
  <Consumer select={[selectUser, selectTheme]}>
    {...}
  </Consumer>
)
```

