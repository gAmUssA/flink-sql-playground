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

  const PREFIX = 'f=v1.';
  const MODES = ['BATCH', 'STREAMING'];
  // Matches the backend's SaveFiddleRequest limits.
  const MAX_FIELD_CHARS = 50000;

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

  /**
   * Decodes a location.hash value (with or without '#'). Returns the fiddle, or null when
   * the fragment is not a fiddle link or is malformed.
   */
  async function decode(hash) {
    const body = String(hash || '').replace(/^#/, '');
    if (!body.startsWith(PREFIX)) return null;
    try {
      const inflated = await transform(fromBase64Url(body.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
      const data = JSON.parse(new TextDecoder().decode(inflated));
      return validate({ schema: data.s, query: data.q, mode: data.m });
    } catch (e) {
      return null;
    }
  }

  const FiddleLink = { encode, decode, PREFIX };
  if (typeof module !== 'undefined' && module.exports) module.exports = FiddleLink;
  else root.FiddleLink = FiddleLink;
})(typeof globalThis !== 'undefined' ? globalThis : this);
