exports.CRLF = "\r\n";

exports.ADD_SCRIPT = "AddScript";
exports.REMOVE_SCRIPT = "RemoveScript";
exports.RUN_SCRIPT = "RunScript";

exports.debugFilter = function (value) {
  return value.replace(/\r\n/g, '<CRLF>')
              .replace(/\r/g, '<CR>')
              .replace(/\n/g, '<LF>');
};

exports.ERR_MALFORMED = "malformed";
exports.ERR_INPUT_TOO_LARGE = "input too large";
exports.ERR_NO_SCRIPT = "no such script";
exports.ERR_UNEXPECTED_DEATH = "child died while running script";

