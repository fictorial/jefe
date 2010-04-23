var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "set a sandboxed global"; 

elJefe.addScript(scriptName, "FOOBAR=1");

elJefe.runScript(scriptName, { FOOBAR: 2 }, function (error, response) {
  if (error)  
    sys.log("[EXAMPLE/SIMPLE] error = " + error);
  else 
    sys.log("[EXAMPLE/SIMPLE] response = " + JSON.stringify(response));
});

