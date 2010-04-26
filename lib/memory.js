if (process.platform.match(/linux/i)) {

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
    var m = contents.match(/^MemTotal:\s*(\d+)/m);
    return m ? parseInt(m[1], 10) : 0;
  };

  exports.getPeakMemoryUsage = function (pid, callback) {
    // NB: In my tests (http://gist.github.com/376770) I didn't see much of
    // a difference between peak RSS and the sum of "private memory" from
    // /proc/$pid/smaps; so, we use peak RSS (or HWM for "high water mark [for
    // RSS]".

    fs.readFile("/proc/" + pid + "/status", function (err, contents) {
      if (err) {
        callback(err, 0, 0);
      } else {
        var 
          match = contents.match(/^VmHWM:\s+(\d+)\s+kB$/m),
          peakRSS = match ? parseInt(match[1], 10) : 0,
          peakRSSPercent = (peakRSS > 0 && systemMemoryTotal > 0) ? peakRSS / systemMemoryTotal : 0;

        callback(null, peakRSS, peakRSSPercent);
      }
    });
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

