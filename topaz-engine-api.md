# Topaz Engine API v1

The API creates a fast-start MP4/MOV plan without receiving the video/audio payload. The browser client reads the top-level atoms other than `mdat`, sends those header bytes to the app server, and assembles the returned plan against the original local file.

This is a prototype endpoint with no API-key authentication, durable usage accounting, or rate limiting. Keep it on localhost or behind your own authentication and rate limits before exposing it publicly. MP4 headers can contain camera/editor metadata such as device or location information.

## Endpoint

`POST /api/topaz/patch`

```json
{
  "requestId": "a-unique-request-id",
  "layout": {
    "fileSize": 1234567,
    "boxes": [
      { "type": "ftyp", "start": 0, "size": 32, "header": 8 },
      { "type": "mdat", "start": 32, "size": 1200000, "header": 8 },
      { "type": "moov", "start": 1200032, "size": 123503, "header": 8 }
    ]
  },
  "header": "BASE64_OF_EVERY_TOP_LEVEL_ATOM_EXCEPT_MDAT"
}
```

The exact layout depends on the source file. The header has a 16 MB decoded limit. Supported files must start with `ftyp` and contain exactly one `moov` and one `mdat`. Fragmented MP4 and unsupported offset tables are rejected.

Successful responses contain `engine: "topaz-faststart-v1"`, a `changed` flag, the output `size`, and `parts`. A part is either `{ "src": [start, end] }`, referencing a byte range in the caller's original file, or `{ "b": "BASE64_BYTES" }`, containing patched header bytes. The client library validates ranges and total output size before assembling a Blob.

## Browser client library

Import the standalone, dependency-free client from `/topaz-engine-client.mjs`:

```js
import { optimize, prepare, assemble } from "/topaz-engine-client.mjs";

const { blob, engine, changed } = await optimize(file);
const downloadUrl = URL.createObjectURL(blob);
```

For a custom server endpoint, pass `apiUrl` and optionally a stable `requestId`:

```js
const result = await optimize(file, {
  apiUrl: "https://your-site.example/api/topaz/patch",
  requestId: crypto.randomUUID(),
});
```

The library also exposes `prepare(file)` and `assemble(file, plan)` for applications that want to manage the request themselves. It does not resize, sharpen, re-encode, or generate frames; use the separate FFmpeg enhancement route for those operations.

## Response and errors

- `200`: plan created; `changed` is false when the source already has fast-start layout.
- `400`: missing or invalid request ID.
- `422`: unsupported or malformed file layout, malformed header, oversized header, or unsafe offset table.

The API is deterministic and does not spend credits. This prototype does not implement Haze-style paid run packs or per-client API keys.
