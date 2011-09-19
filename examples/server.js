#!/usr/bin/env node

var dnsserver = require('../lib/dnsserver');

var server = dnsserver.createServer();
server.bind(8000, '127.0.0.1');

server.addListener('request', function(req, res) {
  console.log("req = ", req);

  if (req.question.domain == 'tomhughescroucher.com') {
    res.addRR(req.question.domain, 1, 1, 3600, '184.106.231.91')
  } else {
    res.header.rcode = 3; // NXDOMAIN
  }

  res.send();
});

server.addListener('error', function(e) {
  throw e;
});
