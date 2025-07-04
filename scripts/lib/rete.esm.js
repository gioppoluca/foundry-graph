/*!
* rete v2.0.4
* (c) 2024 Vitaliy Stoliarov
* Released under the MIT license.
* */
import _asyncToGenerator from '@babel/runtime/helpers/asyncToGenerator';
import _classCallCheck from '@babel/runtime/helpers/classCallCheck';
import _createClass from '@babel/runtime/helpers/createClass';
import _possibleConstructorReturn from '@babel/runtime/helpers/possibleConstructorReturn';
import _getPrototypeOf from '@babel/runtime/helpers/getPrototypeOf';
import _inherits from '@babel/runtime/helpers/inherits';
import _defineProperty from '@babel/runtime/helpers/defineProperty';
import _regeneratorRuntime from '@babel/runtime/regenerator';

function _createForOfIteratorHelper$1(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray$1(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray$1(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray$1(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray$1(r, a) : void 0; } }
function _arrayLikeToArray$1(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */

/**
 * A middleware type that can modify the data
 * @typeParam T - The data type
 * @param data - The data to be modified
 * @returns The modified data or undefined
 * @example (data) => data + 1
 * @example (data) => undefined // will stop the execution
 * @internal
 */

/**
 * Validate the Scope signals and replace the parameter type with an error message if they are not assignable
 * @internal
 */

/**
 * Provides 'debug' method to check the detailed assignment error message
 * @example .debug($ => $)
 * @internal
 */
function useHelper() {
  return {
    debug: function debug(_f) {
      /* placeholder */
    }
  };
}

/**
 * A signal is a middleware chain that can be used to modify the data
 * @typeParam T - The data type
 * @internal
 */
var Signal = /*#__PURE__*/function () {
  function Signal() {
    _classCallCheck(this, Signal);
    _defineProperty(this, "pipes", []);
  }
  return _createClass(Signal, [{
    key: "addPipe",
    value: function addPipe(pipe) {
      this.pipes.push(pipe);
    }
  }, {
    key: "emit",
    value: function () {
      var _emit = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee(context) {
        var current, _iterator, _step, pipe;
        return _regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              current = context;
              _iterator = _createForOfIteratorHelper$1(this.pipes);
              _context.prev = 2;
              _iterator.s();
            case 4:
              if ((_step = _iterator.n()).done) {
                _context.next = 13;
                break;
              }
              pipe = _step.value;
              _context.next = 8;
              return pipe(current);
            case 8:
              current = _context.sent;
              if (!(typeof current === 'undefined')) {
                _context.next = 11;
                break;
              }
              return _context.abrupt("return");
            case 11:
              _context.next = 4;
              break;
            case 13:
              _context.next = 18;
              break;
            case 15:
              _context.prev = 15;
              _context.t0 = _context["catch"](2);
              _iterator.e(_context.t0);
            case 18:
              _context.prev = 18;
              _iterator.f();
              return _context.finish(18);
            case 21:
              return _context.abrupt("return", current);
            case 22:
            case "end":
              return _context.stop();
          }
        }, _callee, this, [[2, 15, 18, 21]]);
      }));
      function emit(_x) {
        return _emit.apply(this, arguments);
      }
      return emit;
    }()
  }]);
}();
/**
 * Base class for all plugins and the core. Provides a signals mechanism to modify the data
 */
var Scope = /*#__PURE__*/function () {
  // Parents['length'] extends 0 ? undefined : Scope<Parents[0], Tail<Parents>>

  function Scope(name) {
    _classCallCheck(this, Scope);
    _defineProperty(this, "signal", new Signal());
    this.name = name;
  }
  return _createClass(Scope, [{
    key: "addPipe",
    value: function addPipe(middleware) {
      this.signal.addPipe(middleware);
    }
  }, {
    key: "use",
    value: function use(scope) {
      if (!(scope instanceof Scope)) throw new Error('cannot use non-Scope instance');
      scope.setParent(this);
      this.addPipe(function (context) {
        return scope.signal.emit(context);
      });
      return useHelper();
    }
  }, {
    key: "setParent",
    value: function setParent(scope) {
      this.parent = scope;
    }
  }, {
    key: "emit",
    value: function emit(context) {
      return this.signal.emit(context);
    }
  }, {
    key: "hasParent",
    value: function hasParent() {
      return Boolean(this.parent);
    }
  }, {
    key: "parentScope",
    value: function parentScope(type) {
      if (!this.parent) throw new Error('cannot find parent');
      if (type && this.parent instanceof type) return this.parent;
      if (type) throw new Error('actual parent is not instance of type');
      return this.parent;
    }
  }]);
}();

