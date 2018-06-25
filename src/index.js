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

// The default selector is the identity function
function identityFn(n) {
  return n;
}

export default function createCopyOnWriteState(baseState) {
  let updateState = null;
  const State = React.createContext(baseState);
  // Wraps immer's produce. Only notifies the Provider
  // if the returned draft has been changed.
  function mutate(fn) {
    invariant(
      updateState !== null,
      `mutate(...): you cannot call mutate when no CopyOnWriteStoreProvider ` +
        `instance is mounted. Make sure to wrap your consumer components with ` +
        `the returned Provider, and/or delay your mutate calls until the component ` +
        `tree is moutned.`
    );
    updateState(fn);
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
    shouldComponentUpdate({ state, consume }) {
      const currentState = this.props.state;
      const currentConsume = this.props.consume;
      const hasStateChanged = state.some(
        (observedState, i) => !shallowEqual(observedState, currentState[i])
      );
      if (hasStateChanged || consume === null) {
        return hasStateChanged;
      }
      return !shallowEqual(currentConsume, consume);
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

    consumer = state => {
      const { children, select, consume, render } = this.props;
      const observedState = select.map(fn => fn(state));
      return (
        <ConsumerMemoization consume={consume} state={observedState}>
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
