var sys = require('sys'),
    Buffer = require('buffer').Buffer,
    dgram = require('dgram'),
    riak = require('riak-node');

var domainToQname = function(domain) {
    var tokens = domain.split(".");
    len = domain.length + 2;
    var qname = new Buffer(len);
    var offset = 0;
    for(var i=0; i<tokens.length;i++) {
        qname[offset]=tokens[i].length;
        offset++;
        for(var j=0;j<tokens[i].length;j++) {
            qname[offset] = tokens[i].charCodeAt(j);
            offset++;
        }
    }
    qname[offset] = 0;
    
    return qname;
};


db = new riak(); 

records = {};
records['tomhughescroucher.com'] = {};
records['tomhughescroucher.com']['in'] = {};
records['tomhughescroucher.com']['in']['a'] = [];

var r = {};
r.qname = domainToQname('tomhughescroucher.com');
r.qtype = 1;
r.qclass = 1;
r.ttl = 1;
r.rdlength = 4;
r.rdata = 0xBC8A0009;

records['tomhughescroucher.com']['in']['a'].push(r);

r = {};
r.qname = domainToQname('tomhughescroucher.com');
r.qtype = 1;
r.qclass = 1;
r.ttl = 1;
r.rdlength = 4;
r.rdata = 0x7F000001;

records['tomhughescroucher.com']['in']['a'].push(r);

for(key in records) {
   db.save('dns-test', key, records[key])();
}
