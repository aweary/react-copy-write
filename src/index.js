/**
 * This provides a copy-on-write, immutable state for React solution powered
 * by immer and React.createContext. Thanks to immer's copy-on-write API and
 * structural sharing, we can provide a simple mutable API while maintaing
 * an immutable store behind the scenes.
 * @flow
 */
import React, { Component } from "react";
import produce from "immer";
import invariant from "invariant";

// The default selector is the identity function
function identityFn<T>(n: T): T {
  return n;
}

type updateFn<T> = ((T) => void) => void;

type ConsumerProps<T, S> = {
  selector: T => S,
  children: (S, updateFn<T>) => React$Node
};

declare function createCopyOnWriteState<T, S>(
  baseState: T
): {
  createMutator: ((T) => void) => () => void,
  Provider: React$Component<{ children: React$Node }, { state: T }>,
  Consumer: React$Component<ConsumerProps<T, S>>,
  Mutator: React$Component<{
    children: string
  }>
};

export default function createCopyOnWriteState(baseState) {
  type T = typeof baseState;
  type boundUpdater = updateFn<T>;
  // The current state is managed by a closure, shared by the consumers and
  // the provider. The consumers still respect the provider/consumer contract
  // that React context enforces, by only accessing state in the consumer.
  let currentState: T = baseState;
  let providerListener = null;
  // The React context for propagating state and updaters
  // $FlowFixMe React.createContext exists now
  const State = React.createContext(baseState);
  // Wraps immer's produce utility. Only notify the Provider
  // if the returned draft has been changed.
  function update(fn: T => void) {
    invariant(
      providerListener !== null,
      `update(...): you cannot call update when no CopyOnWriteStoreProvider ` +
        `instance is mounted. Make sure to wrap your consumer components with ` +
        `the returned Provider, and/or delay your update calls until the component ` +
        `tree is moutned.`
    );
    const nextState = produce(currentState, fn);
    if (nextState !== currentState) {
      currentState = nextState;
      providerListener();
    }
  }

  function createMutator(fn: boundUpdater) {
    return () => update(fn);
  }

  // Wrapper around State.Provider
  class CopyOnWriteStoreProvider extends React.Component<
    { children: React$Node },
    T
  > {
    state = baseState;

    componentDidMount() {
      invariant(
        providerListener === null,
        `CopyOnWriteStoreProvider(...): There can only be a single ` +
          `instance of a provider rendered at any given time.`
      );
      providerListener = this.updateState;
    }

    componentWillUnmount() {
      providerListener = null;
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

  class ConusmerIndirection<S> extends React.Component<{
    children: (S, updateFn<T>) => React$Node,
    state: S
  }> {
    // This simpler than using PureComponent; we don't
    // need to do a shallowEquals check since we rely on
    // referential equality thanks to immer's structural sharing
    shouldComponentUpdate(nextProps) {
      return this.props.state !== nextProps.state;
    }

    render() {
      const { children, state } = this.props;
      return children(state, update);
    }
  }

  class CopyOnWriteConsumer<S> extends React.Component<
    ConsumerProps<T, S>
  > {
    static defaultProps = {
      selector: identityFn
    };

    consumer = (state: typeof baseState) => {
      const { children, selector } = this.props;
      const observedState = selector(state);
      return (
        <ConusmerIndirection state={observedState}>
          {children}
        </ConusmerIndirection>
      );
    };

    render() {
      return <State.Consumer>{this.consumer}</State.Consumer>;
    }
  }

  // A mutator is like a consumer, except that it doesn't actually use any
  // of the state. It's used for cases where a component wants to update some
  // state, but doesn't care about what the current state is
  class CopyOnWriteMutator extends React.Component<{
    children: (T => void) => React$Node,
  }> {
    render() {
      return this.props.children(update);
    }
  }

  return {
    Provider: CopyOnWriteStoreProvider,
    Consumer: CopyOnWriteConsumer,
    Mutator: CopyOnWriteMutator,
    update,
    createMutator
  };
}
