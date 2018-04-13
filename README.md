<div align="center">
<h1>react-copy-write</h1>

<a href="https://emojipedia.org/writing-hand/">
<img height="80" width="80" alt="goat" src="https://emojipedia-us.s3.amazonaws.com/thumbs/240/twitter/131/writing-hand_270d.png" />
</a>

An immutable React state management library with a simple mutable API, memoized selectors, and structural sharing. Powered by [Immer](https://github.com/mweststrate/immer).

[Check out this small demo.](https://codesandbox.io/s/yp34vpk50j)

</div>

## Overview

The benefits of immutable state are clear, but maintaining that immutable state can sometimes be burdensome and verbose: updating a value more than one or two levels deep in your state tree can require lots of object/array spreading, and it's relatively easy to accidently mutate something.

react-copy-write lets you use straightforward mutations to update an immutable state tree, thanks to [Immer](https://github.com/mweststrate/immer). Since Immer uses the [copy-on-write](https://en.wikipedia.org/wiki/Copy-on-write) technique to update immutable values, we get the benefits of structural sharing and memoization. This means react-copy-write not only lets you use simple mutations to update state, but it's also very efficient about re-rendering.

## Documentation

* [Installation](#installation)
* [Getting Started](#getting-started)
* [Providing State](#providing-state)
* [Consuming State](#consuming-state)
  * [Using Selectors](#using-selectors)
  * [Deriving State in Selectors](#deriving-state-in-selectors)
  * [Composing Selectors](#composing-selectors)
  * [Applying Multiple Selectors](#applying-multiple-selectors)
* [Updating State](#updating-state)
  * [`createUpdater`](#createupdater)

## Installation

react-copy-write requires React 16.3 or later, as it depends on the new `React.createContext` API.

```bash
yarn add react-copy-write
```

## Getting Starded

react-copy-write exports a function which takes your base state and returns an object with Provider and Consumer components, along with a few other utility methods. You can use a single state instance for your entire app, or create multiple different independant state instances that interleave throughout your app.

```js
import createState from "react-copy-write";

// You can namespace the components by accessing them as properties,
// e.g., State.Provider / State.Consumer
const State = createState({
  user: null,
  loggedIn: false
});
// Or destructure if you'd like
const { Provider, Consumer } = createState({
  user: null,
  loggedIn: false
});
```

## Providing State

The Provider component is what provides the state (crazy, right?). When the Provider component mounts the initial state will be whatever you passed to `createState`. The Provider component takes no props, and expects that all the associated Consumer components will be rendered as descendants.

```jsx
class App extends React.Component {
  render() {
    return (
      <State.Provider>
        <AppBody />
      </State.Provider>
    );
  }
}
```

You can only ever render a single instance of a given Provider.

## Consuming State

Consumer components let you _consume_ or _observe_ some portion of the state. By default that portion will be all of the state.
Lets look at this through a series of examples. Here we have a `UserAvatar` component, that wants to render an avatar for some given user.

```jsx
const UserAvatar = ({ id }) => (
  <State.Consumer>
    {state => (
      <div className="avatar">
        <img src={state.users[id].avatar.src} />
      </div>
    )}
  </State.Consumer>
);
```

The `State.Consumer` component expects a render callback as a child, just like the React context consumer it wraps. That render callback will be called with the current state. The problem with this is that whenever any value in `state` changes, `UserAvatar` will be re-rendered, even though it's only using a single property from a single, nested object.

### Using Selectors

To avoid the problem of observing too much state, Consumer components let you pass in a selector function. A selector takes the current state and returns only the subset of that state that the Consumer cares about. Refactoring `UserAvatar`, we get:

```jsx
const UserAvatar = ({ id }) => (
  <State.Consumer selector={state => state.users[id].avatar}>
    {avatar => (
      <div>
        <img src={avatar.src} />
      </div>
    )}
  </State.Consumer>
);
```

Using the `selector` prop, we pick out the `avatar` object from this user's entry in state. Now, `UserAvatar` will only ever re-render if that `avatar` object changes. This is possible because `react-copy-write` is powered by [Immer](https://github.com/mweststrate/immer) and Immer uses [structural sharing](https://en.wikipedia.org/wiki/Persistent_data_structure), which means that it will re-use unchanged portions of the state tree whenever it's updated.

### Deriving State in Selectors

You may be tempted to use selectors to derive some _new_ kind of state. This is a common and useful pattern as your state shape rarely maps 1:1 to your view. The problem with doing it in selectors is that `react-copy-write` needs selectors to main referential equailty on every render.

For example, maybe you have a list of blog posts and you want to filter them based on their author.

```js
const UserPosts = ({ userId }) => (
  <State.Consumer
    selector={state => state.posts.filter(post => post.id === userId)}
  >
    {userPosts => userPosts.map(post => <Post {...post} />)}
  </State.Consumer>
);
```

This works, but now everytime the `selector` function is called, a new filtered array is returned. That means that `UserPosts` will re-render needlessly. If you can, move that filtering into the render callback.

```jsx
const UserPosts = ({ userId }) => (
  <State.Consumer selector={state => state.posts}>
   {posts => {
     const filteredPosts = posts.filter(post => post.id === userId)
     return userPosts.map(post => <Post {...post} />)
   }
  </State.Consumer>
)
```

Now those `Post` components will only re-render if `UserPosts` is re-rendered (a new `userID`) or if `state.posts` gets updated somewhere else. `selector` relies on referrential equality checks between renders, so avoid returning any new objects or arrays. Since it's relying on `===` feel free to return primitive values like strings or numbers which maintain that strict equality between instances.

### Composing Selectors

In some cases, deriving state involves reading from other parts of your state. Maybe we want the `UserPosts` component to read the user's ID from state too. If you didn't heed the above advice, you might try something like:

```jsx
const UserPosts = () => (
  <State.Consumer selector={state => ({ posts: state.posts, userId: state.user.id }}>
   {{posts, userId} => {
     const filteredPosts = posts.filter(post => post.id === userId)
     return posts.map(post => <Post id={post.id} />)
   }
  </State.Consumer>
)
```

This is just as bad as filtering in the selector, since a new object is returned each time. A naive solution (AKA, what I tried to do first) would be to nest Consumers.

```jsx
const UserPosts = () => (
  <State.Consumer selector={state => state.posts}>
    {posts => (
      <State.Consumer selector={state => state.user.id}>
        {userId => {
          const filteredPosts = posts.filter(post => post.id === userId);
          return posts.map(post => <Post id={post.id} />);
        }}
      </State.Consumer>
    )}
  </State.Consumer>
);
```

This is a good thought, but the problem is that Consumers are very protective about re-renders. They'll only render if the state they're observing changes. So if `state.posts` changes but `state.user.id` doesn't, it won't update. You could wrap the inner Consumer in it's own component and pass in `posts` as a prop to trigger a render. This isn't a _terrible_ solution, but it means you're creating a bunch of wrapper components where you normally wouldn't.

### Applying Multiple Selectors

To solve this, Consumers can accept an array of selectors.

```jsx
const UserPosts = () => (
  <State.Consumer selector={[state => state.posts, state => state.userId]}>
    {[posts, userId] =>
        const filteredPosts = posts.filter(post => post.id === userId)
        return posts.map(post => <Post id={post.id} />)
    )}
  </State.Consumer>
)
```

Now the Consumer will re-render if any of the selectors return a new value.

## Updating State

The render callback you pass as a child to Consumer components take a second argument; a `mutate` function that lets you mutate a _draft_ of the current state, processed by [Immer](https://github.com/mweststrate/immer) as an immutable state update. If you're wondering how you can get immutable state by mutating state, go check out the Immer repo's README.

Let's start implementing that `Post` component we've been using:

```jsx
const Post = ({ id }) => (
  <div className="post">
    <State.Consumer selector={state => state.posts[id]}>
      {post => (
        <>
          <h1>{post.title}</h1>
          <img src={post.image} />
          <p>{post.body}</p>
          <button>Praise</button>
        </>
      )}
    </State.Consumer>
  </div>
);
```

`Post` just renders a div with a title, an image, some text, and a button to "Praise". We want `post.praiseCount` to be incremented everytime that button is clicked.

```jsx
const Post = ({ id }) => (
  <div className="post">
    <State.Consumer selector={state => state.posts[id]}>
      {(post, mutate) => (
        <>
          <h1>{post.title}</h1>
          <img src={post.image} />
          <p>{post.body}</p>
          <button
            onClick={() =>
              // Here's the magic:
              mutate(draft => {
                draft.posts[id].praiseCount += 1;
              })
            }
          >
            Praise
          </button>
        </>
      )}
    </State.Consumer>
  </div>
);
```

Mutate the value you want to change, and an immutable state update will be processed. Only those Consumer components that were observing the `praiseCount` state will be re-rendered. Here's another example; a simple search bar.

```jsx
const SearchBar = () => (
  <div className="search-bar">
    {/* Use a selector to only observe state.search */}
    <State.Consumer selector={state => state.search}>
      {(search, mutate) => (
        <input
          value={state}
          onChange={event =>
            mutate(draft => {
              // Update draft.search (which will end up being state.search) via mutation
              draft.search = event.currentTarget.value;
            })
          }
        />
      )}
    </State.Consumer>
  </div>
);
```

One issue with `mutate` being provided via a render callback is that you now have to either inline the functions calling it in render, or pass it as a prop to another component to use it in another lifecycle.

### `createMutator`

The State object returned from `createState` also provides a method called `createMutator`. Since it's also bound to the same state instance as the returned Provider and Consumer, you can use it to make state updates outside of the render callback.

```jsx
const createMutator = State.createMutator;

// Statically define your mutation method. If this were a class component, you
// could define it as an instance property.
const setSearch = createMutator((draft, event) => {
  const {value} = event.currentTarget;
  draft.search = value;
});

const SearchBar = () => (
  <div className="search-bar">
    <State.Consumer selector={state => state.search}>
    {(search) => (
      <input value={state} onChange={setSearch}>
    )}
    </State.Consumer>
  </div>
)
```
