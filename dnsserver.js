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

var server = dgram.createSocket(function (msg, rinfo) {
    
    //split up the message into the dns request header info and the query
    var q = processRequest(msg);

    buf = createResponse(q);
    server.send(rinfo.port, rinfo.address, buf, 0, buf.length, function (err, sent) {
        
    });
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
    query.header.id = req.slice(0,2);

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
    // rfc says always 0
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

var createResponse = function(query) {
    var response = {};
    response.header = {};

    //1 byte
    response.header.id = query.header.id;//same as query id

    //combined 1 byte
    response.header.qr = 1; //this is a response
    response.header.opcode = 0; //standard for now TODO: add other types 4-bit!
    response.header.aa = 0; //authority... TODO this should be modal
    response.header.tc = 0; //truncation
    response.header.rd = 1; //recursion asked for

    //combined 1 byte
    response.header.ra = 1; //no rescursion here TODO
    response.header.z = 0; // spec says this MUST always be 0. 3bit
    response.header.rcode = 0; //TODO add error codes 4 bit.

    //1 byte
    response.header.qdcount = 1; //1 question
    //1 byte
    response.header.ancount = 1; //1 answer TODO support multiple Qs/As
    //1 byte
    response.header.nscount = 0;
    //1 byte
    response.header.arcount = 0; 
    
    response.question = {};
    response.question.qname = query.question.qname;
    response.question.qtype = query.question.qtype;
    response.question.qclass = query.question.qclass;

    response.rr = {}; // TODO should be an array or something 
    response.rr.qname = query.question.qname;
    response.rr.qtype = query.question.qtype;
    response.rr.qclass = query.question.qclass;
    response.rr.ttl = 1;
    response.rr.rdlength = 4; //assuming a record ip addy
    response.rr.rdata = 0x7F000001 // 127.0.0.1 TODO encoding method
    
    //TODO compression
    
    //TODO output to Buffer
    var buf = buildResponseBuffer(response);
    
    return buf;
};

var domainToQname = function(domain) {
    var tokens = domain.split(".");
    len = domain.length + 2;
    var qname = new Buffer(len);
    var offset = 0;
    for(var i=0; i<tokens.length;i++) {
        qname[offset]=tokens[i].length;
        offset++;
        for(var j=0;j<tokens[i].length;j++) {
            qname[offset] = tokens[i].toCharCode(j);
            offset++;
        }
    }
    qname[offset] = 0;
    
    return qname;
};

var buildResponseBuffer = function(response) {
    //what is len in octets?
    //headers(12) + qname(qname + 2 + 2) + rr(qname + 2 + 2 + 4 + 2 + 4)
    //e.g. 30 + 2 * qname;
    //qnames are Buffers so length is already in octs
    var qnameLen = response.question.qname.length;
    var len = 30 + (2 * qnameLen);
    var buf = new Buffer(len);
    for(var i=0;i<buf.length;i++) { buf[i]=0;} //zero buffer
    
    response.header.id.copy(buf, 0, 0, 2);
    
    buf[2] = 0x00 | response.header.qr << 7 | response.header.opcode << 3 | response.header.aa << 2 | response.header.tc << 1 | response.header.rd;
    

    buf[3] = 0x00 | response.header.ra << 7 | response.header.z << 4 | response.header.rcode;

    numToBuffer(buf, 4, response.header.qdcount, 2);

    numToBuffer(buf, 6, response.header.ancount, 2);
    numToBuffer(buf, 8, response.header.nscount, 2);
    numToBuffer(buf, 10, response.header.arcount, 2);

    //end header

    response.question.qname.copy(buf, 12, 0, qnameLen);
    response.question.qtype.copy(buf, 12+qnameLen, response.question.qtype, 2);
    response.question.qclass.copy(buf, 12+qnameLen+2, response.question.qclass, 2);

    var rrStart = 12+qnameLen+4;

    response.rr.qname.copy(buf, rrStart, 0, qnameLen);
    response.rr.qtype.copy(buf, rrStart+qnameLen, response.rr.qtype, 2);
    response.rr.qclass.copy(buf, rrStart+qnameLen+2, response.rr.qclass, 2);
    numToBuffer(buf, rrStart+qnameLen+4, response.rr.ttl, 4);
    numToBuffer(buf, rrStart+qnameLen+8, response.rr.rdlength, 2);
    numToBuffer(buf, rrStart+qnameLen+10, response.rr.rdata, response.rr.rdlength); // rdlength indicates rdata length
   
    return buf;
};

//take a number and make sure it's written to the buffer as 
//the correct length of bytes with leading 0 padding where necessary
// takes buffer, offset, number, length in bytes to insert
var numToBuffer = function(buf, offset, num, len) {
    if (typeof num != "number") {
        throw "Num must be a number";
    }
    for (var i=offset;i<offset+len;i++) {
            var shift = 8*((len - 1) - i - offset);
            
            var insert = (num >> shift) & 255;
            
            buf[i] = insert;
    }
    
    return buf;
}


server.addListener("error", function (e) {
  throw e;
});

server.bind(port, host);
console.log("Started server on " + host + ":" + port);