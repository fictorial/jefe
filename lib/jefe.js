var 
  sys = require("sys"), 
  spawn = require("child_process").spawn,
  Script = process.binding('evals').Script,
  CRLF = "\r\n";

/**
 * Create a Jefe.
 *
 * @param {Object} options Options to configure this Jefe.
 * `maxChildRAM`: maximum amount of RAM (in KiB) to allow any given script to use.
 * The default is 1024 KiB.  If a script uses more the child process is killed.
 * `maxChildTime`: maximum amount of time (in ms) to allow a script is allowed to run 
 * before the child process is killed. The default is 250 ms.
 * `minProcs`: the minimum number of processes to use in the pool.
 * `maxProcs`: the maximum number of processes to use in the pool.
 * `recycleAfterN`: kill and respawn a child process after it has handled N requests.
 * The default is 0 which means "disable".
 */

function Jefe(options) {
  var opts = options || {};

  this.recycleAfterN = opts.recycleAfterN;
  this.maxChildRAM  = opts.maxChildRAM  || 1024;  // KiB
  this.maxChildTime = opts.maxChildTime ||  250;  // ms

  if (this.maxChildRAM  < 0) throw new Error("invalid maxChildRAM value");
  if (this.maxChildTime < 0) throw new Error("invalid maxChildTime value");

  this.pool = { "free": [], "busy": [] };         // index: pid, value: ChildProcess
  this.perChildQueue = [];                        // index: pid, value: [ JSON, ... ]
  this.execQueue = [];                            // index: 0,1,2,.. value: [ JSON, ... ]
  this.scripts = {};                              // key: name, value: sourceCode 
  this.requestsPerChild = [];                     // index: pid, value: counter

  this.adjustPoolSize(opts.minProcs || 1, opts.maxProcs || 5);
}

exports.Jefe = Jefe;

Jefe.prototype.toString = function () {
  return "<Jefe scripts:" + Object.keys(this.scripts).length + 
         " pool:" + this._poolSize() + ">";
};

Jefe.prototype.adjustPoolSize = function (minProcs, maxProcs) {
  if (minProcs <= 0 || maxProcs <= 0 || minProcs > maxProcs)
    throw new Error("invalid minProcs/maxProcs value(s)");

  this.minProcs = minProcs;
  this.maxProcs = maxProcs;

  this._resizePoolAsNeeded();
};

Jefe.prototype._poolSize = function () {
  return this.pool.free.length + this.pool.busy.length;
};

Jefe.prototype._resizePoolAsNeeded = function () {
  while (this._poolSize() < this.minProcs) this._spawnOne();
  while (this._poolSize() > this.maxProcs) this._killOne();
};

Jefe.prototype._spawnOne = function () {
  var child = spawn(process.argv[0], [ __dirname + "/child.js" ]);

  this.pool.free.push(child);
  this.perChildQueue[child.pid] = [];
  this.requestsPerChild[child.pid] = [];

  sys.debug("[JEFE] spawned pid " + child.pid);
  sys.debug("[JEFE] pool size now: " + this.pool.free.length);

  // Send the child the existing scripts.

  var scriptNames = Object.keys(this.scripts);
  for (var i=0, n=scriptNames.length; i<n; ++i) {
    this._writeRequest(child, { cmd: "AddCode"
                              , name: scriptNames[i]
                              , sourceCode: this.scripts[i]
                              });
  }

  // TODO process request responses
  // TODO dispatch to callback
  // TODO recycle if > N requests done by this child
  // TODO move from busy to free pool
  // TODO dispatch any commands in the per child queue, and clear them
  // TODO dispatch one command from the global pool queue to any free child

  child.stdout.addListener("data", function (data) {
    sys.debug("[JEFE] stdout from child " + child.pid + ": " + data);
  });

  // TODO handle when this child was handling a request but died

  child.addListener("exit", function (code) {
    sys.debug("[JEFE] child " + child.pid + " exited with code " + code);
  });
};

// NB: if maxProcs was lowered but there are not enough free procs to kill,
//     we will have to wait until a proc finishes up and then kill it, or wait
//     until it is killed, and then not respawn it.

Jefe.prototype._killOne = function () {
  sys.debug("[JEFE] kill one");

  var child = this.pool.free.shift();

  if (child) 
    this._killChild(child);
};

Jefe.prototype._killChild = function (child) {
  var pid = child.pid;

  child.stdin.end();
  child.kill();

  delete this.pool.free[pid];
  this.perChildQueue.splice(pid, 1);
  this.requestsPerChild.splice(pid, 1);

  sys.debug("[JEFE] killed pid " + pid);
};

Jefe.prototype._writeRequest = function (child, request) {
  child.stdin.write(JSON.stringify(request) + CRLF, "utf8");
};

/** 
 * Adds a script for Jefe to manage.
 *
 * If there's a syntax error, this will throw, and will write to stderr.
 * 
 * @param {String} name Arbitrary script identifier.
 * @param {String} sourceCode Javascript source code.
 */

Jefe.prototype.addScript = function (name, sourceCode) {
  var script = new Script(sourceCode, name); // Just check if it throws

  this.scripts[name] = sourceCode;

  var command = JSON.stringify({ cmd: "AddCode"
                               , name: name
                               , sourceCode: sourceCode
                               }) + CRLF;

  for (var pid in this.perChildQueue)
    this.perChildQueue[pid].push(command);

  // TODO flush the queue for "free" procs
};

/**
 * Removes a script by name.
 */

Jefe.prototype.removeScript = function (name) {
  // Remove locally, then add a command to each proc's queue to remove it.

  delete this.scripts[name];

  var command = JSON.stringify({ cmd: "RemoveCode"
                               , name: name
                               }) + CRLF;

  for (var pid in this.perChildQueue)
    this.perChildQueue[pid].push(command);

  // TODO flush the queue for "free" procs
};

/**
 * Runs the script and calls back with the result.
 *
 * @param {String} name The script identifier from a previous call to `addScript`.
 * @param {Object} sandbox Optional sandbox environment for the script.
 * @param {Object} options Options for the run. This allows you to override the
 * default child control settings just for this particular run. The keys that may
 * be specified are `maxChildTime` and `maxChildRAM`.
 * @param {Function} callback A function that is called back when a child responds
 * after the code has been run. The arguments to the callback will be `(error, updatedSandbox)`.
 * If the child was killed for taking too much time or using too much RAM, the `error`
 * will be an Error object, else null. If the code was run successfully, the `error` will
 * be `null` and `updatedSandbox` will be an `Object` representing the globals potentially
 * updated by the code. Note that the `sandbox` parameter is not altered.
 */

Jefe.prototype.run = function (name, sandbox, options, callback) {
  var
    opts = options || {},
    maxChildRAM = opts.maxChildRAM || this.maxChildRAM,
    maxChildTime = opts.maxChildTime || this.maxChildTime,
    script = this.scripts[name], 
    inputSandbox = sandbox || {};

  if (!Object.hasOwnProperty(this.scripts, name))
    throw new Error("no such script: " + name);

  // TODO
  // find a free process
  // If none are available, try to spawn a new child process if there's < maxProcs in the pool
  // then try to find a free process again
  // If none are available, put the request in a global queue
  // (don't forget the callback)

};

