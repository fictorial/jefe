# Jefe API

## Jefe(options)

Creates a Jefe.

`options` is an optional `Object` used to configure this Jefe.  

`options` may contain the following keys:

`maxChildMemKB`: maximum amount of RAM (in KB) to allow any given script to
use.  The default is 10240 KB (or 10 megabytes).  If a script causes a child to
use more than this amount of RAM, the child process is killed.

`maxChildMemPercent`: maximum amount of RAM to allow any given script to use as
a percentage of total system RAM.  The default is 0 (disabled).  If a script
causes a child to use more than this percentage of total system RAM the child
process is killed.

`maxChildTime`: maximum amount of time (in ms) to allow a script is allowed to
run before the child process is killed. The default is 250 ms.

`minProcs`: the minimum number of processes to use in the pool.  The default is 1.

`maxProcs`: the maximum number of processes to use in the pool.  The default is 4.

`recycleAfterN`: kill and respawn a child process after it has handled N requests.  
The default is 100 requests.

## .adjustPoolSize(minProcs, maxProcs)

Changes the size of the child process pool to have at least `minProcs` and no
more than `maxProcs`.

If there are too few processes in the pool, more are added.

If there are too many processes in the pool, idle/free/available processes are
killed.  If there are too few idle/free/available processes to kill to fulfill
the `maxProcs` constraint, the busy processes are *not* killed.  Instead, when
a busy process completes a run, it is killed as per the current value of
`maxProcs`.

## .addScript(name, script)

Adds a script by name.

`name` is an arbitrary script identifier.

`script` is Javascript source script.

## .removeScript(name)

Removes a script by name.

`name` is an arbitrary script identifier as previously passed to `addScript`.

## .runScript(name, sandboxIn, callback)

Runs the script and calls back with the result.

`name` is the script identifier from a previous call to `addScript`.

`sandbox` is an optional sandbox environment for the script; an `Object`.

`callback` is a function that is called back when the script has completed
running in some child process.  

The arguments to the callback are `(error, sandboxIn, sandboxOut)`.  

If the child was killed for taking too much time or using too much memory, the
`error` argument will be a `String` message equal to one of the `ERR_*`
constants of the `jefe` module (e.g. `jefe.ERR_TOO_MUCH_TIME`).

If the script was run successfully but threw an exception, the `error` argument
will equal a `String` message equal to the exception thrown by the script.

If the script was run successfully and did not throw an exception, the `error`
argument will equal `null`, `sandboxIn` will be the original input sandbox
object, and `sandboxOut` will be the "globals" at the time the run of the
script ended.  

## .getScriptStats(name)

Returns statistics about the given script identified by `name`.  The statistics are
an represented by an `Object` of the form:

    { runs: 0           // # runs since added
    , totalRunTime: 0   // total elapsed time across all runs (millis)
    , killed: 0         // # times this script had to be forcibly killed
    , killedTime: 0     // # times this script had to be forcibly killed for taking too long
    , killedMem: 0      // # times this script had to be forcibly killed for using too much memory
    }

