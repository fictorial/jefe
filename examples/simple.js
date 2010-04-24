var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "set a sandboxed global"; 

elJefe.addScript(scriptName, "FOOBAR=1");

elJefe.runScript(scriptName, { FOOBAR: 2 }, function (error, sandboxIn, sandboxOut) {
  if (error) {
    sys.log("error = " + error);
  } else {
    sys.log("sandboxIn  = " + JSON.stringify(sandboxIn));
    sys.log("sandboxOut = " + JSON.stringify(sandboxOut));
  }

  process.exit(0);
});

