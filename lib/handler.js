var
  common = require("./common"),
  sys = require("sys"),
  fs = require("fs"),
  memory = require("./memory");

/**
 * Handles/manages a single child process.
 *
 * @param {child_process.ChildProcess} proc The child process to handle.
 */

function ChildHandler(proc) {
  this.process = proc;
  this.pid = proc.pid;
  this.available = true;
  this.requestCount = 0;
  this.scriptQueue = [];
  this.callback = null;

  var self = this;

  // The only output from a child on stdout is a response to RunScript.

  proc.stdout.addListener("data", function (data) {
    if (common.debugMode) sys.debug("<-- pid " + self.pid + ": " + data.toString().replace("\r\n", "<CRLF>"));

    if (self.callback) {
      self.callback(JSON.parse(data.toString()));
      self.callback = null;
    }

    self.available = true;
  });

  // The only output from a child on stderr is an internal error.

  proc.stderr.addListener("data", function (data) {
    throw new Error(data.toString());
  });

  // Check if the child was working on some request when it died for some
  // reason.  Jefe didn't kill if it is still available.  Perhaps some system
  // administrator killed the process or something similar happened.  The best
  // we can do is notify the callback and let it decide if it wants to retry
  // the operation.

  proc.addListener("exit", function (code) {
    if (!this.available && self.callback) 
      self.callback({ ok: false
                    , reason: common.ERR_UNEXPECTED_DEATH 
                    });
  });
}

exports.ChildHandler = ChildHandler;

ChildHandler.prototype.toString = function () {
  return "<ChildHandler " +
         " available:" + this.available + 
         " requestCount:" + this.requestCount + 
         ">";
};

/**
 * Sends a request to the child to compile the given script.
 *
 * @param {String} scriptName The name of the script.
 * @param {String} script Javascript source code.
 */

ChildHandler.prototype.compile = function (scriptName, script) {
  var request = { cmd: common.COMPILE
                , scriptName: scriptName
                , script: script
                };

  if (!this.available) {
    this.scriptQueue.push(request);
    return;
  }

  this._writeRequest(request);
};

/**
 * Sends a request to the child to remove the given script.
 *
 * @param {String} scriptName The name of the script.
 */

ChildHandler.prototype.remove = function (scriptName) {
  var request = { cmd: common.REMOVE
                , scriptName: scriptName
                };

  if (!this.available) {
    this.scriptQueue.push(request);
    return;
  }

  this._writeRequest(request);
};

/**
 * Sends a request to the child to run the given script which 
 * must have been previously added via `compile`.
 *
 * @param {String} scriptName The name of the script.
 * @param {Object} sandbox The global environment for the script.
 * @param {Function} callback Callback function called when the script finishes
 * running.
 */

ChildHandler.prototype.run = function (scriptName, sandbox, callback) {
  if (!this.available) 
    throw new Error("cannot run script when not available");

  var sandboxIn = sandbox || {};

  if (typeof sandboxIn != "object") 
    throw new Error("invalid sandbox");

  if (typeof callback != "function")
    throw new Error("function required for run");

  // Only one script per child process at a time...
  // So just store _the_ callback.

  this.callback = callback;

  // Make sure the child has all the up to date scripts.

  this._purgeScriptRequestQueue();

  // Send the request to run the script.

  this._writeRequest({ cmd: common.RUN
                     , scriptName: scriptName
                     , sandbox: sandboxIn
                     });

  // Since we're running a script, we're not available to run other scripts.

  this.available = false;

  this.requestCount++;
};

ChildHandler.prototype._purgeScriptRequestQueue = function () {
  var request;

  while (request = this.scriptQueue.shift()) {
    switch (request.cmd) {
      case common.COMPILE:    
        this.compile(request.scriptName, request.script); 
        break;

      case common.REMOVE: 
        this.remove(request.scriptName); 
        break;

      default:
        throw new Error("unknown queued script request");
    }
  }
};

/** 
 * Determines the peak amount of memory the child process has used since it
 * was spawned.  Note: we do not want to simply sample the *current* amount as
 * we could miss some big allocation and subsequent garbage collection thereof.
 *
 * Note: we care about *resident* memory, not virtual, since sandboxed code can
 * really just create big Arrays, Strings, and Objects which will be cause RSS
 * to increase once created.
 *
 * This calls back when the answer is known. The callback should expect
 * `(error, peakRSS, peakRSSPercent)` where `error` is an `Error` object if
 * there was a problem determining memory usage; `peakRSS` is the amount of
 * resident memory in KB (or KiB to be precise); and `peakRSSPercentage` is the
 * percentage (in range `[0,1]`) of total system memory that `peakRSS`
 * represents (e.g. `0.65` means that the child process has used at some point
 * `65%` of system memory).  If the memory values can not be determined for
 * whatever reason, the `peakRSS` and `peakRSSPercent` will be `0`.
 *
 * Do note that Node has `process.memoryUsage` but that is for the calling
 * process.  The untrusted script running in a child process cannot perform I/O
 * and thus does not yield or go idle.  Thus, the child process cannot exec
 * `process.memoryUsage` and notify the parent.  The parent has to check the
 * child's memory usage from the outside.
 */

ChildHandler.prototype.peakMemoryUsage = function (callback) {
  memory.getPeakMemoryUsage(this.pid, callback);
};

ChildHandler.prototype.cancelKillSwitches = function () {
  clearTimeout(this.killTimer);
  clearTimeout(this.memWatcher);

  delete this.killTimer;
  delete this.memWatcher;
};

/**
 * Kill the child process.  Does not call the callback.
 */

ChildHandler.prototype.kill = function () {
  if (common.debugMode) 
    sys.debug("killing " + this.pid + "; handled " + this.requestCount + " requests.");

  this.available = false;
  this.cancelKillSwitches();

  this.process.stdin.end();
  this.process.kill();
};

ChildHandler.prototype._writeRequest = function (request) {
  if (common.debugMode) sys.debug("--> pid " + this.pid + ": " + JSON.stringify(request));
  this._writeSerializedRequest(JSON.stringify(request) + common.CRLF);
};

ChildHandler.prototype._writeSerializedRequest = function (serializedRequest) {
  this.process.stdin.write(serializedRequest, "utf8");
};

