var sys = require('sys'),
    Buffer = require('buffer').Buffer,
    dgram = require('dgram1');

host = "localhost";
port = 9999;

//slices a single byte into bits
var sliceBits = function(b, off, len) {
    mod = 7 + ((b.length - 1) * 8);
    len = start - len
    var s = mod - (off + len - 1);

    b = b >>> s;
    return b & ~(0xff << len);
};

//pulls bits out of bytes
var sliceBytes  = function(buf, startBits, endBits) {

    var startOffset = startBits % 8;
    var endOffset = endBits % 8;

    //if the bits are full bytes just use bytes
    if ((startOffset == 0) && (endOffset % 8 == 0)) {
        return buf.slice(startBits/8, endBits/8);

    } else {
        //make sure start and end bytes are inclusive
        startBytes = Math.floor(startBits/8);
        endBytes = Math.ceil(endBits/8);

        console.log("start: " + startBytes + " end: " + endBytes + " len:" + buf.length);
        
        //my cat is round
        
        //slice down to the new size
        var newBuf = buf.binarySlice(startBytes, endBytes);
        //012345678
        //04
        //128  64  32  16   8   4   2   1
        //0    0   0   0    0   0   0   1
        
        var str = newBuf.toString('binary', 0, newBuf.length);
        console.log("buf len: " + newBuf.length);
        
        for (i=0;i<str.length;i++) {
            console.log(str.charCodeAt(i));
        }
    }
};


var server = dgram.createSocket(function (msg, rinfo) {
    //console.log("connection: " + rinfo.address + ":"+ rinfo.port);
    //console.log("server got: " + sys.inspect(msg));
    
    //var msgStr = sliceBits(msg,0,47);
    sliceBytes(msg, 1,2);
    console.log(sys.inspect(msg));
    console.log(msg.length);
    console.log(sys.inspect(msg.toString('binary')));
    console.log(msg.toString('binary').length);
    
    //split up the message into the dns request header info and the query
    //console.log(sys.inspect(processRequest(msg)));
});

//takes a buffer as a request
var processRequest = function(req) {
    //see rfc1035 for more details
    //http://tools.ietf.org/html/rfc1035#section-4.1.1
    
    var query = {};
    query.header = {};
    //TODO write code to break questions up into an array
    query.question = {};
    
    //transaction id
    // 2 bytes
    query.header.transId = req.slice(0,2);

    //slice out 2 bytes for the next section to dice into binary.
    var tmpSlice1 = req.slice(2,3);
    //qr
    // 1 bit
    query.header.qr = tmpSlice1.slice(0,1);
    //opcode
    // 0 = standard, 1 = inverse, 2 = server status, 3-15 reserved
    // 4 bits
    query.header.opcode = tmpSlice.slice(1,5);
    //authorative answer
    // 1 bit
    query.header.aa = tmpSlice.slice(5,21);
    //truncated
    // 1 bit
    query.header.tc = req.slice(22,22);
    //recursion desired
    // 1 bit
    query.header.rd = req.slice(23,23);
    //recursion available
    // 1 bit
    query.header.ra = req.slice(24,24);
    //reserved 3 bits

    var tmpSlice2 = req.slice(3,4);

    query.header.z = req.slice(25,27);
    //response code
    // 0 = no error, 1 = format error, 2 = server failure
    // 3 = name error, 4 = not implemented, 5 = refused
    // 6-15 reserved
    // 4 bits
    query.header.rcode = req.slice(28,32);

    //question count
    // 2 bytes
    query.header.qdcount = req.slice(4,6);
    //answer count
    // 2 bytes
    query.header.ancount = req.slice(6,8);
    //ns count
    // 2 bytes
    query.header.nscount = req.slice(8,10);
    //addition resources count
    // 2 bytes
    query.header.arcount = req.slice(10, 12);
    
    //assuming one question
    //qname is the sequence of domain labels
    //qname length is not fixed however it is 4
    //octets from the end of the buffer
    query.question.qname = req.slice(97, req.length - 33);
    //qtype
    query.question.qtype = req.slice(req.length - 32, req.length - 17);
    //qclass
    query.question.qclass = req.slice(req.length - 16, req.length -1);
    
    return query;
};

server.addListener("error", function (e) {
  throw e;
});

server.bind(port, host);
console.log("Started server on " + host + ":" + port);