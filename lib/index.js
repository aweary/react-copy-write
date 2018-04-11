"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = createCopyOnWriteState;

var _react = _interopRequireWildcard(require("react"));

var _immer = _interopRequireDefault(require("immer"));

var _invariant = _interopRequireDefault(require("invariant"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); return Constructor; }

function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } return _assertThisInitialized(self); }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }

// The default selector is the identity function
function identityFn(n) {
  return n;
}

function createCopyOnWriteState(baseState) {
  // The current state is managed by a closure, shared by the consumers and
  // the provider. The consumers still respect the provider/consumer contract
  var currentState = baseState;
  var providerListener = null; // The React context for propagating state and updaters
  // $FlowFixMe React.createContext exists now

  var State = _react.default.createContext(baseState); // Wraps immer's produce utility. Only notify the Provider
  // if the returned draft has been changed.


  function update(fn) {
    (0, _invariant.default)(providerListener !== null, "update(...): you cannot call update when no CopyOnWriteStoreProvider " + "instance is mounted. Make sure to wrap your consumer components with " + "the returned Provider, and/or delay your update calls until the component " + "tree is moutned.");
    var nextState = (0, _immer.default)(currentState, fn);

    if (nextState !== currentState) {
      currentState = nextState;
      providerListener();
    }
  }

  function createMutator(fn) {
    return function () {
      return update(fn);
    };
  } // Wrapper around State.Provider


  var CopyOnWriteStoreProvider =
  /*#__PURE__*/
  function (_React$Component) {
    _inherits(CopyOnWriteStoreProvider, _React$Component);

    function CopyOnWriteStoreProvider() {
      var _ref;

      var _temp, _this;

      _classCallCheck(this, CopyOnWriteStoreProvider);

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      return _possibleConstructorReturn(_this, (_temp = _this = _possibleConstructorReturn(this, (_ref = CopyOnWriteStoreProvider.__proto__ || Object.getPrototypeOf(CopyOnWriteStoreProvider)).call.apply(_ref, [this].concat(args))), Object.defineProperty(_assertThisInitialized(_this), "state", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: baseState
      }), Object.defineProperty(_assertThisInitialized(_this), "updateState", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function value() {
          _this.setState(currentState);
        }
      }), _temp));
    }

    _createClass(CopyOnWriteStoreProvider, [{
      key: "componentDidMount",
      value: function componentDidMount() {
        (0, _invariant.default)(providerListener === null, "CopyOnWriteStoreProvider(...): There can only be a single " + "instance of a provider rendered at any given time.");
        providerListener = this.updateState;
      }
    }, {
      key: "componentWillUnmount",
      value: function componentWillUnmount() {
        providerListener = null;
      }
    }, {
      key: "render",
      value: function render() {
        return _react.default.createElement(State.Provider, {
          value: this.state
        }, this.props.children);
      }
    }]);

    return CopyOnWriteStoreProvider;
  }(_react.default.Component);

  var ConusmerIndirection =
  /*#__PURE__*/
  function (_React$Component2) {
    _inherits(ConusmerIndirection, _React$Component2);

    function ConusmerIndirection() {
      _classCallCheck(this, ConusmerIndirection);

      return _possibleConstructorReturn(this, (ConusmerIndirection.__proto__ || Object.getPrototypeOf(ConusmerIndirection)).apply(this, arguments));
    }

    _createClass(ConusmerIndirection, [{
      key: "shouldComponentUpdate",
      // This simpler than using PureComponent; we don't
      // need to do a shallowEquals check since we rely on
      // referential equality thanks to immer's structural sharing
      value: function shouldComponentUpdate(nextProps) {
        return this.props.state !== nextProps.state;
      }
    }, {
      key: "render",
      value: function render() {
        var _props = this.props,
            children = _props.children,
            state = _props.state;
        return children(state, update);
      }
    }]);

    return ConusmerIndirection;
  }(_react.default.Component);

  var CopyOnWriteConsumer =
  /*#__PURE__*/
  function (_React$Component3) {
    _inherits(CopyOnWriteConsumer, _React$Component3);

    function CopyOnWriteConsumer() {
      var _ref2;

      var _temp2, _this2;

      _classCallCheck(this, CopyOnWriteConsumer);

      for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        args[_key2] = arguments[_key2];
      }

      return _possibleConstructorReturn(_this2, (_temp2 = _this2 = _possibleConstructorReturn(this, (_ref2 = CopyOnWriteConsumer.__proto__ || Object.getPrototypeOf(CopyOnWriteConsumer)).call.apply(_ref2, [this].concat(args))), Object.defineProperty(_assertThisInitialized(_this2), "consumer", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: function value(state) {
          var _this2$props = _this2.props,
              children = _this2$props.children,
              selector = _this2$props.selector;
          var observedState = selector(state);
          return _react.default.createElement(ConusmerIndirection, {
            state: observedState
          }, children);
        }
      }), _temp2));
    }

    _createClass(CopyOnWriteConsumer, [{
      key: "render",
      value: function render() {
        return _react.default.createElement(State.Consumer, null, this.consumer);
      }
    }]);

    return CopyOnWriteConsumer;
  }(_react.default.Component); // A mutator is like a consumer, except that it doesn't actually use any
  // of the state. It's used for cases where a component wants to update some
  // state, but doesn't care about what the current state is


  Object.defineProperty(CopyOnWriteConsumer, "defaultProps", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      selector: identityFn
    }
  });

  var CopyOnWriteMutator =
  /*#__PURE__*/
  function (_React$Component4) {
    _inherits(CopyOnWriteMutator, _React$Component4);

    function CopyOnWriteMutator() {
      _classCallCheck(this, CopyOnWriteMutator);

      return _possibleConstructorReturn(this, (CopyOnWriteMutator.__proto__ || Object.getPrototypeOf(CopyOnWriteMutator)).apply(this, arguments));
    }

    _createClass(CopyOnWriteMutator, [{
      key: "render",
      value: function render() {
        return this.props.children(update);
      }
    }]);

    return CopyOnWriteMutator;
  }(_react.default.Component);

  return {
    Provider: CopyOnWriteStoreProvider,
    Consumer: CopyOnWriteConsumer,
    Mutator: CopyOnWriteMutator,
    update: update,
    createMutator: createMutator
  };
}