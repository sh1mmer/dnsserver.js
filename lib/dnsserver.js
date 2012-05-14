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

var util = require('util'),
    Buffer = require('buffer').Buffer,
    dgram = require('dgram');


function Server() {
  dgram.Socket.call(this, 'udp4');

  var self = this;
  this.on('message', function(msg, rinfo) {
    try {
      //split up the message into the dns request header info and the query
      var request = processRequest(msg);
      var response = new Response(self, rinfo, request);
      this.emit('request', request, response);
    } catch (err) {
    }
  });
}

exports.Server = Server;
util.inherits(exports.Server, dgram.Socket);
exports.createServer = function() {
  return new Server();
}

// slices a single byte into bits
// assuming only single bytes
function sliceBits(b, off, len) {
  var s = 7 - (off + len - 1);

  b = b >>> s;
  return b & ~(0xff << len);
}

//takes a buffer as a request
var processRequest = exports.processRequest = function(req) {
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
  query.header.qdcount = req.readUInt16BE(4);
  //answer count
  // 2 bytes
  query.header.ancount = req.readUInt16BE(6);
  //ns count
  // 2 bytes
  query.header.nscount = req.readUInt16BE(8);
  //addition resources count
  // 2 bytes
  query.header.arcount = req.readUInt16BE(10);

  // read only the first question
  if (query.header.qdcount > 0) {
    query.question = readName(req, 12);
  }

  return query;
}

function Response(socket, rinfo, query) {
  this.socket = socket;
  this.rinfo = rinfo;
  this.header = {};

  //1 byte
  this.header.id = query.header.id; //same as query id

  //combined 1 byte
  this.header.qr = 1; //this is a response
  this.header.opcode = 0; //standard for now TODO: add other types 4-bit!
  this.header.aa = 0; //authority... TODO this should be modal
  this.header.tc = 0; //truncation
  this.header.rd = 1; //recursion asked for

  //combined 1 byte
  this.header.ra = 0; //no rescursion here TODO
  this.header.z = 0; // spec says this MUST always be 0. 3bit
  this.header.rcode = 0; //TODO add error codes 4 bit.

  //1 byte
  this.header.qdcount = 1; //1 question
  //1 byte
  this.header.ancount = 0; //number of rrs returned from query
  //1 byte
  this.header.nscount = 0;
  //1 byte
  this.header.arcount = 0;

  this.question = {};
  this.question.qname = query.question.qname;
  this.question.qtype = query.question.qtype;
  this.question.qclass = query.question.qclass;

  this.rr = [];
}

Response.prototype.addRR = function(domain, qtype, qclass, ttl, rdata, authoritative) {
  var r = {}, address;
  r.qname = createName(domain);
  r.qtype = qtype;
  r.qclass = qclass;
  r.ttl = ttl;

  if (address = inet_aton(rdata)) {
    r.rdlength = 4;
    r.rdata = address;
  } else {
    r.rdlength = rdata.length;
    r.rdata = rdata;
  }

  this.rr.push(r);

  if (authoritative) {
    this.header.aa = 1;
    this.header.nscount++;
  } else {
    this.header.ancount++;
  }
}

Response.prototype.send = function(callback) {
  var buffer = this.toBuffer();
  this.socket.send(buffer, 0, buffer.length, this.rinfo.port, this.rinfo.address, callback || function() {});
}

