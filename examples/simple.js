var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "set a sandboxed global"; 

elJefe.compile(scriptName, "FOOBAR=1");

elJefe.run(scriptName, { FOOBAR: 2 }, function (error, sandboxIn, sandboxOut) {
  if (error) {
    sys.puts("error = " + error);
  } else {
    sys.puts("sandboxIn  = " + JSON.stringify(sandboxIn));
    sys.puts("sandboxOut = " + JSON.stringify(sandboxOut));
  }

  process.exit(0);
});

