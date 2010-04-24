var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),  // change me as needed
  elJefe = new jefe.Jefe(),
  scriptName = "circumference";

// Create the script once. This will compile it and cache it.  This script will
// calculate the circumference of a circle (how exciting!) of radius R.  Note
// that while untrusted scripts do not have access to the Node.js API, module
// system, etc. they do have access to standard JavaScript as implemented by V8.
// This includes built-in objects like Object, String, Array, Math, etc.

// If we provided an invalid script (e.g. syntax error), this `addScript` call
// would throw.

try {
  elJefe.addScript(scriptName, "C = 2 * Math.PI * R");
} catch (e) {
  sys.puts("Error adding script: " + e);
  process.exit(1);
}

// If we provided an invalid script (e.g. syntax error), this `addScript` call
// would throw, like this:

try {
  elJefe.addScript(scriptName, "C = 2 * ; Math.PI * R");
} catch (e) {                        // ^-- oops!
  sys.puts("Error adding script: " + e);
  sys.puts("It's OK. We were expecting that.");
}


// BTW, adding a script with the same name will replace any existing script with
// that name in Jefe.


// With the script added, let us run it N times, each with a distinct
// sandbox.  Since an untrusted script only has r/w access to the the sandbox
// we give it, we have a simple way of "passing" arguments and "returning"
// results.  To pass a parameter, set a value in the sandbox.  *Be careful what
// you set!*  The script looks for a "global" to find the argument(s).  To
// "return" a result from the script back to the caller, the script does
// nothing special; it just sets one or more "globals" (really just set in the
// sandbox object).

var nDone = 0;
for (var i = 0; i < 10; ++i) {
  elJefe.runScript(scriptName, { R:i+1 }, function (error, sandboxIn, sandboxOut) {

    // If there's a problem with Jefe (bug; someone else killed the child
    // process from the outside; etc.) then `error` will be a message
    // indicating what went wrong.  If `error == jefe.ERR_TOO_MUCH_TIME` then
    // the script took too long to finish.  If `error == jefe.ERR_TOO_MUCH_MEMORY` 
    // then the script used too much memory.  Otherwise, if `error` is non-null 
    // then the script threw an exception.  If `error === null` then the 
    // `sandboxOut` contains the contents of the sandbox at script end.
    
    if (error) throw new Error(error); 

    sys.puts("The circumference of a circle with radius " + sandboxIn.R + 
             " equals " + sandboxOut.C);

    if (++nDone == 10) finalize();
  });
}

function finalize() {
  // You can fetch statistics about the runs for each script.

  var stats = elJefe.getScriptStats(scriptName);
  var meanElapsed = stats.totalRunTime / (stats.runs || 1);
  sys.puts("mean elapsed time per run of '" + scriptName + "' was " + meanElapsed + " ms");
  sys.puts("all done!");

  process.exit(0);
}
