/**
 * @flow strict-local
 * @format
 */

import React from 'react';
import type { Store } from '../src/index.js';
import createStore from '../src/index.js';

type User = { name: string, age: number };
type State = {
  users: Array<User>,
  version: number,
};

const store: Store<State> = createStore(
  ({
    users: [],
    version: 100,
  }: State),
);

const { Provider, Consumer, mutate } = store;

function testProvider() {
  return (
    <Provider initialState={{ users: [], version: 100 }}>
      <div>test</div>
    </Provider>
  );
}

function testProviderWithIncorrectInitialState() {
  return (
    // $FlowExpectedError
    <Provider initialState={{ users: 123 }}>
      <div>test</div>
    </Provider>
  );
}

function testConsumer() {
  return (
    <Consumer select={[state => state.users, state => state.version]}>
      {(users, version) => {
        const a: Array<User> = users;
        const b: number = version;
        return <div>test</div>;
      }}
    </Consumer>
  );
}

function testConsumerWithObjectSelector() {
  return (
    <Consumer select={[state => state]}>
      {({ users, version }) => {
        const a: Array<User> = users;
        const b: number = version;
        return <div>test</div>;
      }}
    </Consumer>
  );
}

function testIncorrectConsumer() {
  return (
    <Consumer select={[state => state.users, state => state.version]}>
      {(users, version) => {
        // $FlowExpectedError
        const a: number = users;
        // $FlowExpectedError
        const b: string = version;
        return <div>test</div>;
      }}
    </Consumer>
  );
}

function testMutate() {
  mutate((draft, state) => {
    draft.users = [{ name: 'shengmin', age: 20 }];
    draft.version = state.version + 1;
  });
}

function testIncorrectMutate() {
  mutate((draft, state) => {
    // $FlowExpectedError
    draft.users = '';
    // $FlowExpectedError
    draft.version = state.versions + 1;
  });
}
