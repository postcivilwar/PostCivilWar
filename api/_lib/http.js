'use strict';
// The small things every request needs: its body, its cookies, where it came from, and an answer.

class ApiError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || null;
  }
}

const MAX_BODY = 3.5 * 1024 * 1024;      // the host refuses anything over 4.5 MB before it reaches here

// The request's body as an object. The host may already have read it; a plain Node server has not.
async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return parse(req.body.toString('utf8'));
    if (typeof req.body === 'string') return parse(req.body);
    if (typeof req.body === 'object') return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ApiError(413, 'TOO_LARGE', 'That is too much to send at once.');
    chunks.push(chunk);
  }
  return parse(Buffer.concat(chunks).toString('utf8'));
}

function parse(text) {
  if (!text) return {};
  let value;
  try { value = JSON.parse(text); } catch (error) { throw new ApiError(400, 'BAD_REQUEST', 'The request could not be read.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'BAD_REQUEST', 'The request could not be read.');
  return value;
}

function cookiesOf(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    if (!(name in out)) { try { out[name] = decodeURIComponent(part.slice(at + 1).trim()); } catch (error) { /* not ours */ } }
  }
  return out;
}

// The address the request came from, as the host reports it. Used only to slow down guessing.
function addressOf(req) {
  const forwarded = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const direct = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : '';
  return (forwarded || direct || 'unknown').slice(0, 64);
}

const secure = (req) => String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || !!(req.socket && req.socket.encrypted);

// A request that changes anything must come from the game's own page: the page adds a header no other site's
// form can add, and a browser that says where the request came from must say it came from here.
function fromOwnPage(req) {
  if (req.headers['x-pcw'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  let host;
  try { host = new URL(origin).host; } catch (error) { return false; }
  const here = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return host === here;
}

function send(res, status, body, headers) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [name, value] of Object.entries(headers || {})) res.setHeader(name, value);
  res.end(text);
}

module.exports = { ApiError, readBody, cookiesOf, addressOf, secure, fromOwnPage, send };
