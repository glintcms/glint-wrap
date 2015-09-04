/**
 * Module dependencies.
 */
var debug = require('debug')('glint:Wrap');
var defaults = require('defaults');
var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;
var Flow = require('flow-builder');

/**
 * Expose Wrap element.
 */
exports = module.exports = Wrap;
inherits(Wrap, EventEmitter);

/**
 * Initialize a new `Wrap` element.
 */
function Wrap(key, ctrl) {
  if (!(this instanceof Wrap)) return new Wrap(key, ctrl);
  if (key) this.parallel(key, ctrl);
  this.init();
}

/**
 * API functions.
 */

Wrap.prototype.api = Wrap.api = 'wrap';

/**
 * Use the given `plugin`.
 *
 * @param {Function} plugin
 * @returns {Object} instance
 * @api public
 */
Wrap.prototype.use = function(plugin) {
  plugin(this);
  return this;
};

// get/set properties for wrap
['key', 'id', 'selector', 'prepend', 'append', 'el'].forEach(function(attribute) {
  Wrap.prototype[attribute] = function(value) {
    this.emit(attribute, value);
    if (typeof value !== 'undefined') {
      this['_' + attribute] = value;
      return this;
    }
    return this['_' + attribute];
  };
});

// get/set properties for wrap and its controls
['editable'].forEach(function(attribute) {
  Wrap.prototype[attribute] = function(value) {
    this.emit(attribute, value);
    if (typeof value !== 'undefined') {
      this['_' + attribute] = value;
      this.flow.forEach(function(key, ctrl) {
        if (typeof ctrl[attribute] === 'function') {
          ctrl[attribute](value);
        }
      });
      return this;
    }
    return this['_' + attribute];
  };
});

// get/set the `place` property for the wrap and its controls
Wrap.prototype.place = function(value) {
  this.emit('place', value);
  if (typeof value !== 'undefined') {
    this._place = value;
    this.flow.forEach(function(key, ctrl) {
      if (typeof ctrl.place === 'function') {
        var existing = ctrl.place();
        if (!existing) {
          ctrl.place(value);
        } else if (!~existing.indexOf('force')) {
          ctrl.place(value);
        }
      }
    });
    return this;
  }
  return this._place;
};

Wrap.prototype.cid = function(id) {
  if (!this.container) {
    debug('can\'t set cid, because wrap has got no container');
    return this;
  }
  if (id) {
    this.container.id(id);
    return this;
  } else {
    return this.container.id();
  }
};

Wrap.prototype.defaults = function(key, value) {
  if (!this._defaults) this._defaults = {};
  if (typeof key === 'object') {
    this._defaults = defaults(this._defaults, key);
    return this;
  }
  var args = [].slice.call(arguments);
  if (args.length === 1) {
    return this._defaults[key];
  }
  this._defaults[key] = value;
  return this;
};

['parallel', 'series', 'eventually'].forEach(function(attribute) {
  Wrap.prototype[attribute] = function(key, ctrl) {
    if (!ctrl) ctrl = key, key = undefined;
    if (!ctrl) throw new TypeError('Wrap: no control provided');
    if (typeof ctrl.load !== 'function') return this.bulk(key, ctrl, attribute);
    this.add(key, ctrl, attribute);
    return this;
  };
});

Wrap.prototype.bulk = function(key, ctrl, flow) {
  var self = this;
  Object.keys(ctrl).forEach(function(k) {
    var obj = ctrl[k];
    // only add object when it is Wrap compatible.
    if (typeof obj.load !== 'function') return;
    self.add(k, obj, flow);
  });
  return this;
}

Wrap.prototype.add = function(key, ctrl, flow) {
  if (typeof key === 'object') ctrl = key, flow = ctrl, key = undefined;
  if (!flow) flow = 'parallel';
  var self = this;

  if (typeof ctrl !== 'object') return this;

  if (!ctrl.api) debug('api field is missing on the control:', key);

  if (ctrl.api === 'container') {
    if (!this.container) this.container = ctrl;
    this.containers.push(ctrl);
  } else if (ctrl.api === 'wrap') {
    // search for containers inside wrap ctrl
    ctrl.flow.forEach(function(key, nestedCtrl) {
      if (nestedCtrl.api === 'container') {
        self.containers.push(nestedCtrl);
      }
    });
  }

  if (typeof ctrl.id === 'function' && ctrl.api !== 'container') {
    // set id always except on container.
    var id = ctrl.id();
    if (!id) ctrl.id(key);
  }

  this.flow[flow](key, ctrl);

  return this;
};

Wrap.prototype.load = function(context, done) {
  if (typeof context === 'function') done = context, context = undefined, done = done || noop;

  var self = this;
  var results = this.content = {};
  if (context) defaults(results, context);
  if (this._defaults) defaults(results, this._defaults);

  this.emit('pre-load');

  this.flow
    .task(function(key, ctrl, next) {
      debug('wrap load task started', key);
      // 1. load controls
      ctrl.load(results, function(err, result) {
        debug('wrap load task loaded', key, err, result);
        if (err) return next(err);
        // 2. and merge the result objects into one object
        if (key) {
          results[key] = result;
        } else {
          defaults(results, result);
        }

        self.emit('load', key, results[key], ctrl);

        next();
      });
    })
    .group(function(err, group, done) {
      debug('wrap load group finished', group);
      done(err);
    })
    .done(function(err) {
      debug('wrap load all done', err);
      if (err) return done(err);
      self.emit('post-load', results);
      done(null, results);
    });

  this.flow.exec();

  return this;
};


Wrap.prototype.init = function() {
  this.flow = new Flow();
  this.containers = [];
  return this;
};

/**
 * Helper Functions
 */
function noop() {
};

