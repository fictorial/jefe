// Jefe: child process wrapper for the parent process.

var
  common = require("./common"),
  events = require("events"),
  sys = require("sys"),
  fs = require("fs");

function ChildProcessWrapper(proc) {
  events.EventEmitter.call(this);

  this.process = proc;
  this.pid = proc.pid;
  this.available = true;
  this.requestCount = 0;
  this.scriptQueue = [];
  this.callback = null;

  var self = this;

  // The only output from a child on stdout is a response to RunScript.

  proc.stdout.addListener("data", function (data) {
    var asString = data.utf8Slice(0, data.length);
    var responseObject = JSON.parse(asString);

    if (self.callback) {
      self.callback(responseObject);
      self.callback = null;
    }

    self.available = true;
  });

  // The only output from a child on stderr is an internal error.

  proc.stderr.addListener("data", function (data) {
    var internalError = data.utf8Slice(0, data.length)
    throw new Error(internalError);
  });

  // Check if the child was working on some request when it died for some
  // reason.  We didn't kill if it is available.  Perhaps some system
  // administrator killed the process or something similar happened.  The best
  // we can do is notify the callback and let it decide if it wants to retry
  // the operation.

  proc.addListener("exit", function (code) {
    sys.log("[JEFE-CHILD] " + self.pid + " exited with code " + code);

    if (!this.available) {
      if (self.callback) 
        self.callback({ ok: false
                      , reason: common.ERR_UNEXPECTED_DEATH
                      });
    } 

    self.emit("childExit", self);
  });
}

sys.inherits(ChildProcessWrapper, events.EventEmitter);

exports.ChildProcessWrapper = ChildProcessWrapper;

ChildProcessWrapper.prototype.toString = function () {
  return "<ChildProcessWrapper " +
         " available:" + this.available + 
         " requestCount:" + this.requestCount + 
         ">";
};

ChildProcessWrapper.prototype.addScript = function (scriptName, script) {
  var request = { cmd: common.ADD_SCRIPT
                , scriptName: scriptName
                , script: script
                };

  if (!this.available) {
    this.scriptQueue.push(request);
    return;
  }

  this._writeRequest(request);
};

ChildProcessWrapper.prototype.removeScript = function (scriptName) {
  var request = { cmd: common.REMOVE_SCRIPT
                , scriptName: scriptName
                };

  if (!this.available) {
    this.scriptQueue.push(request);
    return;
  }

  this._writeRequest(request);
};

ChildProcessWrapper.prototype.runScript = function (scriptName, sandbox, callback) {
  if (!this.available) 
    throw new Error("cannot run script when not available");

  var inputSandbox = sandbox || {};

  if (typeof inputSandbox != "object") 
    throw new Error("invalid sandbox");

  if (typeof callback != "function")
    throw new Error("function required for runScript");

  // Only one script per child process at a time...
  // So just store _the_ callback.

  this.callback = callback;

  // Make sure the child has all the up to date scripts.

  this._purgeScriptRequestQueue();

  this._writeRequest({ cmd: common.RUN_SCRIPT
                     , scriptName: scriptName
                     , sandbox: inputSandbox
                     });

  this.available = false;
};

ChildProcessWrapper.prototype._purgeScriptRequestQueue = function () {
  var request;

  while (request = this.scriptQueue.shift()) {
    switch (request.cmd) {
      case common.ADD_SCRIPT:    
        this.addScript(request.scriptName, request.script); 
        break;

      case common.REMOVE_SCRIPT: 
        this.removeScript(request.scriptName); 
        break;

      default:
        throw new Error("unknown queued script request");
    }
  }
};

if (process.platform.match(/linux/i)) {

  /** 
   * Determines how much RAM the system has.
   * This blocks and returns the result immediately.
   * You likely will only call this once anyway.
   * Result in KB.
   */

  var getSystemMemoryTotal = function () {
    var contents = fs.readFileSync("/proc/meminfo");
    if (!contents) 
      throw new Error("Failed to read /proc/meminfo");
    var m = contents.match(/^MemTotal:\s*(\d+)/m);
    return m ? parseInt(m[1], 10) : 0;
  };

  var getPeakMemoryUsage = function (pid, callback) {
    // NB: In my tests (http://gist.github.com/376770) I didn't see much of
    // a difference between peak RSS and the sum of "private memory" from
    // /proc/$pid/smaps; so, we use peak RSS (or HWM for "high water mark [for
    // RSS]".

    fs.readFile("/proc/" + pid + "/status", function (err, contents) {
      if (err) {
        callback(err, 0, 0);
      } else {
        var 
          match = contents.match(/^VmHWM:\s+(\d+)\s+kB$/m),
          peakRSS = match ? parseInt(match[1], 10) : 0,
          peakRSSPercent = (peakRSS > 0 && systemMemoryTotal > 0) 
            ? peakRSS / systemMemoryTotal : 0;

        callback(null, peakRSS, peakRSSPercent);
      }
    });
  };
} else {
  // TODO patches please for non-Linux! :)

  var getSystemMemoryTotal = function () {
    return 0;
  };

  var getPeakMemoryUsage = function (pid, callback) {
    callback(new Error("unsupported"), 0);
  };
}

var systemMemoryTotal = getSystemMemoryTotal();

/**
 * Determines the peak amount of memory the child process has used since
 * it was spawned.  
 *
 * Note: we do not want to simply sample the *current* amount 
 * as we could miss some big allocation and subsequent garbage collection thereof.
 *
 * Note: we care about *resident* memory, not virtual, since sandboxed
 * code can really just create big Arrays, Strings, and Objects which will
 * be cause RSS to increase once created.
 *
 * This calls back when the answer is known. The callback should expect
 * `(error, peakRSS, peakRSSPercent)` where `error` is an `Error` object
 * if there was a problem determining memory usage; `peakRSS` is the amount
 * of resident memory in KB (or KiB to be precise); and `peakRSSPercentage`
 * is the percentage (in range `[0,1]`) of total system memory that `peakRSS`
 * represents (e.g. `0.65` means that the child process has used at some
 * point `65%` of system memory).  If the memory values can not be determined
 * for whatever reason, the `peakRSS` and `peakRSSPercent` will be `0`.
 *
 * Do note that Node has `process.memoryUsage` but that is for the calling
 * process.  The untrusted script running in a child process cannot perform
 * I/O and thus does not yield or go idle.  Thus, the child process cannot
 * exec `process.memoryUsage` and notify the parent.  The parent has to 
 * check the child's memory usage from the outside.
 */

ChildProcessWrapper.prototype.peakMemoryUsage = function (callback) {
  getPeakMemoryUsage(this.pid, callback);
};

ChildProcessWrapper.prototype.kill = function () {
  this.available = false;

  this.process.stdin.end();
  this.process.kill();
};

ChildProcessWrapper.prototype._writeRequest = function (request) {
  this._writeSerializedRequest(JSON.stringify(request) + common.CRLF);
};

ChildProcessWrapper.prototype._writeSerializedRequest = function (serializedRequest) {
  sys.log("[JEFE] sending " + this.pid + " " + common.debugFilter(serializedRequest));

  this.process.stdin.write(serializedRequest, "utf8");
};

