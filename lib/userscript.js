var Script = process.binding('evals').Script;

/**
 * A user (AKA "third-party") Javascript.
 *
 * @param {String} name Arbitrary script name/identifier.
 * @param {String} sourceCode Javascript source code.
 * @param {Object} options Optional configuration.
 * `maxMem` and `maxMemPercent` is the maximum amount of memory the script may
 * cause a child process to *grow by* before the host child process is killed
 * and the script run considered to have ended in error.  The default is to
 * allow a growth of no more than `10 MB` or (`10240 KB`).  `maxTime` is the
 * amount of wall-clock time a script is allowed to use before its host child
 * process is killed and the script run considered to have ended in error.  The
 * default is `250 ms`.
 * @exception SyntaxError when their's a syntax error in `sourceCode`.
 */

function UserScript(name, sourceCode, options) {
  var notUsedJustThrow = new Script(sourceCode, name + "_userscript.js");

  var opts = options || {};

  this.maxMem = opts.maxMem || 10240;    // KB
  if (this.maxMem < 0) throw new Error("maxMem");

  this.maxMemPercent = opts.maxMemPercent || 0;
  if (this.maxMemPercent < 0 || this.maxMemPercent > 1) 
    throw new Error("maxMemPercent");

  this.maxTime = Math.max(0, opts.maxTime || 250);

  this.name = name || '';
  this.sourceCode = sourceCode;

  this.stats = { runs: 0
               , totalRunTime: 0
               , kills: {}         // reason => count
               };
};

exports.UserScript = UserScript;

UserScript.prototype.wasKilled = function (reason) {
  if (typeof this.stats.kills[reason] == "undefined")
    this.stats.kills[reason] = 1;
  else
    this.stats.kills[reason]++;
};

UserScript.prototype.wasRun = function (timeTaken) {
  this.stats.runs++;
  this.stats.totalRunTime += timeTaken;
};

