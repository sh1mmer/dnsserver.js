var sys = require('sys'),
    Buffer = require('buffer').Buffer,
    dgram = require('dgram1');

host = "localhost";
port = 9999;

// slices a single byte into bits
// assuming only single bytes
var sliceBits = function(b, off, len) {
    var s = 7 - (off + len - 1);

    b = b >>> s;
    return b & ~(0xff << len);
};

// pulls bits out of bytes
// assuming you cannot cross byte boundaries for now
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
    
    //split up the message into the dns request header info and the query
    var q = processRequest(msg);
    console.log(sys.inspect(q));
    console.log(sys.inspect(q.question.qname.toString('binary')));
});

//takes a buffer as a request
var processRequest = function(req) {
    //see rfc1035 for more details
    //http://tools.ietf.org/html/rfc1035#section-4.1.1
    
    var query = {};
    query.header = {};
    //TODO write code to break questions up into an array
    query.question = {};

    var tmpSlice;
    var tmpByte;
        
    //transaction id
    // 2 bytes
    query.header.transId = req.slice(0,2);

    //slice out a byte for the next section to dice into binary.
    tmpSlice = req.slice(2,3);
    //convert the binary buf into a string and then pull the char code
    //for the byte
    tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);
    
    //qr
    // 1 bit
    query.header.qr = sliceBits(tmpByte, 0,1);
    //opcode
    // 0 = standard, 1 = inverse, 2 = server status, 3-15 reserved
    // 4 bits
    query.header.opcode = sliceBits(tmpByte, 1,4);
    //authorative answer
    // 1 bit
    query.header.aa = sliceBits(tmpByte, 5,1);
    //truncated
    // 1 bit
    query.header.tc = sliceBits(tmpByte, 6,1);
    //recursion desired
    // 1 bit
    query.header.rd = sliceBits(tmpByte, 7,1);

    //slice out a byte to dice into binary
    tmpSlice = req.slice(3,4);
    //convert the binary buf into a string and then pull the char code
    //for the byte
    tmpByte = tmpSlice.toString('binary', 0, 1).charCodeAt(0);
    
    //recursion available
    // 1 bit
    query.header.ra = sliceBits(tmpByte, 0,1);

    //reserved 3 bits
    query.header.z = sliceBits(tmpByte, 1,3);

    //response code
    // 0 = no error, 1 = format error, 2 = server failure
    // 3 = name error, 4 = not implemented, 5 = refused
    // 6-15 reserved
    // 4 bits
    query.header.rcode = sliceBits(tmpByte, 4,4);

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
    query.question.qname = req.slice(12, req.length - 4);
    //qtype
    query.question.qtype = req.slice(req.length - 4, req.length - 2);
    //qclass
    query.question.qclass = req.slice(req.length - 2, req.length);
    
    return query;
};

server.addListener("error", function (e) {
  throw e;
});

server.bind(port, host);
console.log("Started server on " + host + ":" + port);