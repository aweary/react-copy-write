import React from "react";
import { render, fireEvent, Simulate } from "react-testing-library";
import createState from "../src";

let Provider;
let Consumer;
let mutate;

const baseState = {
  search: "",
  loggedIn: true,
  user: {
    name: "Bob Ross",
    handle: "happylittlemistake",
    id: 42
  },
  posts: [
    {
      id: "e7db2fe4-ebae-4a71-9722-9433ebdc3108",
      title: "The Dark Side of Painting",
      subtitle: "And I don't mean Midnight Black",
      body: "...",
      authorID: 24
    },
    {
      id: "bcdcf6ba-8978-453f-8a4a-dbdd6705e2d4",
      title: "The Joy of Painting",
      subtitle: "(thats the name of the show)",
      body: "!!!",
      authorID: 42
    }
  ]
};

describe("copy-on-write-store", () => {
  beforeEach(() => {
    const State = createState(baseState);
    Provider = State.Provider;
    Consumer = State.Consumer;
    mutate = State.mutate;
  });

  it("updates state", () => {
    const log = [];
    let updater;
    class App extends React.Component {
      render() {
        return (
          <Provider>
            <div>
              <Consumer>
                {state => {
                  log.push(state);
                  return null;
                }}
              </Consumer>
            </div>
          </Provider>
        );
      }
    }
    render(<App />);
    // First render is the base state
    expect(log).toEqual([baseState]);
    mutate(draft => {
      draft.user.name = "Mithrandir";
    });
    // Second render should have the updated user
    expect(log[1].user.name).toBe("Mithrandir");
    // Other fields shouldn't have been updated
    expect(log[0].posts).toEqual(log[1].posts);
  });

  it("doesnt update state if no change was made", () => {
    let log = [];
    class App extends React.Component {
      render() {
        return (
          <Provider>
            <div>
              <Consumer>
                {state => {
                  log.push(state);
                  return null;
                }}
              </Consumer>
            </div>
          </Provider>
        );
      }
    }
    render(<App />);
    // First render is the base state
    expect(log).toEqual([baseState]);
    log = [];
    mutate(draft => {
      // Noop, no update made
    });
    // No update should be processed
    expect(log).toEqual([]);
    mutate(draft => {
      // Update to the current value, no update should be processed
      draft.loggedIn = true;
    });
    expect(log).toEqual([]);
  });

  it("memoizes selectors", () => {
    let log = [];
    let updater;
    class App extends React.Component {
      render() {
        return (
          <Provider>
            <Consumer select={[state => state.user]}>
              {user => {
                log.push("Render User");
                return null;
              }}
            </Consumer>
            <Consumer select={[state => state.posts]}>
              {posts => {
                log.push("Render Posts");
                return null;
              }}
            </Consumer>
            <Consumer select={[state => state]}>
              {state => {
                log.push("Render State");
                return null;
              }}
            </Consumer>
          </Provider>
        );
      }
    }
    render(<App />);
    expect(log).toEqual(["Render User", "Render Posts", "Render State"]);
    log = [];
    mutate(draft => {
      draft.user.id = 5;
    });
    // Shouldn't re-render Posts
    expect(log).toEqual(["Render User", "Render State"]);
  });

  it("supports multiple selectors", () => {
    let log = [];
    const UserPosts = ({ children }) => (
      <Consumer select={[state => state.user.id, state => state.posts]}>
        {(userID, posts) => {
          const userPosts = posts.filter(post => post.authorID === userID);
          return children(userPosts);
        }}
      </Consumer>
    );

    class App extends React.Component {
      render() {
        return (
          <Provider>
            <div>
              <UserPosts>
                {posts => {
                  log.push(posts);
                  return null;
                }}
              </UserPosts>
              <Consumer>
                {state => {
                  log.push("Render Consumer");
                  return null;
                }}
              </Consumer>
            </div>
          </Provider>
        );
      }
    }
    render(<App />);
    expect(log).toEqual([
      // Assumes that only the second post is associated with the user
      [baseState.posts[1]],
      "Render Consumer"
    ]);
    log = [];
    mutate(draft => {
      draft.loggedIn = false;
    });
    // Shouldn't have re-rendered UserPosts
    expect(log).toEqual(["Render Consumer"]);
  });

  it("handles selectors that return arrays", () => {
    const { Provider, Consumer, mutate } = createState({
      items: [1, 1, 2]
    });
    const removeItem = n =>
      mutate(draft => {
        draft.items = draft.items.filter(item => item !== n);
      });
    let log = [];
    class App extends React.Component {
      render() {
        return (
          <Provider>
            <div>
              <Consumer select={[state => state.items]}>
                {items => {
                  log.push(items.join());
                  return null;
                }}
              </Consumer>
            </div>
          </Provider>
        );
      }
    }
    render(<App />);
    expect(log).toEqual(["1,1,2"]);
    removeItem(2);
    expect(log).toEqual(["1,1,2", "1,1"]);
  });

  it("Providers can initialize state via props", () => {
    const { Provider, Consumer, mutate } = createState({
      items: [0]
    });
    const addItem = item => {
      mutate(draft => {
        draft.items.push(item);
      });
    };
    let log = [];
    const App = ({ initialState }) => (
      <Provider initialState={initialState}>
        <div>
          <Consumer select={[state => state.items]}>
            {items => {
              log.push(items.join());
              return null;
            }}
          </Consumer>
        </div>
      </Provider>
    );
    const { rerender } = render(<App initialState={{ items: [1, 2, 3] }} />);
    expect(log).toEqual(["1,2,3"]);
    log = [];
    rerender(<App initialState={{ items: [4, 5, 6] }} />);
    addItem(4);
    expect(log).toEqual([
      // Should re-render with initial state (because its parent re-rendered)
      "1,2,3",
      // And with the addItem update
      "1,2,3,4"
    ]);
  });

  it("re-renders when the parent re-renders", () => {
    const { Provider, Consumer, mutate } = createState({
      foo: "foo",
      bar: "bar",
      baz: "baz"
    });
    const setFoo = value => {
      mutate(draft => {
        draft.foo = value;
      });
    };
    const setBar = value => {
      mutate(draft => {
        draft.bar = value;
      });
    };
    const setBaz = value => {
      mutate(draft => {
        draft.baz = value;
      });
    };

    let log = [];

    const InnerApp = ({ foo }) => (
      <Consumer select={[state => state.bar]}>
        {bar => {
          log.push("Render Bar: " + foo + bar);
          return null;
        }}
      </Consumer>
    );

    const App = () => (
      <Provider>
        <div>
          <Consumer select={[state => state.baz]}>
            {baz => {
              log.push("Render Baz: " + baz);
              return (
                <Consumer select={[state => state.foo]}>
                  {foo => {
                    log.push("Render Foo: " + foo);
                    return <InnerApp foo={foo} />;
                  }}
                </Consumer>
              );
            }}
          </Consumer>
        </div>
      </Provider>
    );
    render(<App />);
    expect(log).toEqual([
      "Render Baz: baz",
      "Render Foo: foo",
      "Render Bar: foobar"
    ]);
    log = [];
    setFoo("FOO");
    expect(log).toEqual(["Render Foo: FOO", "Render Bar: FOObar"]);
    log = [];
    setBaz("BAZ");
    expect(log).toEqual([
      "Render Baz: BAZ",
      "Render Foo: FOO",
      "Render Bar: FOObar"
    ]);
  });

  it("mutate with current state", () => {
    const log = [];
    let updater;
    class App extends React.Component {
      render() {
        return (
          <Provider>
            <div>
              <Consumer>
                {state => {
                  log.push(state);
                  return null;
                }}
              </Consumer>
            </div>
          </Provider>
        );
      }
    }
    render(<App />);
    // First render is the base state
    expect(log).toEqual([baseState]);
    mutate((draft, state) => {
      draft.user.id = state.user.id + 1;
    });
    // Second render should have the updated user.id
    expect(log[1].user.id).toBe(43);
    // Other fields shouldn't have been updated
    expect(log[0].posts).toEqual(log[1].posts);
  });

  it("createSelector", () => {
    let log = [];
    const { createSelector, Provider, Consumer } = createState({ foo: "foo" });
    const fooSelector = createSelector(state => state.foo);
    const App = () => (
      <Provider>
        <Consumer select={[fooSelector]}>
          {foo => {
            log.push(foo);
            return null;
          }}
        </Consumer>
      </Provider>
    );
    render(<App />);
    expect(log).toEqual(["foo"]);
  });

  it("allows objects to be returned from selectors", () => {
    let log = [];
    const { Provider, Consumer, mutate } = createState({
      foo: "foo",
      bar: "bar",
      baz: "baz",
      qux: "qux"
    });
    const setFoo = value =>
      mutate(draft => {
        draft.foo = value;
      });
    const setBaz = value =>
      mutate(draft => {
        draft.baz = value;
      });
    const setQux = value =>
      mutate(draft => {
        draft.qux = value;
      });
    const App = () => (
      <Provider>
        <Consumer
          select={[
            state => ({ foo: state.foo, bar: state.bar }),
            state => state.qux
          ]}
        >
          {({ foo, bar }, qux) => {
            log.push(foo + bar + qux);
            return null;
          }}
        </Consumer>
      </Provider>
    );
    render(<App />);
    expect(log).toEqual(["foobarqux"]);
    log = [];
    setBaz("BAZ");
    expect(log).toEqual([]);
    setFoo("FOO");
    expect(log).toEqual(["FOObarqux"]);
    log = [];
    setBaz("BAZ");
    setQux("QUX");
    setBaz("BAZ");
    setBaz("BAZ");
    expect(log).toEqual(["FOObarQUX"]);
  });

  it("supports a `render` prop on Consumers", () => {
    let log = [];
    const { Provider, Consumer } = createState({ foo: "foo" });
    const App = () => (
      <Provider>
        <Consumer
          select={[state => state.foo]}
          render={foo => {
            log.push(foo);
            return null;
          }}
        />
      </Provider>
    );
    render(<App />);
    expect(log).toEqual(["foo"]);
  });


  it("supports mutate calls before provider mounts", () => {
    let log = [];
    const { Provider, Consumer } = createState({ foo: "" });

    let waitForMount = new Promise(resolve => {
      class MutatingComponent extends React.Component {
        componentDidMount() {
          mutate(draft => {
            draft.foo = "bar";
            resolve();
          });
        }

        render() {
          return null;
        }
      }

      const App = () => (
        <Provider>
          <Consumer
            select={[state => state.foo]}
            render={foo => {
              log.push(foo);
              return null;
            }}
          />
          <MutatingComponent />
        </Provider>
      );
      render(<App />);
    });

    waitForMount.then(() => {
      expect(log).toEqual(["bar"]);
    });
  });
});
