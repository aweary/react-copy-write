/**
 *                       _                                                    _ _
 *                      | |                                                  (_| |
 *   _ __ ___  __ _  ___| |_ ______ ___ ___  _ __  _   _ ________      ___ __ _| |_ ___
 *  | '__/ _ \/ _` |/ __| __|______/ __/ _ \| '_ \| | | |______\ \ /\ / | '__| | __/ _ \
 *  | | |  __| (_| | (__| |_      | (_| (_) | |_) | |_| |       \ V  V /| |  | | ||  __/
 *  |_|  \___|\__,_|\___|\__|      \___\___/| .__/ \__, |        \_/\_/ |_|  |_|\__\___|
 *                                          | |     __/ |
 *                                          |_|    |___/
 *
 * Provides a mutable API with immutable state for React. Powered
 * by immer and React.createContext.
 */
import React, { Component } from "react";
import produce from "immer";
import invariant from "invariant";
import shallowEqual from "fbjs/lib/shallowEqual";
import createContext from "create-react-context";

// The default selector is the identity function
function identityFn(n) {
  return n;
}

export default function createCopyOnWriteState(baseState) {
  let updateState = null;
  let mutateQueue = [];
  const State = createContext(baseState);
  // Wraps immer's produce. Only notifies the Provider
  // if the returned draft has been changed.
  function mutate(fn) {
    // If provider doesn't mounted yet, enqueue requests
    if (updateState === null) {
      mutateQueue.unshift(fn);
    } else {
      updateState(fn);
    }
  }

  /**
   * Currently createSelector is just the identity function. The long-term
   * goal is for it to be a way to create optimizable selectors using React's
   * unstable_observedBits Context API. The implementation of that
   * optimization strategy is currently still in development, but I want people
   * to start using createSelector now. Then, when it *does* get optimized, there
   * will be changes required from users.
   */
  function createSelector(fn) {
    return fn;
  }

  class CopyOnWriteStoreProvider extends React.Component {
    state = this.props.initialState || baseState;

    componentDidMount() {
      invariant(
        updateState === null,
        `CopyOnWriteStoreProvider(...): There can only be a single ` +
          `instance of a provider rendered at any given time.`
      );

      updateState = this.updateState;

      // dequeue and call requests that pushed the queue before
      // provider mounted
      while (mutateQueue.length > 0) {
        const fn = mutateQueue.pop();
        updateState(fn);
      }
    }

    componentWillUnmount() {
      updateState = null;
    }

    updateState = fn => {
      this.setState(state => {
        const nextState = produce(state, draft => fn(draft, state));
        if (nextState === state) {
          return null;
        }
        return nextState;
      });
    };

    render() {
      return (
        <State.Provider value={this.state}>
          {this.props.children}
        </State.Provider>
      );
    }
  }

  class ConsumerMemoization extends React.Component {
    shouldComponentUpdate({ state, consume, version }) {
      const currentState = this.props.state;
      return (
        version !== this.props.version ||
        state.some(
          (observedState, i) => !shallowEqual(observedState, currentState[i])
        )
      );
    }

    render() {
      const { children, state } = this.props;
      return children.apply(null, state);
    }
  }

  class CopyOnWriteConsumer extends React.Component {
    static defaultProps = {
      select: [identityFn],
      consume: null
    };

    /**
     * Consumers need to differentiate between updates coming
     * through Context, and updates triggered by a parent re-rendering.
     *
     * In the case of a Context update, we want to avoid re-rendering the Consumer
     * unless state has changed.
     *
     * In the case of a parent re-rendering, we want to ere on the side of caution
     * and render the Consumer again, just in case it's also using values from props.
     *
     * In order to accomplish this we use gDSFP to track an integer which represents the
     * "version" of the Consumer. gDSFP won't be called for a Context update, so if
     * the version changes we know that the parent has re-rendered.
     */
    static getDerivedStateFromProps(props, state) {
      return { version: state.version + 1 };
    }

    state = { version: 0 };

    consumer = state => {
      const { version } = this.state;
      const { children, select, render } = this.props;
      const observedState = select.map(fn => fn(state));
      return (
        <ConsumerMemoization version={version} state={observedState}>
          {typeof render === "function" ? render : children}
        </ConsumerMemoization>
      );
    };

    render() {
      return <State.Consumer>{this.consumer}</State.Consumer>;
    }
  }

  return {
    Provider: CopyOnWriteStoreProvider,
    Consumer: CopyOnWriteConsumer,
    mutate,
    createSelector
  };
}
