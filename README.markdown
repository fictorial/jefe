# Jefe

Jefe is a sandbox for running untrusted Javascript on the server in your
Node.js application.

You mess with Jefe and Jefe messes with you.

![logo](http://github.com/fictorial/jefe/raw/master/assets/jefe.png)

## Principles

1. An untrusted script may only see and touch that which the application 
   allows it to see and touch.
2. An untrusted script may only use a finite amount of time to run.
3. An untrusted script may only use a limited amount of RAM.

## How do I use it?

See [this example](http://github.com/fictorial/jefe/blob/master/examples/circumference.js) for a documented version.

    var sys    = require("sys"),
        jefe   = new require("../lib/jefe"),  // change me as needed
        elJefe = new jefe.Jefe();
    
    elJefe.compile("circumference", "C = 2 * Math.PI * R");
    
    elJefe.run("circumference", { R:10 }, function (error, sandboxIn, sandboxOut) {
      if (error) throw new Error(error); 
      sys.puts("The circumference of a circle with radius 10 is: " + sandboxOut.C);
      process.exit(0);
    });

    // The circumference of a circle with radius 10 is: 62.83185307179586

## How does it work?

Node.js has all the pieces of the puzzle.  Jefe just puts them together.

### Child Processes

Node.js is single-threaded. If Jefe simply ran untrusted scripts in situ, it
would not be possible to stop or kill a "long-running" script.  Indeed,
a script could easily make the host application unresponsive with only `while
(true) {}`, a form of "denial of service".  

Thus, Jefe runs untrusted scripts in spawned *child processes*.  Jefe monitors
each child, and if the child misbehaves, Jefe *kills* it, and notifies the
application which may take appropriate action (sanctions, boycotts, etc.).

In fact, Jefe manages a *pool* of child processes to run untrusted scripts. The
pool can be configured to use a minimum and maximum number of child processes.
Also, each child process can be restarted after N requests have been handled.  

To execute a request, Jefe uses any available child in the pool and sends it
the request, and then waits for the response (non-blocking).  Should no child
be available to handle a request, Jefe spawns another child (up to the
configured maximum) to handle the request.  Should there be no available child
processes, and the maximum number of child processes have been spawned, the
request is entered into a FIFO queue.  When a child returns a response,
a request is dequeued and sent to the now-available child.

### Sandboxing

An untrusted script may only see and touch that which the application allows it
to see and touch.

Untrusted scripts are run in a "sandbox" with no access (read nor write) to
either local or global scope.  The application can inject variables into the
sandbox which are then visible to an untrusted script.  The untrusted script
may only modify that which is visible in the sandbox.  By default, nothing is
visible.

In V8 terminology, each untrusted script is run in a new Javascript "context".

### Time Limits

An untrusted script may only use a finite amount of (wall-clock) time to run.

Monitoring time is performed via `setTimeout`.  A timer is started when the
child begins a run of untrusted scripts.  If the child returns a response Jefe
before the timer fires, the timer is cleared.  If the timer fires, the child is
killed.

### Memory Limits

An untrusted script may only use a limited amount of RAM.

Before each run of an untrusted script, the child's memory usage is determined
for to set a baseline measurement.  As the child runs the script, Jefe
periodically checks the memory usage of the child.  If the memory footprint
becomes too large, the child is killed. 

### IPC 

Jefe and the child processes communicate through a pipe.  Jefe sends a request,
the child handles the request, and the child returns a response to Jefe.  

See the [IPC Documentation](http://github.com/fictorial/jefe/blob/master/doc/ipc.markdown)

## How safe is this?

I personally make no guarantees about the safety of this software.  *Use at your
own risk.*  I wouldn't use this in production until a proper security audit is
performed.  

Please poke holes in Jefe, open issues on GitHub if you find a way to break
this software, offer suggestions for improvement, etc.  Thanks!

