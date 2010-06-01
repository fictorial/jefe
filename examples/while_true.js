var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "while forever loop should not run forever"; 

elJefe.compile(scriptName, "while (true) {}", { maxTime: 5000 } );

sys.error("this will wait up to 5s before killing the script ...");

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

