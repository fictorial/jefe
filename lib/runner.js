// Jefe: child process driver/worker.

var   
  sys = require("sys"),
  common = require("./common"),
  Script = process.binding('evals').Script,
  stdin = process.openStdin(),
  scripts = {},
  input = "";

stdin.setEncoding("utf8");

// Receive requests from the parent process.

stdin.addListener("data", function (chunk) {
  input += chunk;

  if (input.length > common.MAX_INPUT_SIZE) 
    internalError(common.ERR_INPUT_TOO_LARGE);

  var match, request;

  // Each request is a CRLF-delimited JSON object.

  while (match = input.match(common.LINE_REGEX)) {
    input = input.substr(match[0].length);

    var requestJSON = match[1];

    try {
      request = JSON.parse(requestJSON);
    } catch (e) {
      internalError(common.ERR_MALFORMED + ": invalid JSON request");
    }

    switch (request.cmd) {
      case common.COMPILE: onCompile(request); break;
      case common.REMOVE:  onRemove(request);  break;
      case common.RUN:     onRun(request);     break;
      default: 
        internalError(common.ERR_MALFORMED + ": unknown command"); 
    }
  }
});

function respond(response) {
  process.stdout.write(JSON.stringify(response) + common.CRLF);
}

function internalError(reason) {
  respond({ ok: false
          , reason: reason
          });

  sys.error(reason);
  process.exit(1);
}

function onCompile(request) {
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

function onRemove(request) {
  var name = (request.name || '').trim();

  if (name.length == 0) 
    internalError(common.ERR_MALFORMED + ": name required to remove");

  if (!scripts.hasOwnProperty(name)) 
    internalError(common.ERR_NO_SCRIPT);

  delete scripts[name];
}

function onRun(request) {
  var
    name = (request.scriptName || '').trim(),
    sandbox = request.sandbox || {};

  if (name.length == 0) 
    internalError(common.ERR_MALFORMED + ": name required to run");

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

    respond({ ok: true
            , body: { sandbox: sandbox }
            , timeTaken: elapsedMillis
            });

  } catch (e) {
    var elapsedMillis = Date.now() - startedAt;

    respond({ ok: true
            , body: { exception: e.message }
            , timeTaken: elapsedMillis
            });
  }

  // NB: You'd think that this would be a great place to *force*
  // a garbage collection cycle but there's no way to trigger it.
  // GC runs when the process is idle. 
}

