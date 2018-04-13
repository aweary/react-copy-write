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

// Update functions take the current state, mutate it, and return nothing (undefined)
type UpdateFn<T> = T => void;
// The updater function that gets called in consumers
type Updater<T> = (UpdateFn<T>) => void;

type ObservedState<S> = S | Array<S>;
// The callback passed to consumers accept the state and the
// update function, and return a React.Node to render. If the user
// defines a selector, the state will be whatever they return from the selector 
// (Ideally that would just be some subset of T). The updater function is always
// called with the entire state tree.
type ConsumerCallback<T, S> = (ObservedState<S>, Updater<T>) => React$Node;

/**
 * A selector can either be a simple selector, which just makes the base state to
 * some subset of that current state, or it can be an array of simple selectors which
 * also map the current state to some hetrogenous subsets of that current state. 
 */

type Selector<T, S> = T => ObservedState<S>;
  

// The default selector is the identity function
function identityFn<T>(n: T): T {
  return n;
}

export default function createCopyOnWriteState<T>(baseState: T) {
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
  function update(fn: UpdateFn<T>) {
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

  function createMutator(fn: UpdateFn<T>) {
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
    children: ConsumerCallback<T, S>,
    state: ObservedState<S>, 
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

  class CopyOnWriteConsumer<S> extends React.Component<{
    selector: Selector<T, S>,
    children: ConsumerCallback<T, S>
  }> {
    static defaultProps = {
      selector: identityFn
    };

    getObservedState(state: T, selectors: Selector<T, S>) : ObservedState<S> {
      if (Array.isArray(selectors)) {
        return selectors.map(fn => fn(state));
      }
      return selectors(state);
    } 

    consumer = (state: T) => {
      const { children, selector } = this.props;
      const observedState = this.getObservedState(state, selector);
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
    children: (Updater<T>) => React$Node
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
