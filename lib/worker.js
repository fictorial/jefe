// Jefe: child process driver/worker.

var   
  sys = require("sys"),
  common = require("./common"),
  Script = process.binding('evals').Script,

  MAX_INPUT_SIZE = process.env["JEFE_MAX_INPUT_SIZE"] || 5*1024*1024, // 5 MiB
  LINE_REGEX = /^(.+?)\r\n/,

  stdin = process.openStdin(),
  scripts = {},
  input = "";

stdin.setEncoding("utf8");

stdin.addListener("data", function (chunk) {
  input += chunk;

  if (input.length > MAX_INPUT_SIZE) 
    internalError(common.ERR_INPUT_TOO_LARGE);

  var match;

  while (match = input.match(LINE_REGEX)) {
    input = input.substr(match[0].length);

    var requestJSON = match[1];

    try {
      var request = JSON.parse(requestJSON);
    } catch (e) {
      internalError(common.ERR_MALFORMED + ": invalid JSON request");
    }

    switch (request.cmd) {
      case common.ADD_SCRIPT:    addScript(request);    break;
      case common.REMOVE_SCRIPT: removeScript(request); break;
      case common.RUN_SCRIPT:    runScript(request);    break;
      default:           
        internalError(common.ERR_MALFORMED + ": unknown command"); 
    }
  }
});

function sendResponse(response) {
  var serializedResponse = JSON.stringify(response) + common.CRLF
  process.stdout.write(serializedResponse);
}

function internalError(reason) {
  sendResponse({ ok: false
               , reason: reason
               });

  sys.error(reason);
  process.exit(1);
}

function addScript(request) {
  var
    name = (request.scriptName || '').trim()
    code = (request.script || '').trim();

  if (name.length == 0 || code.length == 0) 
    internalError(common.ERR_MALFORMED + ": name/code required");

  try {
    var script = new Script(code, name);
    scripts[name] = script;
  } catch (e) {
    internalError(e);
  }
}

function removeScript(request) {
  var name = (request.name || '').trim();

  if (name.length == 0) 
    internalError(common.ERR_MALFORMED + ": name required");

  if (!scripts.hasOwnProperty(name)) 
    internalError(common.ERR_NO_SCRIPT);

  delete scripts[name];
}

function runScript(request) {
  var
    name = (request.scriptName || '').trim(),
    sandbox = request.sandbox || {};

  if (name.length == 0) 
    internalError(common.ERR_MALFORMED + ": name required");

  if (!scripts.hasOwnProperty(name)) 
    internalError(common.ERR_NO_SCRIPT);

  var script = scripts[name];

  // NB: We do not consider it an "error" when the code itself throws.
  // An "error" to us is a Jefe issue/bug.  Hence "ok":true for both
  // throw and no-throw branches here.

  var startedAt = Date.now();

  try {
    script.runInNewContext(sandbox);

    var elapsedMillis = Date.now() - startedAt;

    sendResponse({ ok: true
                 , body: { sandbox: sandbox }
                 , timeTaken: elapsedMillis
                 });

  } catch (e) {
    var elapsedMillis = Date.now() - startedAt;

    sendResponse({ ok: true
                 , body: { exception: e.message }
                 , timeTaken: elapsedMillis
                 });
  }

  // NB: You'd think that this would be a great place to *force*
  // a garbage collection cycle but there's no way to trigger it.
  // GC runs when the process is idle. 
}

