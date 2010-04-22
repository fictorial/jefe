# Jefe

Jefe is a sandbox for running third-party javascript on the server.

![logo](http://github.com/fictorial/jefe/raw/master/jefe.png)

## Principles

1. Third-party code may only see and touch that which you allow it to see and touch.
2. Third-party code may only use a finite amount of time to run.
3. Third-party code may only use a limited amount of RAM.

If any of the above principles are violated, the code is killed.

4. You mess with el Jefe and el Jefe messes with you.

## How does it work?

Node.js has all the pieces of the puzzle.  Jefe just puts them together.

### Child Processes

Node.js is single-threaded. If Jefe simply executed the third-party code in
situ, it would not be possible to stop the long-running code from running.
Indeed, rogue code could easily make the application unresponsive with only
`while (true) {}`.  Thus, Jefe runs third-party code in a *child process*.
A child process is started once and reused for (hopefully many) executions of
third-party code. 

The parent process monitors the child process, and if the child process
misbehaves, *kills* it, and respawns a new child process for future requests.
The parent needs to ensure that the child process does not use more memory than
allowed, and returns a response to a request within a specific time limit.

### Child Process Pool

In fact, Jefe manages a *pool* of child processes to execute requests. The pool
can be configured to use a minimum and maximum number of child processes. Each
process can be recycled/restarted after N requests have been processed.  To 
execute a request, Jefe will find the first available process and send it the
request, and wait for the response.  Should no child process be available,
Jefe starts another child process (up to the configured maximum) and sends it
the request.  Should there be no available child processes, and the number of
child processes has reached the maximum, the request is enqueued on a FIFO queue.
When a child process returns a response, any pending request from the queue
is dequeued and sent to the now-available child process.

### Time Limits

Monitoring wall-clock time is done simply using `setTimeout`.  A timer is
started when the child process begins execution of third-party code.  If the
child returns a response to the parent before the timer fires, the timer is
cleared.  If the timer fires, the child is killed.

### Memory Limits

Before each execution of third-party code, the memory usage is determined for
the child process to set a baseline measurement.  As the child executes the
code, the parent periodically checks the memory usage of the child.  If the
memory footprint becomes too extreme, the child process is killed.  The child
collects garbage after each execution of third-party code.

FYI, all Jefe cares about is the total resident memory of the child process,
and not just memory private to the child process since, when the child
process hands over control to the third-party code, any change in memory usage
must be directly related to the third-party code.  Who cares if that memory is
shared or private? 

### Parent-Child IPC 

The parent and child processes communicate through a pipe.  The parent sends
a request, the child processes the request, and the child returns a response.
The parent requests include:

* specifying third-party code with an associated name ("SendCode")
* executing the code with an optional sandbox environment ("ExecCode")

#### SendCode Request

When the child receives the SendCode request, it creates a `Script` with the
code. If there are any syntax problems, the child returns an error.  Else, the
child associates the `Script` with the given script name.  Reusing an existing
name overwrites any current `Script` associated with the given name.

The parent sends:

    { "cmd":"SendCode"
    , "name":"$someName"
    , "code":"$sourceCode"
    } <CRLF>

When the input code has a syntax error, the child responds with something like this:

    { "ok":false
    , "reason":"SyntaxError"
    , "line":lineNumber
    , "message":"Unexpected ;"
    } <CRLF>

When the input code is valid, the child responds with:

    { "ok":true } <CRLF>

#### ExecCode Request

When the child receives the ExecCode request, it finds the `Script` by name,
and runs the script with the given sandbox object, and finally returns the
sandbox object as potentially modified by the code during the run.

The parent sends:

    { "cmd":"ExecCode"
    , "name":"$someName"
    , "inputSandbox":{...}
    } <CRLF>

When the child fails to find a script associated with the given name, it returns:

    { "ok":false
    , "reason":"no such script"
    } <CRLF>

When the code finishes running, the sandbox object is returned to the parent:

    { "ok":true
    , "outputSandbox":{...}
    }

#### Malformed Requests

If the parent somehow creates a malformed request, the child process returns:

    { "ok":false
    , "reason":"malformed request"
    } <CRLF>

## Metadata

© Copyright 2010 Fictorial LLC. All Rights Reserved.

