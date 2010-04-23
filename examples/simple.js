var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe();

elJefe.addScript("set a sandboxed global", "FOOBAR=1");

