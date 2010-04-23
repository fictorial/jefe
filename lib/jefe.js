var 
  sys = require("sys"), 
  spawn = require("child_process").spawn,
  Script = process.binding('evals').Script,
  common = require("./common"),
  worker = require("./worker"),
  ChildProcessWrapper = require("./child").ChildProcessWrapper;

exports.ERR_TOO_MUCH_MEMORY = "killed: too much memory used";
exports.ERR_TOO_MUCH_TIME   = "killed: too much time taken";

function Jefe(options) {
  var opts = options || {};

  this.pool = [];
  this.queue = [];
  this.scripts = {};
  this.requestQueue = [];

  this.recycleAfterN = opts.recycleAfterN || 100;
  this.maxChildMemKB = opts.maxChildMemKB || 1024;   // KiB
  this.maxChildMemPercent = opts.maxChildMemKB || 0.15; 
  this.maxChildTime = opts.maxChildTime || 250;      // ms

  if (this.recycleAfterN < 0) 
    throw new Error("invalid recycleAfterN value");

  if (this.maxChildMemKB < 0) 
    throw new Error("invalid maxChildMemKB value");

  if (this.maxChildMemPercent < 0 || this.maxChildMemPercent > 1)
    throw new Error("invalid maxChildMemPercent value");

  if (this.maxChildTime < 0) 
    throw new Error("invalid maxChildTime value");

  this.adjustPoolSize(opts.minProcs || 1, opts.maxProcs || 5);
}

exports.Jefe = Jefe;

Jefe.prototype.toString = function () {
  return "<Jefe scripts:" + Object.keys(this.scripts).length + 
         " pool:" + this.pool.length + ">";
};

Jefe.prototype.adjustPoolSize = function (minProcs, maxProcs) {
  if (minProcs <= 0 || maxProcs <= 0 || minProcs > maxProcs)
    throw new Error("invalid minProcs/maxProcs value(s)");

  this.minProcs = minProcs;
  this.maxProcs = maxProcs;

  this._resizePoolAsNeeded();
};

Jefe.prototype._resizePoolAsNeeded = function () {
  while (this.pool.length < this.minProcs) this._spawnOne();
  while (this.pool.length > this.maxProcs) this._killOne();
};

Jefe.prototype._spawnOne = function () {
  var 
    childProc = spawn(process.argv[0], [ __dirname + "/worker.js" ]),
    wrapper = new ChildProcessWrapper(childProc);

  this.pool.push(wrapper);

  sys.log("[JEFE] spawned pid " + childProc.pid);
  sys.log("[JEFE] pool size now: " + this.pool.length);

  var scriptNames = Object.keys(this.scripts);
  for (var i=0, n=scriptNames.length; i<n; ++i)
    wrapper.addScript(scriptNames[i], this.scripts[scriptNames[i]]);

  var self = this;

  wrapper.addListener("childExit", function (dead) {
    var index = self._findChildByPID(dead.pid);

    if (index >= 0)
      self.pool.splice(index, 1);

    self._resizePoolAsNeeded();
  });
};

Jefe.prototype._findChildByPID = function (pid) {
  for (var i=0, n=this.pool.length; i<n; ++i) {
    if (this.pool[i].pid == pid) 
      return i;
  }

  return -1;
};

Jefe.prototype._firstAvailable = function () {
  for (var i=0, n=this.pool.length; i<n; ++i) {
    if (this.pool[i].available) 
      return i;
  }

  return -1;
};

Jefe.prototype._killOne = function () {
  var index = this._firstAvailable();

  if (index >= 0) {
    var child = this.pool[index];

    // NB: see childExit handler above for removal from pool.

    sys.log("[JEFE] killing pid " + child.pid);
    child.kill();
  }
};

// NB: doesn't care about a script name already in use; overwrites.
// NB: this just throws to the caller on syntax errors.

Jefe.prototype.addScript = function (name, script) {
  var scriptName = (name || '').trim();

  if (scriptName.length == 0)
    throw new Error("script name required");

  var tempScript = new Script(script, scriptName);

  this.scripts[scriptName] = true;

  for (var i=0, n=this.pool.length; i<n; ++i)
    this.pool[i].addScript(scriptName, script);
};

Jefe.prototype.removeScript = function (name) {
  var scriptName = (name || '').trim();

  if (scriptName.length == 0)
    throw new Error("script name required");

  if (!this.scripts.hasOwnProperty(scriptName))
    throw new Error("no such script: " + scriptName);

  delete this.scripts[scriptName];

  for (var i=0, n=this.pool.length; i<n; ++i)
    this.pool[i].removeScript(scriptName, script);
};

