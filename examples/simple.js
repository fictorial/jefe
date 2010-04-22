var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe();

elJefe.addScript("set a sanboxed global", "FOOBAR=1");

