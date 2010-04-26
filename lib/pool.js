var 
  sys = require("sys"),
  spawn = require("child_process").spawn,
  events = require("events");

/**
 * A pool of child processes.
 * Emits `spawn` when a child is spawned.
 *
 * @param {String} toRun The program to spawn and run.
 * Defaults to `process.argv[0]`.
 * @param {Array} args Arguments to `toRun`. Defaults to `[]`.
 * @param {Object} options Options for the configuring the pool.
 * `minProcs` and `maxProcs` (default: 1, 4) represent the desired
 * size range of the pool. 
 */

function ChildPool(toRun, args, options) {
  events.EventEmitter.call(this);

  this.pool = [];

  this.toRun = toRun || process.argv[0];
  this.args = args || [];

  var opts = options || {};

  this.minProcs = opts.minProcs || 1;
  this.maxProcs = opts.maxProcs || 4;

  if (this.minProcs <= 0 || 
      this.maxProcs <= 0 || 
      this.minProcs > this.maxProcs)
    throw new Error("invalid minProcs/maxProcs value(s)");

  while (this.pool.length < this.minProcs) 
    this._spawnOne();
}

sys.inherits(ChildPool, events.EventEmitter);

exports.ChildPool = ChildPool;

ChildPool.prototype.size = function () {
  return this.pool.length;
};

ChildPool.prototype._spawnOne = function () {
  var childProc = spawn(this.toRun, this.args);
  this.pool.push(childProc);

  var self = this;
  childProc.addListener("exit", function (code) {
    self.pool.splice(self.indexOf(childProc.pid), 1);
  });

  this.emit("spawn", childProc);
};

ChildPool.prototype.indexOf = function (pid) {
  for (var i=0, n=this.pool.length; i<n; ++i) {
    if (this.pool[i].pid == pid) 
      return i;
  }
  return -1;
};

ChildPool.prototype.spawnAnotherIfAllowed = function () {
  if (this.pool.length < this.maxProcs) 
    this._spawnOne();
};

ChildPool.prototype.forEach = function (fn) {
  this.pool.forEach(fn);
};