function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _callSuper$1(t, o, e) { return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct$1() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e)); }
function _isNativeReflectConstruct$1() { try { var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); } catch (t) {} return (_isNativeReflectConstruct$1 = function _isNativeReflectConstruct() { return !!t; })(); }

/**
 * Signal types produced by NodeEditor instance
 * @typeParam Scheme - The scheme type
 * @priority 10
 * @group Primary
 */

/**
 * The NodeEditor class is the entry class. It is used to create and manage nodes and connections.
 * @typeParam Scheme - The scheme type
 * @priority 7
 * @group Primary
 */
var NodeEditor = /*#__PURE__*/function (_Scope) {
  function NodeEditor() {
    var _this;
    _classCallCheck(this, NodeEditor);
    _this = _callSuper$1(this, NodeEditor, ['NodeEditor']);
    _defineProperty(_this, "nodes", []);
    _defineProperty(_this, "connections", []);
    return _this;
  }

  /**
   * Get a node by id
   * @param id - The node id
   * @returns The node or undefined
   */
  _inherits(NodeEditor, _Scope);
  return _createClass(NodeEditor, [{
    key: "getNode",
    value: function getNode(id) {
      return this.nodes.find(function (node) {
        return node.id === id;
      });
    }

    /**
     * Get all nodes
     * @returns Copy of array with nodes
     */
  }, {
    key: "getNodes",
    value: function getNodes() {
      return this.nodes.slice();
    }

    /**
     * Get all connections
     * @returns Copy of array with onnections
     */
  }, {
    key: "getConnections",
    value: function getConnections() {
      return this.connections.slice();
    }

    /**
     * Get a connection by id
     * @param id - The connection id
     * @returns The connection or undefined
     */
  }, {
    key: "getConnection",
    value: function getConnection(id) {
      return this.connections.find(function (connection) {
        return connection.id === id;
      });
    }

    /**
     * Add a node
     * @param data - The node data
     * @returns Whether the node was added
     * @throws If the node has already been added
     * @emits nodecreate
     * @emits nodecreated
     */
  }, {
    key: "addNode",
    value: (function () {
      var _addNode = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee(data) {
        return _regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) switch (_context.prev = _context.next) {
            case 0:
              if (!this.getNode(data.id)) {
                _context.next = 2;
                break;
              }
              throw new Error('node has already been added');
            case 2:
              _context.next = 4;
              return this.emit({
                type: 'nodecreate',
                data: data
              });
            case 4:
              if (_context.sent) {
                _context.next = 6;
                break;
              }
              return _context.abrupt("return", false);
            case 6:
              this.nodes.push(data);
              _context.next = 9;
              return this.emit({
                type: 'nodecreated',
                data: data
              });
            case 9:
              return _context.abrupt("return", true);
            case 10:
            case "end":
              return _context.stop();
          }
        }, _callee, this);
      }));
      function addNode(_x) {
        return _addNode.apply(this, arguments);
      }
      return addNode;
    }()
    /**
     * Add a connection
     * @param data - The connection data
     * @returns Whether the connection was added
     * @throws If the connection has already been added
     * @emits connectioncreate
     * @emits connectioncreated
     */
    )
  }, {
    key: "addConnection",
    value: (function () {
      var _addConnection = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee2(data) {
        return _regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) switch (_context2.prev = _context2.next) {
            case 0:
              if (!this.getConnection(data.id)) {
                _context2.next = 2;
                break;
              }
              throw new Error('connection has already been added');
            case 2:
              _context2.next = 4;
              return this.emit({
                type: 'connectioncreate',
                data: data
              });
            case 4:
              if (_context2.sent) {
                _context2.next = 6;
                break;
              }
              return _context2.abrupt("return", false);
            case 6:
              this.connections.push(data);
              _context2.next = 9;
              return this.emit({
                type: 'connectioncreated',
                data: data
              });
            case 9:
              return _context2.abrupt("return", true);
            case 10:
            case "end":
              return _context2.stop();
          }
        }, _callee2, this);
      }));
      function addConnection(_x2) {
        return _addConnection.apply(this, arguments);
      }
      return addConnection;
    }()
    /**
     * Remove a node
     * @param id - The node id
     * @returns Whether the node was removed
     * @throws If the node cannot be found
     * @emits noderemove
     * @emits noderemoved
     */
    )
  }, {
    key: "removeNode",
    value: (function () {
      var _removeNode = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee3(id) {
        var index, node;
        return _regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) switch (_context3.prev = _context3.next) {
            case 0:
              index = this.nodes.findIndex(function (n) {
                return n.id === id;
              });
              node = this.nodes[index];
              if (!(index < 0)) {
                _context3.next = 4;
                break;
              }
              throw new Error('cannot find node');
            case 4:
              _context3.next = 6;
              return this.emit({
                type: 'noderemove',
                data: node
              });
            case 6:
              if (_context3.sent) {
                _context3.next = 8;
                break;
              }
              return _context3.abrupt("return", false);
            case 8:
              this.nodes.splice(index, 1);
              _context3.next = 11;
              return this.emit({
                type: 'noderemoved',
                data: node
              });
            case 11:
              return _context3.abrupt("return", true);
            case 12:
            case "end":
              return _context3.stop();
          }
        }, _callee3, this);
      }));
      function removeNode(_x3) {
        return _removeNode.apply(this, arguments);
      }
      return removeNode;
    }()
    /**
     * Remove a connection
     * @param id - The connection id
     * @returns Whether the connection was removed
     * @throws If the connection cannot be found
     * @emits connectionremove
     * @emits connectionremoved
     */
    )
  }, {
    key: "removeConnection",
    value: (function () {
      var _removeConnection = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee4(id) {
        var index, connection;
        return _regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) switch (_context4.prev = _context4.next) {
            case 0:
              index = this.connections.findIndex(function (n) {
                return n.id === id;
              });
              connection = this.connections[index];
              if (!(index < 0)) {
                _context4.next = 4;
                break;
              }
              throw new Error('cannot find connection');
            case 4:
              _context4.next = 6;
              return this.emit({
                type: 'connectionremove',
                data: connection
              });
            case 6:
              if (_context4.sent) {
                _context4.next = 8;
                break;
              }
              return _context4.abrupt("return", false);
            case 8:
              this.connections.splice(index, 1);
              _context4.next = 11;
              return this.emit({
                type: 'connectionremoved',
                data: connection
              });
            case 11:
              return _context4.abrupt("return", true);
            case 12:
            case "end":
              return _context4.stop();
          }
        }, _callee4, this);
      }));
      function removeConnection(_x4) {
        return _removeConnection.apply(this, arguments);
      }
      return removeConnection;
    }()
    /**
     * Clear all nodes and connections
     * @returns Whether the editor was cleared
     * @emits clear
     * @emits clearcancelled
     * @emits cleared
     */
    )
  }, {
    key: "clear",
    value: (function () {
      var _clear = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime.mark(function _callee5() {
        var _iterator, _step, connection, _iterator2, _step2, node;
        return _regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) switch (_context5.prev = _context5.next) {
            case 0:
              _context5.next = 2;
              return this.emit({
                type: 'clear'
              });
            case 2:
              if (_context5.sent) {
                _context5.next = 6;
                break;
              }
              _context5.next = 5;
              return this.emit({
                type: 'clearcancelled'
              });
            case 5:
              return _context5.abrupt("return", false);
            case 6:
              _iterator = _createForOfIteratorHelper(this.connections.slice());
              _context5.prev = 7;
              _iterator.s();
            case 9:
              if ((_step = _iterator.n()).done) {
                _context5.next = 15;
                break;
              }
              connection = _step.value;
              _context5.next = 13;
              return this.removeConnection(connection.id);
            case 13:
              _context5.next = 9;
              break;
            case 15:
              _context5.next = 20;
              break;
            case 17:
              _context5.prev = 17;
              _context5.t0 = _context5["catch"](7);
              _iterator.e(_context5.t0);
            case 20:
              _context5.prev = 20;
              _iterator.f();
              return _context5.finish(20);
            case 23:
              _iterator2 = _createForOfIteratorHelper(this.nodes.slice());
              _context5.prev = 24;
              _iterator2.s();
            case 26:
              if ((_step2 = _iterator2.n()).done) {
                _context5.next = 32;
                break;
              }
              node = _step2.value;
              _context5.next = 30;
              return this.removeNode(node.id);
            case 30:
              _context5.next = 26;
              break;
            case 32:
              _context5.next = 37;
              break;
            case 34:
              _context5.prev = 34;
              _context5.t1 = _context5["catch"](24);
              _iterator2.e(_context5.t1);
            case 37:
              _context5.prev = 37;
              _iterator2.f();
              return _context5.finish(37);
            case 40:
              _context5.next = 42;
              return this.emit({
                type: 'cleared'
              });
            case 42:
              return _context5.abrupt("return", true);
            case 43:
            case "end":
              return _context5.stop();
          }
        }, _callee5, this, [[7, 17, 20, 23], [24, 34, 37, 40]]);
      }));
      function clear() {
        return _clear.apply(this, arguments);
      }
      return clear;
    }())
  }]);
}(Scope);

