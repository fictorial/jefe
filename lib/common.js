exports.debugMode = process.env["JEFE_DEBUG"] || false;

exports.CRLF = "\r\n";

exports.COMPILE = "compile";
exports.REMOVE = "remove";
exports.RUN = "run";

exports.debugFilter = function (value) {
  return value.replace(/\r\n/g, '<CRLF>')
              .replace(/\r/g, '<CR>')
              .replace(/\n/g, '<LF>');
};

exports.ERR_MALFORMED = "malformed";
exports.ERR_INPUT_TOO_LARGE = "input too large";
exports.ERR_NO_SCRIPT = "no such script";
exports.ERR_UNEXPECTED_DEATH = "child died while running script";

