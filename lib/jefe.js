var 
  sys = require("sys"), 
  common = require("./common"),
  ChildHandler = require("./handler").ChildHandler,
  ChildPool = require("./pool").ChildPool,
  UserScript = require("./userscript").UserScript;

exports.ERR_TOO_MUCH_MEMORY = "killed: too much memory used";
exports.ERR_TOO_MUCH_TIME = "killed: too much time taken";

/** 
 * Jefe is a sandbox for Node.js that runs a user Javascript in a child
 * process, and ensures that the script does not use too much time or
 * memory.  El Jefe is the boss; if the script misbehaves script (its child
 * process host) is killed.
 *
 * @param {Object} options Options for configuring how Jefe works.  
 * `minProcs` and `maxProcs` control the size of the child process pool 
 * (defaults: 1 and 4 respectively); `recycleAfterN` causes a child process 
 * to be killed after servicing N requests; `0` means that children are not 
 * recycled.  The default is to recycle after `100` requests.
 */

function Jefe(options) {
  var 
    self = this,
    opts = options || {};

  this.pool = new ChildPool(process.argv[0], [ __dirname + "/runner.js" ],
                            opts.minProcs, opts.maxProcs);
  this.childHandlers = {};
  this.recycleAfterN = Math.max(0, opts.recycleAfterN || 100);
  this.checkMemTimeout = opts.checkMemTimeout || 10; // ms
  this.scripts = {};
  this.requestQueue = {};
  this.nextRequestId = 0;

  // Wrap each child process in a "handler" object.

  this.pool.addListener("spawn", function (childProc) {
    var pid = childProc.pid;
    if (common.debugMode) sys.debug("spawned pid " + pid);
    var childHandler = new ChildHandler(childProc);
    self.childHandlers[pid] = childHandler;
    childProc.addListener("exit", function () {
      if (common.debugMode) sys.debug("pid " + pid + " exited");
      delete self.childHandlers[pid];
    });
    var scriptNames = Object.keys(self.scripts);
    for (var i=0, n=scriptNames.length; i<n; ++i)
      childHandler.compile(scriptNames[i], self.scripts[scriptNames[i]].sourceCode);
  });
}

exports.Jefe = Jefe;

Jefe.prototype.toString = function () {
  return "<Jefe scripts:" + Object.keys(this.scripts).length + 
         " pool:" + this.pool.size() + 
         " queue:" + Object.keys(this.requestQueue).length +
         " requests:" + this.nextRequestId +
         ">";
};

/** 
 * Adds a script.
 *
 * @param {String} name The name of the script (arbitrary).
 * Jefe doesn't care about a script name already in use; overwrites.
 * @param {String} sourceCode The Javascript source code of the script.
 * @param {Object} options Optional configuration for the script.
 * `maxMem` and `maxMemPercent` is the maximum amount of 
 * memory the script may cause a child process to *grow by* before 
 * the host child process is killed and the script run considered to 
 * have ended in error.  The default is to allow a growth of no more than
 * `10 MB` or (`10240 KB`).  `maxTime` is the amount of wall-clock time a 
 * script is allowed to use before its host child process is killed and 
 * the script run considered to have ended in error (default: `250 ms`).
 * @exception SyntaxError when their's a syntax error in `sourceCode`.
 */

Jefe.prototype.compile = function (name, sourceCode, options) {
  var scriptName = (name || '').trim();

  if (scriptName.length == 0)
    throw new Error("script name required");

  this.scripts[scriptName] = new UserScript(scriptName, sourceCode, options);

  var pids = Object.keys(this.childHandlers);
  for (var i=0, n=pids.length; i<n; ++i) 
    this.childHandlers[pids[i]].compile(scriptName, sourceCode);
};

Jefe.prototype.remove = function (name) {
  var scriptName = (name || '').trim();

  if (scriptName.length == 0)
    throw new Error("script name required");

  if (!this.scripts.hasOwnProperty(scriptName))
    throw new Error("no such script: " + scriptName);

  delete this.scripts[scriptName];

  var pids = Object.keys(this.childHandlers);
  for (var i=0, n=pids.length; i<n; ++i) 
    this.childHandlers[pids[i]].remove(scriptName);
};

Jefe.prototype.run = function (name, sandbox, callback) {
  var
    scriptName = (name || '').trim(),
    sandboxIn = sandbox || {},
    self = this;

  if (scriptName.length == 0)
    throw new Error("script name required");

  if (!this.scripts.hasOwnProperty(scriptName)) 
    throw new Error("no such script: " + scriptName);

  if (typeof sandboxIn != "object")
    throw new Error("sandbox must be an object");

  var request = { cmd: common.RUN
                , sandbox: sandboxIn
                , script: this.scripts[scriptName]
                , callback: callback
                , id: this.nextRequestId++
                , processing: false
                };

  this.requestQueue[request.id] = request;
  this._dispatchQueued();
}

