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
  /**
   * The current state is stored in a closure, shared by the consumers and
   * the provider. Consumers still respect the Provider/Consumer contract
   * that React context enforces, by only accessing state in the consumer.
   */
  let currentState = baseState;
  let providerListener = null;
  const State = React.createContext(baseState);
  // Wraps immer's produce. Only notifies the Provider
  // if the returned draft has been changed.
  function mutate(fn) {
    invariant(
      providerListener !== null,
      `mutate(...): you cannot call mutate when no CopyOnWriteStoreProvider ` +
        `instance is mounted. Make sure to wrap your consumer components with ` +
        `the returned Provider, and/or delay your mutate calls until the component ` +
        `tree is moutned.`
    );
    const nextState = produce(currentState, draft => fn(draft, currentState));
    if (nextState !== currentState) {
      currentState = nextState;
      providerListener();
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
    state = this.props.initialState || currentState;

    componentDidMount() {
      invariant(
        providerListener === null,
        `CopyOnWriteStoreProvider(...): There can only be a single ` +
          `instance of a provider rendered at any given time.`
      );
      providerListener = this.updateState;
      // Allow a Provider to initialize state from props
      if (this.props.initialState) {
        currentState = this.props.initialState;
      }
    }

    componentWillUnmount() {
      providerListener = null;
      currentState = baseState;
    }

    updateState = () => {
      this.setState(currentState);
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
    shouldComponentUpdate({ state, consume, id }) {
      const currentState = this.props.state;
      return (
        id !== this.props.id ||
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
     * In order to accomplish this we use gDSFP to track an ID which represents the
     * "version" of the Consumer. gDSFP won't be called for a Context update, so if
     * the ID changes we know that the parent has re-rendered.
     */
    static getDerivedStateFromProps(props, state) {
      return { id: state.id + 1 };
    }

    state = { id: 0 };

    consumer = state => {
      const { id } = this.state;
      const { children, select, render } = this.props;
      const observedState = select.map(fn => fn(state));
      return (
        <ConsumerMemoization id={id} state={observedState}>
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
