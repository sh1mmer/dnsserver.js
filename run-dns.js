var dnsserver = require('./lib/dnsserver'),
    sys = require('sys');

dnsserver = dnsserver.createServer();
dnsserver.listen(53, 'localhost');
