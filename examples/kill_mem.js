var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "script that creates too much memory should be killed";

var sourceCode = "A = []; while (true) A.push('a')";

elJefe.compile(scriptName, sourceCode, { maxMem: 10240, maxTime: 0 } );     // KB

sys.error("this will kill the script for using too much memory regardless of how long it takes ...");

elJefe.run(scriptName, {}, function (error, sandboxIn, sandboxOut) {
  if (error) {
    sys.puts("error = " + error);
  } else {
    sys.puts("completed without error");
    sys.puts("sandboxOut = " + JSON.stringify(sandboxOut));
  }

  var stats = elJefe.getScriptStats(scriptName);
  sys.puts(sys.inspect(stats));

  process.exit(0);
});

