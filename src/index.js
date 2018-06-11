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
    shouldComponentUpdate({ state, consume }) {
      const currentState = this.props.state;
      const currentConsume = this.props.consume;
      const hasStateChanged = state.some(
        (observedState, i) => observedState !== currentState[i]
      );
      if (hasStateChanged || consume === null) {
        return hasStateChanged;
      }
      return Object.keys(consume).some(
        key => consume[key] !== currentConsume[key]
      );
    }

    render() {
      const { children, state } = this.props;
      return children(state, mutate);
    }
  }

  class CopyOnWriteConsumer extends React.Component {
    static defaultProps = {
      select: [identityFn],
      consume: null
    };

    consumer = state => {
      const { children, select, consume } = this.props;
      const observedState = select.map(fn => fn(state));
      return (
        <ConsumerMemoization consume={consume} state={observedState}>
          {children}
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
    mutate
  };
}
