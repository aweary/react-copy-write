/**
 *
 * A priority queue that enforces unique elements, allows for updating
 * the weight of existing key, and runs optimization and deoptimization routines when
 * an element enters or leaves a range from the top of the heap to the nth index.
 *
 * @flow
 * @format
 */

import invariant from 'invariant';

type Comparator<T> = (T, T) => boolean;

// Indicies between 1 and 29 are considered optimized slots (index
// 0 is just null, to make the heapify routines simpler)
// When a selector moves above index 29 it will be optimized.
// If it drops below, it will be deoptimized.
const OPTIMIZATION_THRESHOLD = 29;
const MAX_SIGNED_31_BIT_INT = 1073741823;
const DEOPTIMIZED_SELECTOR = 1;

export default class OptimizationQueue<T> {
  comparator: Comparator<T>;
  _heap: Array<T>;
  constructor(comparator: Comparator<T>) {
    this.comparator = comparator;
    this._heap = [null];
    // The number of references for a given selector.
    // Used in bubbleUp/bubbleDown to determine the heap ordering
    this._referenceCounts = new Map();
    // Track the index of each selector, so that when the priority
    // changes we can just swap that selector with the first and then
    // bubble it down.
    this._indicies = new Map();
    this._bits = [];
    let bit = 2;
    while (bit < MAX_SIGNED_31_BIT_INT) {
      this._bits.push(bit);
      bit <<= 1;
    }
  }

  forEach(fn) {
    let i = 1;
    let selector = this._heap[i];
    while (selector && i <= OPTIMIZATION_THRESHOLD) {
      fn(selector);
      i++;
      selector = this._heap[i];
    }
  }

  // Updates the tracked index and also runs the de/optimization
  _setIndex(fn: T, index: number) {
    if (
      index > OPTIMIZATION_THRESHOLD &&
      fn.observedBits !== DEOPTIMIZED_SELECTOR
    ) {
      this._bits.push(fn.observedBits);
      fn.observedBits = DEOPTIMIZED_SELECTOR;
    }
    // unoptimized selector has moved into the top 29 selectors, optimize it
    if (
      index <= OPTIMIZATION_THRESHOLD &&
      fn.observedBits === DEOPTIMIZED_SELECTOR
    ) {
      const bits = this._bits.pop();
      fn.observedBits = bits;
    }
    this._indicies.set(fn, index);
  }

  _comparator(a, b) {
    return this._referenceCounts.get(a) > this._referenceCounts.get(b);
  }

  reference(fn: T) {
    if (this._referenceCounts.has(fn)) {
      const index = this._indicies.get(fn);
      // If the selector is already in the queue, we need
      // to increment it's reference count.
      let referenceCount = this._referenceCounts.get(fn);
      this._referenceCounts.set(fn, referenceCount + 1);
      this.bubbleUp(index);
    } else {
      // There have been no references to this selector yet,
      // register the first reference in _referenceCounts and
      // insert it into the heap.
      this._referenceCounts.set(fn, 1);
      const index = this._heap.push(fn) - 1;
      this._setIndex(fn, index);
      this.bubbleUp(this._heap.length - 1);
    }
  }

  // Used to decrement the reference count for a selector.
  // If the reference count ends up being zero, the selector
  // should be removed from the queue entirely.
  dereference(fn: T) {
    const index = this._indicies.get(fn);
    invariant(
      typeof index !== 'undefined',
      'Attempted to dereference a selector with no references',
    );
    invariant(
      this._heap[index] === fn,
      'The tracked index for a selector didnt match its actual index. ',
    );
    let referenceCount = this._referenceCounts.get(fn);
    referenceCount--;
    if (referenceCount === 0) {
      // No more references, stop tracking the selector
    } else {
      // Update reference count and then reapply the heap invariant
      this._referenceCounts.set(fn, referenceCount);
      this.bubbleDown(index);
    }
  }

  bubbleDown(index: number): void {
    const heap = this._heap;
    const length = heap.length;
    const left = index * 2;
    const right = left + 1;
    let swap = null;
    if (right < length && this._comparator(heap[right], heap[index])) {
      swap = right;
    }
    if (
      left < length &&
      this._comparator(heap[left], swap ? heap[swap] : heap[index])
    ) {
      swap = left;
    }
    if (swap !== null) {
      this._setIndex(element, swap);
      this._setIndex(heap[swap], index);
      const element = heap[index];
      heap[index] = heap[swap];
      heap[swap] = element;
      this.bubbleDown(swap);
    }
  }

  bubbleUp(index: number): void {
    const heap = this._heap;
    const element = heap[index];
    // We stop at index 1 as the first element.
    while (index > 1) {
      const parentIndex = Math.floor(index / 2);
      const parent = heap[parentIndex];
      if (this._comparator(element, parent)) {
        this._setIndex(parent, index);
        this._setIndex(element, parentIndex);
        heap[index] = parent;
        heap[parentIndex] = element;
        index = parentIndex;
      } else {
        break;
      }
    }
  }
}
