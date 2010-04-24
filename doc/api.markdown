# Jefe API

## Jefe(options)

Creates a Jefe.

`options` is an optional `Object` used to configure this Jefe.  

`options` may contain the following keys:

`maxChildMemKB`: maximum amount of RAM (in KB) to allow any given script to
use.  The default is 10240 KB (or 10 megabytes).  If a script causes a child to
use more than this amount of RAM, the child process is killed.

`maxChildMemPercent`: maximum amount of RAM to allow any given script to use as
a percentage of total system RAM.  The default is 0.15 or 15%.  If a script
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

## .runScript(name, sandbox, callback)

Runs the script and calls back with the result.

`name` is the script identifier from a previous call to `addScript`.

`sandbox` is an optional sandbox environment for the script; an `Object`.

`callback` is a function that is called back when the script has completed
running in some child process.  The arguments to the callback are `(error,
response)`.  

If the child was killed for taking too much time or using too much memory, the
`error` argument will be an `Error` object a `message` equal to one of the
`ERR_*` constants of the `jefe` module, else it will be `null`.  

If the script was run successfully, the `error` argument will be `null` and
`response` will be an `Object` representing the response of the script.  When
the script throws, the `response` will resemble `{ exception: ... }`.  When
the script does not throw, the `response` will resemble `{ sandbox: {...} }`
which represents the script-level globals at the end of the script run.

Note that the `sandbox` object argument to `runScript` is never altered.
