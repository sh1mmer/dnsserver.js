// Copyright (c) 2010 Tom Hughes-Croucher
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//

var sys = require('sys'),
    Buffer = require('buffer').Buffer,
    dgram = require('dgram');

host = 'localhost';
port = 9999;

// slices a single byte into bits
// assuming only single bytes
var sliceBits = function(b, off, len) {
    var s = 7 - (off + len - 1);

    b = b >>> s;
    return b & ~(0xff << len);
};

var server = dgram.createSocket('udp4');

server.on('message', function (msg, rinfo) {

    //split up the message into the dns request header info and the query
    var q = processRequest(msg);

    buf = createResponse(q);
    server.send(buf, 0, buf.length, rinfo.port, rinfo.address, function (err, sent) {

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

    /*
    * Step 1: find record associated with query
    */
    var results = findRecords(query.question.qname, 1);

    /*
    * Step 2: construct response object
    */

    var response = {};
    response.header = {};

    //1 byte
    response.header.id = query.header.id; //same as query id

    //combined 1 byte
    response.header.qr = 1; //this is a response
    response.header.opcode = 0; //standard for now TODO: add other types 4-bit!
    response.header.aa = 0; //authority... TODO this should be modal
    response.header.tc = 0; //truncation
    response.header.rd = 1; //recursion asked for

    //combined 1 byte
    response.header.ra = 0; //no rescursion here TODO
    response.header.z = 0; // spec says this MUST always be 0. 3bit
    response.header.rcode = 0; //TODO add error codes 4 bit.

    //1 byte
    response.header.qdcount = 1; //1 question
    //1 byte
    response.header.ancount = results.length; //number of rrs returned from query
    //1 byte
    response.header.nscount = 0;
    //1 byte
    response.header.arcount = 0;

    response.question = {};
    response.question.qname = query.question.qname;
    response.question.qtype = query.question.qtype;
    response.question.qclass = query.question.qclass;

    response.rr = results;

    /*
    * Step 3 render response into output buffer
    */
    var buf = buildResponseBuffer(response);

    /*
    * Step 4 return buffer
    */
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
            qname[offset] = tokens[i].charCodeAt(j);
            offset++;
        }
    }
    qname[offset] = 0;

    return qname;
};

var getZeroBuf = function(len) {
    buf = new Buffer(len);
    for(var i=0;i<buf.length;i++) { buf[i]=0;}
    return buf;
};

var buildResponseBuffer = function(response) {
    //calculate len in octets
    //NB not calculating rr this is done later
    //headers(12) + qname(qname + 2 + 2)
    //e.g. 16 + 2 * qname;
    //qnames are Buffers so length is already in octs
    var qnameLen = response.question.qname.length;
    var len = 16 + qnameLen;
    var buf = getZeroBuf(len);

    response.header.id.copy(buf, 0, 0, 2);

    buf[2] = 0x00 | response.header.qr << 7 | response.header.opcode << 3 | response.header.aa << 2 | response.header.tc << 1 | response.header.rd;


    buf[3] = 0x00 | response.header.ra << 7 | response.header.z << 4 | response.header.rcode;

    numToBuffer(buf, 4, response.header.qdcount, 2);

    numToBuffer(buf, 6, response.header.ancount, 2);
    numToBuffer(buf, 8, response.header.nscount, 2);
    numToBuffer(buf, 10, response.header.arcount, 2);

    //end header

    response.question.qname.copy(buf, 12, 0, qnameLen);
    response.question.qtype.copy(buf, 12+qnameLen, 0, 2);
    response.question.qclass.copy(buf, 12+qnameLen+2, 0, 2);

    var rrStart = 12+qnameLen+4;

    for (var i=0;i<response.rr.length;i++) {
        //TODO figure out if this is actually cheaper than just iterating
        //over the rr section up front and counting before creating buf
        //
        //create a new buffer to hold the request plus the rr
        //len of each response is 14 bytes of stuff + qname len
        var tmpBuf = getZeroBuf(buf.length + response.rr[i].qname.length + 14);

        buf.copy(tmpBuf, 0, 0, buf.length);

        response.rr[i].qname.copy(tmpBuf, rrStart, 0, response.rr[i].qname.length);
        numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length, response.rr[i].qtype, 2);
        numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+2, response.rr[i].qclass, 2);

        numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+4, response.rr[i].ttl, 4);
        numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+8, response.rr[i].rdlength, 2);
        numToBuffer(tmpBuf, rrStart+response.rr[i].qname.length+10, response.rr[i].rdata, response.rr[i].rdlength); // rdlength indicates rdata length

        rrStart = rrStart + response.rr[i].qname.length + 14;

        buf = tmpBuf;
    }

    //TODO compression

    return buf;
};