Jefe.prototype._dispatchQueued = function () {
  if (common.debugMode) sys.debug("request queue: " + Object.keys(this.requestQueue).length);

  var keys = Object.keys(this.requestQueue);       // sorted already
  for (var i=0, n=keys.length; i<n; ++i) {
    var request = this.requestQueue[keys[i]];
    if (request.processing) continue;

    var childProc = this._firstAvailableHandler();
    if (!childProc) {
      this.pool.spawnAnotherIfAllowed();
      childProc = this._firstAvailableHandler();
    }
    if (!childProc) break;

    this._runRequestOnChild(request, this.childHandlers[childProc.pid]);
  }
}

Jefe.prototype._firstAvailableHandler = function () {
  var pids = Object.keys(this.childHandlers);
  for (var i=0, n=pids.length; i<n; ++i) 
    if (this.childHandlers[pids[i]].available) 
      return this.childHandlers[pids[i]];
  return null;
};

var warnedAboutNoMemCheck = false;

Jefe.prototype._runRequestOnChild = function (request, childHandler) {
  var 
    self = this,
    script = request.script;

  request.processing = true;

  childHandler.purgeScriptRequestQueue();

  if (script.maxTime > 0) {
    childHandler.killTimer = setTimeout(function () {
      childHandler.kill();
      delete self.childHandlers[childHandler.pid];
      script.wasKilled("time");
      request.callback(exports.ERR_TOO_MUCH_TIME, null);
    }, script.maxTime);
  }

  if (script.maxMem > 0 || script.maxMemPercent > 0) {
    childHandler.peakMemoryUsage(function (err, initialMem, initialMemPercent) {
      if (err || initialMem == 0 || initialMemPercent == 0) {
        if (!warnedAboutNoMemCheck) {
          sys.error("[JEFE] WARNING! memory monitoring problem on " + process.platform + ": " + err);
          clearTimeout(childHandler.memWatcher);
          delete childHandler.memWatcher;
          warnedAboutNoMemCheck = true;
        } 
      } else {
        self._watchMem(request, childHandler, initialMem, initialMemPercent);
      }
    });
  }

  childHandler.run(script.name, request.sandbox, function (response) {
    childHandler.cancelKillSwitches();

    // !ok => bug in jefe or child was killed by something external.

    if (response.ok !== true) 
      throw new Error("Unexpected Error: " + response.reason);

    if (response.body === undefined || 
        (response.body.exception === undefined && response.body.sandbox === undefined))
      throw new Error("Internal error: malformed response = " + JSON.stringify(response));

    request.processing = false;

    self.scripts[script.name].wasRun(response.timeTaken);

    delete self.requestQueue[request.id];

    if (response.body.exception)
      request.callback(response.body.exception, request.sandbox, null);
    else if (response.body.sandbox)
      request.callback(null, request.sandbox, response.body.sandbox);

    if (childHandler.requestCount >= self.recycleAfterN && self.recycleAfterN > 0) {
      childHandler.kill();
      delete self.childHandlers[childHandler.pid];        // do not wait for "exit" event
    } 

    self._dispatchQueued();
  });
};

Jefe.prototype._watchMem = function (request, childHandler, initialMem, initialMemPercent) {
  var 
    self = this,
    script = request.script;

  function checkMem() {
    childHandler.peakMemoryUsage(function (err, mem, memPercent) {
      if ((script.maxMem        > 0 && mem        - initialMem        > script.maxMem) ||
          (script.maxMemPercent > 0 && memPercent - initialMemPercent > script.maxMemPercent)) {

        if (common.debugMode) {
          sys.debug("pid " + childHandler.pid + 
                    " mem overage! maxMem=" + script.maxMem + 
                    " initialMem=" + initialMem + 
                    " currPeak=" + mem + 
                    " deltaMem=" + (mem - initialMem) +
                    " maxMemPercent=" + script.maxMemPercent + 
                    " initialMemPercent=" + initialMemPercent + 
                    " currPeakPercent=" + memPercent + 
                    " deltaPercent=" + (memPercent - initialMemPercent));
        }

        childHandler.kill();
        self.scripts[script.name].wasKilled("memory");
        request.callback(exports.ERR_TOO_MUCH_MEMORY, null);
      }
      childHandler.memWatcher = setTimeout(checkMem, self.checkMemTimeout);
    });
  };

  checkMem();
}

Jefe.prototype.getScriptStats = function (name) {
  var scriptName = (name || '').trim();
  return this.scripts[scriptName].stats || {};
};

