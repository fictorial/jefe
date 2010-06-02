var fs = require('fs');

if (process.platform.match(/linux/i)) {

  var binding = process.binding('fs');

  // The fs.readFileSync in Node v0.1.97 relies on stat(2) to determine the
  // file size, create a Buffer, then read that size into the Buffer.  A Buffer
  // has no facility to grow in size.  The problem is that on Linux
  // /proc/x/status has a size of 0, and thus nothing is read.  "Files" in
  // /proc are not really disk files. We fallback to the fs.readFileSync of
  // Node v0.1.96 which just reads in chunks into a String.  NOTE: The "files"
  // we're reading are small and are basically streamed from the kernel to
  // userland; there's no real disk I/O.  Thus, readFile__Sync__ in this case
  // is not a performance problem in practice.

  var readFileSync = function (path, encoding) {
    encoding = encoding || "utf8"; // default to utf8

    var fd = binding.open(path, process.O_RDONLY, 0666);
    var content = '';
    var pos = null;   // leave null to allow reads on unseekable devices
    var r;

    while ((r = fs.readSync(fd, 4*1024, pos, encoding)) && r[0]) {
      content += r[0];
      pos += r[1]
    }

    binding.close(fd);

    return content;
  };

  /** 
   * Determines how much RAM the system has.
   * This blocks and returns the result immediately.
   * You likely will only call this once anyway.
   * Result in KB.
   */

  exports.getSystemMemoryTotal = function () {
    var contents = fs.readFileSync("/proc/meminfo");
    if (!contents) 
      throw new Error("Failed to read /proc/meminfo");
    var m = contents.toString().match(/^MemTotal:\s*(\d+)/m);
    return m ? parseInt(m[1], 10) : 0;
  };

  exports.getPeakMemoryUsage = function (pid, callback) {
    // NB: In my tests (http://gist.github.com/376770) I didn't see much of
    // a difference between peak RSS and the sum of "private memory" from
    // /proc/$pid/smaps; so, we use peak RSS (or HWM for "high water mark [for
    // RSS]".  See note above about __sync__ here.

    var contents = readFileSync("/proc/" + pid + "/status");

    if (!contents) {
      callback(err, 0, 0);
    } else {
      var 
	match = contents.toString().match(/^VmHWM:\s+(\d+)\s+kB$/m),
	peakRSS = match ? parseInt(match[1], 10) : 0,
	peakRSSPercent = (peakRSS > 0 && exports.systemMemoryTotal > 0) 
	  ? peakRSS / exports.systemMemoryTotal : 0;

      callback(null, peakRSS, peakRSSPercent);
    }
  };

} else {

  // TODO patches please for non-Linux! :)

  exports.getSystemMemoryTotal = function () {
    return 0;
  };

  exports.getPeakMemoryUsage = function (pid, callback) {
    callback(new Error("unsupported"), 0);
  };
}

exports.systemMemoryTotal = exports.getSystemMemoryTotal();