Response.prototype.toBuffer = function() {
  //calculate len in octets
  //NB not calculating rr this is done later
  //headers(12) + qname(qname + 2 + 2)
  //e.g. 16 + 2 * qname;
  //qnames are Buffers so length is already in octs
  var qnameLen = this.question.qname.length;
  var len = 16 + qnameLen;
  var buf = getZeroBuf(len);

  this.header.id.copy(buf, 0, 0, 2);

  buf[2] = 0x00 | this.header.qr << 7 | this.header.opcode << 3 | this.header.aa << 2 | this.header.tc << 1 | this.header.rd;


  buf[3] = 0x00 | this.header.ra << 7 | this.header.z << 4 | this.header.rcode;

  accumulate(buf, 4, this.header.qdcount, 2);

  accumulate(buf, 6, this.header.ancount, 2);
  accumulate(buf, 8, this.header.nscount, 2);
  accumulate(buf, 10, this.header.arcount, 2);

  //end header

  this.question.qname.copy(buf, 12, 0, qnameLen);
  this.question.qtype.copy(buf, 12+qnameLen, 0, 2);
  this.question.qclass.copy(buf, 12+qnameLen+2, 0, 2);

  var rrStart = 12+qnameLen+4;

  for (var i = 0; i < this.rr.length; i++) {
    //TODO figure out if this is actually cheaper than just iterating
    //over the rr section up front and counting before creating buf
    //
    //create a new buffer to hold the request plus the rr
    //len of each response is 14 bytes of stuff + qname len
    var size = 10 + this.rr[i].rdlength;
    var tmpBuf = getZeroBuf(buf.length + this.rr[i].qname.length + size);

    buf.copy(tmpBuf, 0, 0, buf.length);

    this.rr[i].qname.copy(tmpBuf, rrStart, 0, this.rr[i].qname.length);
    accumulate(tmpBuf, rrStart+this.rr[i].qname.length, this.rr[i].qtype, 2);
    accumulate(tmpBuf, rrStart+this.rr[i].qname.length+2, this.rr[i].qclass, 2);

    accumulate(tmpBuf, rrStart+this.rr[i].qname.length+4, this.rr[i].ttl, 4);
    accumulate(tmpBuf, rrStart+this.rr[i].qname.length+8, this.rr[i].rdlength, 2);
    accumulate(tmpBuf, rrStart+this.rr[i].qname.length+10, this.rr[i].rdata, this.rr[i].rdlength); // rdlength indicates rdata length

    rrStart = rrStart + this.rr[i].qname.length + size;

    buf = tmpBuf;
  }

  //TODO compression

  return buf;
}

function inet_aton(address) {
  var parts = address.toString().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return parts ? parts[1] * 16777216 + parts[2] * 65536 + parts[3] * 256 + parts[4] * 1 : false;
}

function getZeroBuf(len) {
  var buffer = new Buffer(len);
  buffer.fill(0);
  return buffer;
}

function pack(buf, offset, value, len) {
  for (var i = offset; i < offset + len; i++) {
    var shift = 8*((len - 1) - (i - offset));
    var insert = (value >> shift) & 255;
    buf[i] = insert;
  }

  return buf;
}

//take a value and make sure it's written to the buffer as
//the correct length of bytes with 0 padding where necessary
// takes buffer, offset, number, length in bytes to insert
function accumulate(buf, offset, value, len) {
  if (value instanceof Buffer) {
    value.copy(buf, offset, 0, len);
    return buf;

  } else if (typeof value == 'number') {
    return pack(buf, offset, value, len);

  } else {
    throw new Error('value must be a buffer or number');
  }
}

function readName(buffer, start) {
  var offset = start, question = {}, labels = [], length;

  do {
    length = buffer.readUInt8(offset);
    offset += 1;
    if (length == 0) break;

    labels.push(buffer.slice(offset, offset + length).toString());
    offset += length;

  } while (offset < buffer.length);

  question.qname = buffer.slice(start, offset);
  question.qtype = buffer.slice(offset, offset + 2);
  question.qclass = buffer.slice(offset + 2, offset + 4);

  question.name = labels.join(".");
  question.type = question.qtype.readUInt16BE(0);
  question.class = question.qclass.readUInt16BE(0);

  return question;
}

var createName = exports.createName = function(name) {
  var labels = name.split("."), length = labels.length;
  var buffer = new Buffer(name.length + 2), offset = 0;
  buffer.fill(0);

  for (var i = 0; i < length; i++) {
    var label = labels[i];
    buffer.writeInt8(label.length, offset);
    offset += 1;
    buffer.write(label, offset);
    offset += label.length;
  }

  return buffer;
}

exports.createSOA = function(mname, rname, serial, refresh, retry, expire, minimum, length) {
  var buffer, offset;
  buffer = new Buffer(mname.length * 2 + 1 + rname.length * 2 + 1 + 5 * 4);
  buffer.fill(0);
  offset = 0;

  function writeName(name) {
    var nameBuffer = createName(name);
    nameBuffer.copy(buffer, offset);
    offset += nameBuffer.length;
  }

  function writeInt(int) {
    buffer.writeUInt32BE(int, offset);
    offset += 4;
  }

  writeName(mname);
  writeName(rname);
  writeInt(serial);
  writeInt(refresh);
  writeInt(retry);
  writeInt(expire);
  writeInt(minimum);

  return buffer.slice(0, offset);
}
