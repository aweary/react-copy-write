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

## Getting Starded

react-copy-write exports a function which takes your base state and returns an object with Provider and Consumer components, along with a few other utility methods. You can use a single state instance for your entire app, or create multiple different independant state instances that interleave throughout your app.

```js
import createState from "react-copy-write";

const State = createState({
  user: null,
  loggedIn: false
});
```

## Providing State

As the name suggest, the Provider component is what provides the state. It will be initialized to the initial state passed to `createState`. The Provider component takes no props; just render it at the top-level of your application!

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

## `State.Consumer`

Consumer components let you _consume_ some portion of the state. By default that portion will be the entire state tree.

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

In the case of `UserAvatar` it's only using a single field from state, but it's reading the entire state tree and accessing the value as a deeply nested property when it renders. The problem with this is that the Consumer component doesn't really know what values your using, so Consumers that read the whole state object will re-render anytime _any_ value changes.

### Using Selectors

Luckily, this is an easy problem to solve! Consumer components let you pass in a selector function, which takes the state tree and returns some slice of it that the consumer cares about. Refactor `UserAvatar`, we get:

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

Now those `Post` components will only re-render if `UserPosts` is re-rendered (a new `userID`) or if `state.posts` gets updated somewhere else. `selector` relies on referrential equality checks between renders, so avoid returning any new objects or arrays. Feel free to return primitive values like strings or numbers! Since `"foo" === "foo"` it doesn't matter that a new string or number is returned each time.

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

This is just as bad as filtering in the selector, since a new object is returned each time. Your first thought to side-step this issue might be to use multiple consumers!

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

Now the Consumer will re-render if any of the selectors return a new value. You might be wondering, why not map the results of the `selector` array to arguments in the render callback?


## Updating State

The render callback you pass as a child to Consumer components take a second argument; an `update` function that lets you mutate a _draft_ of the current state, processed by [Immer](https://github.com/mweststrate/immer) as an immutable state update. If you're wondering how you can get immutable state by mutating state, go check out the Immer repo's README.

Let's start implementing that `Post` component we've been using:

```jsx
const Post = ({ id }) => (
  <div className="post">
    <State.Consumer selector={state => state.posts[id]}>
     {post => (
       <>
        <h1>{post.title}</h1>
        <img src={post.image}/>
        <p>{post.body}</p>
        <button>Praise</button>
       </>
     )}
    </State.Consumer>
  </div>
)
```
> You might have noticed that this running example is now a little contrived. We could just have passed the post data into the `Post` component in `UserPosts`. Just...ignore that.

`Post` just renders a div with a title, an image, some text, and a button to "Praise". We want `post.praiseCount` to be incremented everytime that button is clicked
```jsx
const Post = ({ id }) => (
  <div className="post">
    <State.Consumer selector={state => state.posts[id]}>
     {(post, update) => (
       <>
        <h1>{post.title}</h1>
        <img src={post.image}/>
        <p>{post.body}</p>
        <button onClick={() => update(draft => {
          draft.posts[id].praiseCount += 1;
        })}>Praise</button>
       </>
     )}
    </State.Consumer>
  </div>
)
```

Just mutate the value you want to change, and an immutable state update will be processed. Only those Consumer components that were observing the `praiseCount` state will be re-rendered. Here's an example of a search bar.

```jsx
const SearchBar = () => (
  <div className="search-bar">
    <State.Consumer selector={state => state.search}>
    {(search, update) => (
      <input value={state} onChange={event => update(draft => {
        draft.search = event.currentTarget.value;
      })}>
    )}
    </State.Consumer>
  </div>
)
```

One downside of this API is that it's a little syntactically awakward to call `update` inline like that.

### createUpdater

The State object returned from `createState` also provides a method called `createUpdater`. Since it's also bound to the same state instance as the returned Provider and Consumer, you can use it to make state updates outside of render.

```jsx
const setSearch = createUpdater((draft, event) => {
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
