# Jefe

Jefe is a sandbox for running third-party javascript on the server.

You mess with Jefe and Jefe messes with you.

![logo](http://github.com/fictorial/jefe/raw/master/assets/jefe.png)

## Principles

1. Third-party code may only see and touch that which your 
   Node.js app allows it to see and touch.
2. Third-party code may only use a finite amount of time to run.
3. Third-party code may only use a limited amount of RAM.

## How does it work?

Node.js has all the pieces of the puzzle.  Jefe just puts them together.

### Child Processes

Node.js is single-threaded. If Jefe simply ran the third-party code in situ, it
would not be possible to stop long-running code.  Indeed, rogue code could
easily make the application unresponsive with only `while (true) {}`.  Thus,
Jefe runs third-party code in a spawned *child process*.  Jefe monitors the
child, and if the child misbehaves, Jefe *kills* it, and respawns a new child
for future requests.  

### Child Process Pool

In fact, Jefe manages a *pool* of child processes to run third-party code. The
pool can be configured to use a minimum and maximum number of child processes.
Also, each child can be recycled/restarted after N requests have been
handled.  

To execute a request, Jefe uses any available child in the pool and sends it
the request, and then waits for the response (non-blocking).  Should no child
be available to handle a request, Jefe spawns another child (up to the
configured maximum) to handle the request.  Should there be no available child
processes, and the maximum number of child processes have been spawned, the
request is entered into a FIFO queue.  When a child returns a response,
a request is dequeued and sent to the now-available child.

### Time Limits

Monitoring wall-clock time is performed via `setTimeout`.  A timer is started
when the child begins a run of third-party code.  If the child returns
a response Jefe before the timer fires, the timer is cleared.  If the timer
fires, the child is killed.

### Memory Limits

Before each run of third-party code, the child's memory usage is determined for
to set a baseline measurement.  As the child runs the code, Jefe periodically
checks the memory usage of the child.  If the memory footprint becomes too
large, the child is killed.  FYI, the child collects garbage after each run
of third-party code.

### IPC 

Jefe and the child processes communicate through a pipe.  Jefe sends a request,
the child handles the request, and the child returns a response to Jefe.  Requests
and responses are JSON objects delimited by CRLF ("\r\n").

Requests include:

* specifying third-party code with an associated name ("AddCode")
* executing the code with an optional sandbox environment ("ExecCode")
* removing the third-party code associated with a name ("RemoveCode")

#### AddCode Request

The application sends the third-party code to the child processes via Jefe.
When the child receives the AddCode request, it creates a `Script` with the
given code. The child associates the `Script` with the given script name.
Reusing an existing name overwrites any current `Script` associated with the
given name.

Jefe sends:

    { "cmd":"AddCode"
    , "name":"$someName"
    , "code":"$sourceCode"
    } <CRLF>

The child responds with:

    { "ok":true } <CRLF>

#### RemoveCode Request

The application no longer needs the given code. The child processes remove
the code by name.

Jefe sends:

    { "cmd":"RemoveCode"
    , "name":"$someName"
    } <CRLF>

The child responds with:

    { "ok":true } <CRLF>

When the child fails to find a script associated with the given name, it
responds with:

    { "ok":false
    , "reason":"no such script"
    } <CRLF>

#### ExecCode Request

When the child receives the ExecCode request, it finds the `Script` by name,
and runs the script with the given sandbox object, and finally returns the
sandbox object as potentially modified by the code during the run.

Jefe sends:

    { "cmd":"ExecCode"
    , "name":"$someName"
    , "inputSandbox":{...}
    } <CRLF>

When the child fails to find a script associated with the given name, it
responds with:

    { "ok":false
    , "reason":"no such script"
    } <CRLF>

When the code finishes running, the (potentially updated) sandbox object is
returned to Jefe:

    { "ok":true
    , "outputSandbox":{...}
    } <CRLF>

#### Malformed Requests

If Jefe somehow creates a malformed request (bug), the child returns:

    { "ok":false
    , "reason":"malformed request"
    } <CRLF>

## Copyright

© Copyright 2010 Fictorial LLC. All Rights Reserved.

## License

MIT

## Author

Brian Hammond (brian at fictorial dot com)