var crypto = globalThis.crypto;

/**
 * @returns A unique id
 */
function getUID() {
  if ('randomBytes' in crypto) {
    return crypto.randomBytes(8).toString('hex');
  }
  var bytes = crypto.getRandomValues(new Uint8Array(8));
  var array = Array.from(bytes);
  var hexPairs = array.map(function (b) {
    return b.toString(16).padStart(2, '0');
  });
  return hexPairs.join('');
}

function _callSuper(t, o, e) { return o = _getPrototypeOf(o), _possibleConstructorReturn(t, _isNativeReflectConstruct() ? Reflect.construct(o, e || [], _getPrototypeOf(t).constructor) : o.apply(t, e)); }
function _isNativeReflectConstruct() { try { var t = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); } catch (t) {} return (_isNativeReflectConstruct = function _isNativeReflectConstruct() { return !!t; })(); }
/**
 * The socket class
 * @priority 7
 */
var Socket = /*#__PURE__*/_createClass(
/**
 * @constructor
 * @param name Name of the socket
 */
function Socket(name) {
  _classCallCheck(this, Socket);
  this.name = name;
});

/**
 * General port class
 */
var Port = /*#__PURE__*/_createClass(
/**
 * Port id, unique string generated by `getUID` function
 */

/**
 * Port index, used for sorting ports. Default is `0`
 */

/**
 * @constructor
 * @param socket Socket instance
 * @param label Label of the port
 * @param multipleConnections Whether the output port can have multiple connections
 */
function Port(socket, label, multipleConnections) {
  _classCallCheck(this, Port);
  this.socket = socket;
  this.label = label;
  this.multipleConnections = multipleConnections;
  this.id = getUID();
});

