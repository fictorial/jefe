// This is the child process handler.

var   
  sys = require("sys"),
  stdin = process.openStdin(),
  scripts = {},                                   // name => Script
  banner = "[JEFE-CHILD " + process.pid + "]: ",
  CRLF = "\r\n";

stdin.setEncoding("utf8");

stdin.addListener("data", function (chunk) {
  process.stdout.write(banner + "data: " + chunk + CRLF);
});

stdin.addListener("end", function () {
  process.stdout.write(banner + "end" + CRLF);
});

