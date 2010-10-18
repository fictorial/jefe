var fs = require('fs');
var child_process = require('child_process');

if (process.platform.match(/linux/i)) {

  /** 
   * Determines how much RAM the system has.
   * This blocks and returns the result immediately.
   * You likely will only call this once anyway.
   * Result in KB.
   */

  exports.getSystemMemoryTotal = function (callback) {
		var contents = fs.readFileSync("/proc/meminfo",'ascii')
		,	m = contents.match(/^MemTotal:\s*(\d+)/m);

		return m ? parseInt(m[1], 10) : 0;
  };

  //make this async.
  //getSystemMemoryTotal wasn't isn't working for me in node 0.2.3 on ubuntu 10.4
  exports.getSystemMemoryTotalAsync = function (callback) {
    function meminfo(contents){
      var m = contents.match(/^MemTotal:\s*(\d+)/m)
		, x = m ? parseInt(m[1], 10) : 0;     

		  return m ? parseInt(m[1], 10) : 0;
		}
		var readStream = fs.createReadStream('/proc/meminfo', {flags: 'r', encoding:'ascii'})

		readStream.on('data', function(data) {
		  callback(null,meminfo(data));
		});
	};

  exports.getPeakMemoryUsage = function (pid, callback) {
	var peakRSS = null, systemMemory = null;
  //make this sync
  
    // NB: In my tests (http://gist.github.com/376770) I didn't see much of
    // a difference between peak RSS and the sum of "private memory" from
    // /proc/$pid/smaps; so, we use peak RSS (or HWM for "high water mark [for
    // RSS]".
    function calc_peak () {
	    if(systemMemory === null || peakRSS === null) {return}
      var peakRSSPercent = (peakRSS > 0 && systemMemory > 0) ? peakRSS / systemMemory : 0;
        callback(null, peakRSS, peakRSSPercent);
    }
    
    exports.getSystemMemoryTotalAsync(function(err,sysmem){
      systemMemory = sysmem;
      calc_peak();
    });

    var readStream = fs.createReadStream("/proc/" + pid + "/status", {flags: 'r', encoding:'ascii'})
	   readStream.on('data', function ( contents) {
        var match = contents.match(/^VmHWM:\s+(\d+)\s+kB$/m);
          
        peakRSS = match ? parseInt(match[1], 10) : 0;
		  calc_peak();
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