/**
 * The input port class
 * @priority 6
 */
var Input = /*#__PURE__*/function (_Port) {
  /**
   * @constructor
   * @param socket Socket instance
   * @param label Label of the input port
   * @param multipleConnections Whether the output port can have multiple connections. Default is `false`
   */
  function Input(socket, label, multipleConnections) {
    var _this;
    _classCallCheck(this, Input);
    _this = _callSuper(this, Input, [socket, label, multipleConnections]);
    /**
     * Control instance
     */
    _defineProperty(_this, "control", null);
    /**
     * Whether the control is visible. Can be managed dynamically by extensions. Default is `true`
     */
    _defineProperty(_this, "showControl", true);
    _this.socket = socket;
    _this.label = label;
    _this.multipleConnections = multipleConnections;
    return _this;
  }

  /**
   * Add control to the input port
   * @param control Control instance
   */
  _inherits(Input, _Port);
  return _createClass(Input, [{
    key: "addControl",
    value: function addControl(control) {
      if (this.control) throw new Error('control already added for this input');
      this.control = control;
    }

    /**
     * Remove control from the input port
     */
  }, {
    key: "removeControl",
    value: function removeControl() {
      this.control = null;
    }
  }]);
}(Port);

/**
 * The output port class
 * @priority 5
 */
var Output = /*#__PURE__*/function (_Port2) {
  /**
   * @constructor
   * @param socket Socket instance
   * @param label Label of the output port
   * @param multipleConnections Whether the output port can have multiple connections. Default is `true`
   */
  function Output(socket, label, multipleConnections) {
    _classCallCheck(this, Output);
    return _callSuper(this, Output, [socket, label, multipleConnections !== false]);
  }
  _inherits(Output, _Port2);
  return _createClass(Output);
}(Port);

/**
 * General control class
 * @priority 5
 */
var Control = /*#__PURE__*/_createClass(
/**
 * Control id, unique string generated by `getUID` function
 */

/**
 * Control index, used for sorting controls. Default is `0`
 */

function Control() {
  _classCallCheck(this, Control);
  this.id = getUID();
});

/**
 * Input control options
 */

/**
 * The input control class
 * @example new InputControl('text', { readonly: true, initial: 'hello' })
 */
