# Parent-Child IPC in Jefe

Jefe and the child processes communicate through a pipe.  Jefe sends a request,
the child handles the request, and the child returns a response to Jefe.  Requests
and responses are JSON objects delimited by CRLF ("\r\n").

Requests include:

* specifying untrusted scripts with an associated name ("compile")
* executing the scripts with an optional sandbox environment ("run")
* removing the untrusted scripts associated with a name ("remove")

#### compile Request

The application sends the untrusted scripts to the child processes via Jefe.
When the child receives the compile request, it creates a `Script` with the
given scripts. The child associates the `Script` with the given script name.
Reusing an existing name overwrites any current `Script` associated with the
given name.

Jefe sends:

    { "cmd":"compile"
    , "scriptName":"$someName"
    , "script":"$sourceCode"
    } <CRLF>

#### remove Request

The application no longer needs the given scripts. The child processes remove
the scripts by name.

Jefe sends:

    { "cmd":"remove"
    , "scriptName":"$someName"
    } <CRLF>

#### run Request

When the child receives the run request, it finds the `Script` by name,
and runs the script with the given sandbox object, and finally returns the
sandbox object as potentially modified by the scripts during the run.

Jefe sends:

    { "cmd":"run"
    , "scriptName":"$someName"
    , "sandbox":{...}
    } <CRLF>

When the scripts finishes running successfully, the (potentially updated) sandbox
object is returned to Jefe:

    { "ok":true
    , "response":{ "sandbox":{...} }
    , "timeTaken":$elapsedMillis
    } <CRLF>

When the scripts throws, the child responds with:

    { "ok":true
    , "response":{ "exception":{...} }
    } <CRLF>

Note: `ok:true` denotes that the child was able to run the scripts, not that the
scripts ran without (its own definition of) error.

#### Sanity Checks

If Jefe somehow creates a malformed request (bug), the child prints to stderr and quits.

    { "ok":false
    , "reason":"malformed request"
    } <CRLF>

Each child has a maximum input size for a sanity check.  This is by default 5MiB.
Set the environment variable `JEFE_MAX_INPUT_SIZE` to alter this, or clone and update
the scripts. If a child receives too much data, it prints to stderr and quits.

    { "ok":false
    , "reason":"input too large
    } <CRLF>

## Copyright

© Copyright 2010 Fictorial LLC. All Rights Reserved.
