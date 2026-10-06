/*
 * Self-contained fiddle links: the schema, query and mode travel in the URL fragment
 * (#f=v1.<base64url(deflate-raw(JSON))>), so a shared link opens without the backend or
 * the fiddle database. The fragment never reaches the server.
 *
 * Loaded as a classic script in the browser (global FiddleLink) and via require() in
 * the Node unit tests.
 */
(function (root) {
  'use strict';

  const NAMESPACE = 'f=';
  const PREFIX = 'f=v1.';
  const MODES = ['BATCH', 'STREAMING'];
  // Matches the backend's SaveFiddleRequest limits.
  const MAX_FIELD_CHARS = 50000;
  // Inflated JSON can't legitimately exceed two fields at 6 bytes per char (\uXXXX escapes)
  // plus the keys; stop decompressing past that so a tiny link can't inflate to gigabytes.
  const MAX_INFLATED_BYTES = 2 * MAX_FIELD_CHARS * 6 + 1024;

  function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function transform(bytes, stream) {
    const piped = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(piped).arrayBuffer());
  }

  /** Inflates deflate-raw bytes, or returns null once the output passes maxBytes. */
  async function inflateCapped(bytes, maxBytes) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }

  function validate(fiddle) {
    if (!fiddle || typeof fiddle !== 'object') return null;
    const { schema, query, mode } = fiddle;
    if (typeof schema !== 'string' || typeof query !== 'string') return null;
    if (schema.length > MAX_FIELD_CHARS || query.length > MAX_FIELD_CHARS) return null;
    if (!MODES.includes(mode)) return null;
    return { schema, query, mode };
  }

  /** Encodes a fiddle as a URL fragment body, without the leading '#'. */
  async function encode(fiddle) {
    const valid = validate(fiddle);
    if (!valid) throw new Error('Fiddle must have string schema and query and mode BATCH or STREAMING');
    const json = new TextEncoder().encode(JSON.stringify({ s: valid.schema, q: valid.query, m: valid.mode }));
    return PREFIX + toBase64Url(await transform(json, new CompressionStream('deflate-raw')));
  }

  /** True for any fiddle-link fragment (#f=...), including versions this build can't read. */
  function isFiddleFragment(hash) {
    return String(hash || '').replace(/^#/, '').startsWith(NAMESPACE);
  }

  /**
   * Decodes a location.hash value (with or without '#'). Returns the fiddle, or null when
   * the fragment is not a v1 fiddle link or is malformed, oversized or damaged.
   */
  async function decode(hash) {
    const body = String(hash || '').replace(/^#/, '');
    if (!body.startsWith(PREFIX) || body.length === PREFIX.length) return null;
    try {
      const inflated = await inflateCapped(fromBase64Url(body.slice(PREFIX.length)), MAX_INFLATED_BYTES);
      if (!inflated) return null;
      const data = JSON.parse(new TextDecoder().decode(inflated));
      return validate({ schema: data.s, query: data.q, mode: data.m });
    } catch (e) {
      // Untrusted link: any decoding failure (bad base64, corrupt deflate, bad JSON) means "not a fiddle".
      return null;
    }
  }

  const FiddleLink = { encode, decode, isFiddleFragment, PREFIX };
  if (typeof module !== 'undefined' && module.exports) module.exports = FiddleLink;
  else root.FiddleLink = FiddleLink;
})(typeof globalThis !== 'undefined' ? globalThis : this);
