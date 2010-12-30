var 
  sys = require("sys"),
  jefe = new require("../lib/jefe"),
  elJefe = new jefe.Jefe(),
  scriptName = "script_name",
  timestamp = new Date(),
  runs = 1000,
  completed = 0,
  src = 'out = "0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789 0123456789"';

elJefe.compile(scriptName, src, {maxTime:1000});
for (var i = 0; i < runs; i++) {
  elJefe.run(scriptName, {}, function (error, sandboxIn, sandboxOut) {
    if (error) sys.puts("error = " + error);
    if (++completed == runs) {
      sys.puts('SUCCESS: completed '+runs+' jobs in '+
        (new Date()-timestamp)/1000 + 's');
        
      Object.keys(elJefe.childHandlers).forEach(function(each) {
          sys.puts(elJefe.childHandlers[each].toString()) });
      sys.puts('Pool size: ' + elJefe.pool.size());
      process.exit(0);
    }
  })
}
setTimeout(function() {
  sys.puts('FAIL: Timeout reached. Incomplete jobs: ' + (runs - completed));
  process.exit(1);
}, 3000)