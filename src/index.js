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
 *
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
/**
 * The callback passed to consumers accept the state and the
 * update function, and return a React.Node to render. If the user
 * defines a selector, the state will be whatever they return from the selector
 *  which should just be some subset of T. The updater function is always
 * called with the entire state tree.
 */
type ConsumerCallback<T, S> = (ObservedState<S>, Updater<T>) => React$Node;

/**
 * A selector can either be a simple selector, which just makes the base state to
 * some subset of that current state, or it can be an array of simple selectors which
 * also map the current state to some hetrogenous subsets of that current state. This
 * is defined by ObservedState.
 */
type Selector<T, S> = T => ObservedState<S>;
type OptimizedSelector<T, S> = { id: number, fn: Selector<T, S> };

// changedBits
const MAX_SIGNED_31_BIT_INT = 1073741823;
const DEOPTIMIZED_SELECTOR = 1;

// The default selector is the identity function
function identityFn<T>(n: T): T {
  return n;
}

function getObservedBitsForSelector(selector): number {
  if (typeof selector.observedBits === "number") {
    return selector.observedBits;
  }
  return DEOPTIMIZED_SELECTOR;
}

function getObservedBits<T, S>(selector: Selector<T, S>): number {
  return Array.isArray(selector)
    ? selector.reduce(
        (bits, selector) => bits | getObservedBitsForSelector(selector),
        0
      )
    : getObservedBitsForSelector(selector);
}

export default function createCopyOnWriteState<T>(baseState: T) {
  // There are 30 unique bit values, allowing for 30 optimized selectors
  // at any given time. Since these bits can be dynamically allocated and released
  // as Consumers mount and unmount, respectively, we model it as a stack of constant
  // values.
  let selectorBits = [];
  let bit = 2;
  while (bit < MAX_SIGNED_31_BIT_INT) {
    selectorBits.push(bit);
    bit <<= 1;
  }
  // Selectors which are optimizable are queued here when we attempt to optimize a selector,
  // but there are no more slots available.
  const optimizationQueue = [];
  /**
   * For optimizable selectors, we need to track how many Consumers are currently
   * referencing it. That way we know whether we can de-optimize it when a consumer
   * unmounts, freeing up a slot for a new selector.
   */
  const selectorReferenceCount = new Map();
  /**
   * We also need to know which selectors are current optimized. This may not always
   * be the same set of selectors in the selectorReferenceCount map, as we want to track
   * reference count for selectors that are queued to be optimized as well.
   */
  const optimizedSelectors = new Set();

  function optimizeSelector(selector) {
    if (typeof selector.observedBits !== "number") {
      // An unknown selector, we can never optimize these. Ignore it.
      return;
    }
    let referenceCount = selectorReferenceCount.get(selector) || 0;
    selectorReferenceCount.set(selector, referenceCount + 1);
    if (selector.observedBits !== DEOPTIMIZED_SELECTOR) {
      // This selector is already optimized
      return;
    }
    if (!selectorBits.length) {
      // The selector isn't optimized, but there's no more slots. Queue it
      // up to be optimized.
      optimizationQueue.push(selector);
      return;
    }
    // The selector isn't optimized and there are open slots. Register it as an
    // optimized selector!
    selector.observedBits = selectorBits.pop();
    optimizedSelectors.add(selector);
  }

  function deoptimizeSelector(selector) {
    if (typeof selector.observedBits !== "number") {
      return;
    }
    // This selector was never optimized. It's likely in the queue, waiting to
    // be optimized. Ignore it for now.
    if (!optimizedSelectors.has(selector)) {
      return;
    }
    let referenceCount = selectorReferenceCount.get(selector);
    // referenceCount should always exist, and be greather than 0
    invariant(
      typeof referenceCount !== "undefined" && referenceCount > 0,
      "react-copy-write: attempted to deoptimize a selector that was never " +
        "optimized. This is likey a bug with react-copy-write"
    );
    referenceCount--;
    // No more references to this selector, it should be de-optimized.
    if (referenceCount === 0) {
      // Free up a slot so a queued selector can be optimized.
      selectorBits.push(selector.observedBits);
      selector.observedBits = DEOPTIMIZED_SELECTOR;
      selectorReferenceCount.delete(selector);
      optimizedSelectors.delete(selector);
      if (optimizationQueue.length) {
        // TODO we should choose the selector to optimize based on its reference count.
        const selector = optimizationQueue.pop();
        optimizeSelector(selector);
      }
    } else {
      // De-prioritize this selector by updating its reduced reference count
      selectorReferenceCount.set(selector, referenceCount);
    }
  }

  /**
   * The current state is stored in a closure, shared by the consumers and
   * the provider. Consumers still respect the Provider/Consumer contract
   * that React context enforces, by only accessing state in the consumer.
   */
  let currentState: T = baseState;
  let providerListener = null;
  // $FlowFixMe React.createContext exists now
  const State = React.createContext(baseState, (stale: T, current: T) => {
    let changedBits = DEOPTIMIZED_SELECTOR;
    optimizedSelectors.forEach((bits, selector) => {
      if (selector(stale) !== selector(current)) {
        changedBits |= bits;
      }
    });
    return changedBits;
  });

  // Wraps immer's produce. Only notifies the Provider
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

  /**
   * createMutator lets you create a mutator function that is similar
   * to calling mutate(...) directly, except you can define it statically,
   * and have any additional arguments forwarded.
   */
  function createMutator(fn: UpdateFn<T>) {
    return (...args: mixed[]) => {
      update(draft => {
        fn(draft, ...args);
      });
    };
  }

  function createSelector<S>(fn: T => S) {
    // When an optimized selector is created, it isn't initially optimized.
    // Once it's actually used in a Consumer that mounts, observedBits will be updated
    // with a bit flag popped off the selectorBits stack. If selectorBits is empty,
    // that indicates there are already 30 optimized selectors in use, in which case this
    // selector will be treated as unoptimized. It will be added to a queue of optimizable selectors
    // that are waiting for some other selector to unmount.
    fn.observedBits = DEOPTIMIZED_SELECTOR;
    return fn;
  }

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
    state: ObservedState<S>
  }> {
    shouldComponentUpdate({ state }: { state: ObservedState<S> }) {
      if (Array.isArray(state)) {
        // Assumes that if nextProps.state is an array, then the this.props.state is also
        // an array.
        const currentState = ((this.props.state: any): Array<S>);
        return state.some(
          (observedState, i) => observedState !== currentState[i]
        );
      }
      return this.props.state !== state;
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

    consumer = (state: T) => {
      const { children, selector } = this.props;
      const observedState = this.getObservedState(state, selector);
      return (
        <ConusmerIndirection state={observedState}>
          {children}
        </ConusmerIndirection>
      );
    };

    getObservedState(state: T, selectors: Selector<T, S>): ObservedState<S> {
      if (Array.isArray(selectors)) {
        return selectors.map(selector => selector(state));
      }
      return selectors(state);
    }

    componentDidMount() {
      const selectors = [].concat(this.props.selector);
      selectors.forEach(optimizeSelector);
    }

    componentWillUnmount() {
      const selectors = [].concat(this.props.selector);
      selectors.forEach(deoptimizeSelector);
    }

    render() {
      const observedBits = getObservedBits(this.props.selector);
      return (
        <State.Consumer unstable_observedBits={observedBits}>
          {this.consumer}
        </State.Consumer>
      );
    }
  }

  /**
   * A mutator is like a consumer, except that it doesn't actually use any
   * of the state. It's used for cases where a component wants to update some
   * state, but doesn't care about what the current state is
   */
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
    createMutator,
    createSelector
  };
}