var InputControl = /*#__PURE__*/function (_Control) {
  /**
   * @constructor
   * @param type Type of the control: `text` or `number`
   * @param options Control options
   */
  function InputControl(type, options) {
    var _options$readonly;
    var _this2;
    _classCallCheck(this, InputControl);
    _this2 = _callSuper(this, InputControl);
    _this2.type = type;
    _this2.options = options;
    _this2.id = getUID();
    _this2.readonly = (_options$readonly = options === null || options === void 0 ? void 0 : options.readonly) !== null && _options$readonly !== void 0 ? _options$readonly : false;
    if (typeof (options === null || options === void 0 ? void 0 : options.initial) !== 'undefined') _this2.value = options.initial;
    return _this2;
  }

  /**
   * Set control value
   * @param value Value to set
   */
  _inherits(InputControl, _Control);
  return _createClass(InputControl, [{
    key: "setValue",
    value: function setValue(value) {
      var _this$options;
      this.value = value;
      if ((_this$options = this.options) !== null && _this$options !== void 0 && _this$options.change) this.options.change(value);
    }
  }]);
}(Control);

/**
 * The node class
 * @priority 10
 * @example new Node('math')
 */
var Node = /*#__PURE__*/function () {
  /**
   * Whether the node is selected. Default is `false`
   */

  function Node(label) {
    _classCallCheck(this, Node);
    /**
     * Node id, unique string generated by `getUID` function
     */
    /**
     * Node inputs
     */
    _defineProperty(this, "inputs", {});
    /**
     * Node outputs
     */
    _defineProperty(this, "outputs", {});
    /**
     * Node controls
     */
    _defineProperty(this, "controls", {});
    this.label = label;
    this.id = getUID();
  }
  return _createClass(Node, [{
    key: "hasInput",
    value: function hasInput(key) {
      return Object.prototype.hasOwnProperty.call(this.inputs, key);
    }
  }, {
    key: "addInput",
    value: function addInput(key, input) {
      if (this.hasInput(key)) throw new Error("input with key '".concat(String(key), "' already added"));
      Object.defineProperty(this.inputs, key, {
        value: input,
        enumerable: true,
        configurable: true
      });
    }
  }, {
    key: "removeInput",
    value: function removeInput(key) {
      delete this.inputs[key];
    }
  }, {
    key: "hasOutput",
    value: function hasOutput(key) {
      return Object.prototype.hasOwnProperty.call(this.outputs, key);
    }
  }, {
    key: "addOutput",
    value: function addOutput(key, output) {
      if (this.hasOutput(key)) throw new Error("output with key '".concat(String(key), "' already added"));
      Object.defineProperty(this.outputs, key, {
        value: output,
        enumerable: true,
        configurable: true
      });
    }
  }, {
    key: "removeOutput",
    value: function removeOutput(key) {
      delete this.outputs[key];
    }
  }, {
    key: "hasControl",
    value: function hasControl(key) {
      return Object.prototype.hasOwnProperty.call(this.controls, key);
    }
  }, {
    key: "addControl",
    value: function addControl(key, control) {
      if (this.hasControl(key)) throw new Error("control with key '".concat(String(key), "' already added"));
      Object.defineProperty(this.controls, key, {
        value: control,
        enumerable: true,
        configurable: true
      });
    }
  }, {
    key: "removeControl",
    value: function removeControl(key) {
      delete this.controls[key];
    }
  }]);
}();

/**
 * The connection class
 * @priority 9
 */
var Connection = /*#__PURE__*/_createClass(
/**
 * Connection id, unique string generated by `getUID` function
 */

/**
 * Source node id
 */

/**
 * Target node id
 */

/**
 * @constructor
 * @param source Source node instance
 * @param sourceOutput Source node output key
 * @param target Target node instance
 * @param targetInput Target node input key
 */
function Connection(source, sourceOutput, target, targetInput) {
  _classCallCheck(this, Connection);
  this.sourceOutput = sourceOutput;
  this.targetInput = targetInput;
  if (!source.outputs[sourceOutput]) {
    throw new Error("source node doesn't have output with a key ".concat(String(sourceOutput)));
  }
  if (!target.inputs[targetInput]) {
    throw new Error("target node doesn't have input with a key ".concat(String(targetInput)));
  }
  this.id = getUID();
  this.source = source.id;
  this.target = target.id;
});

var classic = /*#__PURE__*/Object.freeze({
  __proto__: null,
  Socket: Socket,
  Port: Port,
  Input: Input,
  Output: Output,
  Control: Control,
  InputControl: InputControl,
  Node: Node,
  Connection: Connection
});

export { classic as ClassicPreset, NodeEditor, Scope, Signal, getUID };
//# sourceMappingURL=rete.esm.js.map