Jefe.prototype.runScript = function (name, sandbox, callback) {
  var
    scriptName = (name || '').trim(),
    inputSandbox = sandbox || {},
    self = this;

  if (scriptName.length == 0)
    throw new Error("script name required");

  if (!this.scripts.hasOwnProperty(scriptName)) 
    throw new Error("no such script: " + scriptName);

  if (typeof inputSandbox != "object")
    throw new Error("sandbox must be an object");

  this.requestQueue.push({ cmd: common.RUN_SCRIPT
                         , sandbox: sandbox
                         , scriptName: scriptName
                         , callback: callback
                         , selfIndex: this.requestQueue.length
                         });

  this._dispatchQueued();
}

// Process the request queue, dispatching requests to whichever (if any)
// child process is available.  If none are available, try resizing the pool,
// and retry to find a child.  If none are available still, leave the request
// in the queue until later when a child finishes running a script (which will
// then dispatch...).

Jefe.prototype._dispatchQueued = function () {
  sys.log("[JEFE] request queue is " + this.requestQueue.length + " deep");

  for (var i=0, n=this.requestQueue.length; i<n; ++i) {
    if (this.requestQueue[i].processing)
      continue;

    var childIndex = this._firstAvailable();

    if (childIndex < 0) {
      this._resizePoolAsNeeded();
      childIndex = this._firstAvailable();
    }

    if (childIndex < 0) {
      sys.log("[JEFE] no child processes are available to handle queued requests");
      break;
    }

    this._runRequestOnChild(i, childIndex);
  }
}

Jefe.prototype._runRequestOnChild = function (requestIndex, childIndex) {
  var 
    request = this.requestQueue[requestIndex],
    child = this.pool[childIndex],
    self = this;

  request.processing = true;

  sys.log("[JEFE] running '" + request.scriptName + "' on child " + child.pid);

  // As requested, create a kill timer that will kill the script (well, the
  // child process running the script) for taking too long.  If the child
  // returns a request in time, we will clear timeout.

  if (this.maxChildTime > 0) {
    child.killTimer = setTimeout(function () {
      if (typeof child.memWatcher != "undefined") {
        clearInterval(child.memWatcher);
        delete child.memWatcher;
      }
      child.kill();
      request.callback(new Error(exports.ERR_TOO_MUCH_TIME), null);
    }, this.maxChildTime);
  }

  // Monitor the child process' memory usage.

  var warnedAboutNoMemCheck = false;
  if (this.maxChildMemKB > 0 || this.maxChildMemPercent > 0) {
    child.memWatcher = setInterval(function () {
      child.peakMemoryUsage(function (err, peakRSS, peakRSSPercent) {
        if ((err || peakRSS == 0 || peakRSSPercent == 0) && !warnedAboutNoMemCheck) {
          sys.error("[JEFE] No memory monitoring implemented for " + process.platform + " -- " + err);
          clearInterval(child.memWatcher);
          delete child.memWatcher;
          warnedAboutNoMemCheck = true;
          return;
        } 

        if ((self.maxChildMemKB      > 0 && 
             peakRSS                 > self.maxChildMemKB) || 
            (self.maxChildMemPercent > 0 && 
             peakRSSPercent          > self.maxChildMemPercent)) {

          sys.log("[JEFE] child " + child.pid + " is using too much RAM. " + 
                  " maxChildMemKB:"      + self.maxChildMemKB + 
                  " maxChildMemPercent:" + self.maxChildMemPercent + 
                  " peakRSS:"            + peakRSS + 
                  " peakRSSPercent:"     + peakRSSPercent +
                  " -- killing");

          clearInterval(child.memWatcher);
          delete child.memWatcher;

          if (typeof child.killTimer != "undefined") {
            clearTimeout(child.killTimer);
            delete child.killTimer;
          }

          child.kill();
          request.callback(new Error(exports.ERR_TOO_MUCH_MEMORY), null);
        }
      });
    }, Math.max(3, (this.maxChildTime || 0) / 10));
  }

  // Run the script.
  
  child.runScript(request.scriptName, request.sandbox, function (response) {
    // Always stop the kill switch timer since well, we got a response in time.

    if (typeof child.killTimer != "undefined") {
      clearTimeout(child.killTimer);
      delete child.killTimer;
    }

    if (!response.ok) {
      // this only happens when there's a bug in Jefe, or something/someone
      // killed the relevant child process externally.
      //
      // we don't get into the semantics of a script's response; as long as the
      // script could and did run, it "worked", regardless of whether it
      // resulted in a "failure" (as defined by the user of the script, not
      // us).  thus, we throw and let the user figure out if they want to retry
      // given the unexpected failure.

      throw new Error("Unexpected Error: " + response.reason);
    }

    sys.log("[JEFE] child " + child.pid + " finished a run!");

    // Run finished.  Notify the callback with the response body.
    // null => no error.

    request.callback(null, response.response);

    // Remove this entry from the request queue.

    self.requestQueue.splice(request.selfIndex, 1);

    // Check to see if the child should now be recycled.
    
    if (++child.requestCount > self.recycleAfterN && self.recycleAfterN > 0) {
      sys.log("[JEFE] child " + child.pid + " is being recycled");
      child.kill();
    } else {
      self._dispatchQueued();
    }
  });
};