//take a number and make sure it's written to the buffer as
//the correct length of bytes with leading 0 padding where necessary
// takes buffer, offset, number, length in bytes to insert
var numToBuffer = function(buf, offset, num, len, debug) {
    if (typeof num != 'number') {
        throw new Error('Num must be a number');
    }

    for (var i=offset;i<offset+len;i++) {

            var shift = 8*((len - 1) - (i - offset));

            var insert = (num >> shift) & 255;

            buf[i] = insert;
    }

    return buf;
};

var findRecords = function(qname, qtype, qclass) {

    //assuming we are always going to get internet
    //request but adding basic qclass support
    //for completeness
    //TODO replace throws with error responses
    if (qclass === undefined || qclass === 1) {
        qclass = 'in';
    } else {
        throw new Error('Only internet class records supported');
    }

    switch(qtype) {
        case 1:
            qtype = 'a'; //a host address
            break;
        case 2:
            qtype = 'ns'; //an authoritative name server
            break;
        case 3:
            qtype = 'md'; //a mail destination (Obsolete - use MX)
            break;
        case 4:
            qtype = 'mf'; //a mail forwarder (Obsolete - use MX)
            break;
        case 5:
            qtype = 'cname'; //the canonical name for an alias
            break;
        case 6:
            qtype = 'soa'; //marks the start of a zone of authority
            break;
        case 7:
            qtype = 'mb'; //a mailbox domain name (EXPERIMENTAL)
            break;
        case 8:
            qtype = 'mg'; //a mail group member (EXPERIMENTAL)
            break;
        case 9:
            qtype = 'mr'; //a mail rename domain name (EXPERIMENTAL)
            break;
        case 10:
            qtype = 'null'; //a null RR (EXPERIMENTAL)
            break;
        case 11:
            qtype = 'wks'; //a well known service description
            break;
        case 12:
            qtype = 'ptr'; //a domain name pointer
            break;
        case 13:
            qtype = 'hinfo'; //host information
            break;
        case 14:
            qtype = 'minfo'; //mailbox or mail list information
            break;
        case 15:
            qtype = 'mx'; //mail exchange
            break;
        case 16:
            qtype = 'txt'; //text strings
            break;
        case 255:
            qtype = '*'; //select all types
            break;
        default:
            throw new Error('No valid type specified');
            break;
    }

    var domain = qnameToDomain(qname);

    //TODO add support for wildcard
    if (qtype === '*') {
        throw new Error('Wildcard not supported');
    } else {
        var rr = records[domain][qclass][qtype];
    }



    return rr;
};

var qnameToDomain = function(qname) {

    var domain= '';
    for(var i=0;i<qname.length;i++) {
        if (qname[i] == 0) {
            //last char chop trailing .
            domain = domain.substring(0, domain.length - 1);
            break;
        }

        var tmpBuf = qname.slice(i+1, i+qname[i]+1);
        domain += tmpBuf.toString('binary', 0, tmpBuf.length);
        domain += '.';

        i = i + qname[i];
    }

    return domain;
};

server.addListener('error', function (e) {
  throw e;
});


//
//TODO create records database

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

server.bind(port, host);
console.log('Started server on ' + host + ':' + port);
