import { randomUUID } from "node:crypto"

/** Largest request body we will read, in bytes. Prompts are text; anything larger is a mistake. */
const MAX_BODY_BYTES = 1_000_000

export async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const err = new Error("Request body too large")
      err.statusCode = 413
      throw err
    }
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    const err = new Error("Invalid JSON body")
    err.statusCode = 400
    throw err
  }
}

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  })
  res.end(payload)
}

/**
 * An error in the shape OpenAI clients expect, so a caller written against the
 * OpenAI API can read our failures without special-casing this service.
 */
export function sendError(res, status, message, code = null) {
  sendJson(res, status, { error: { message, type: "bridge_error", code } })
}

/** Opens a Server-Sent Events response and returns helpers for writing to it. */
export function openStream(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  let closed = false
  return {
    send(obj) {
      if (closed) return
      res.write(`data: ${JSON.stringify(obj)}\n\n`)
    },
    done() {
      if (closed) return
      res.write("data: [DONE]\n\n")
      closed = true
      res.end()
    },
    get closed() {
      return closed
    },
    markClosed() {
      closed = true
    },
  }
}

/** The id every chunk of one response shares, in OpenAI's format. */
export function completionId() {
  return `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`
}

/** One streamed chunk of an OpenAI chat completion. */
export function chunk(id, model, delta, finishReason = null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
}

/** A complete, non-streamed OpenAI chat completion. */
export function completion(id, model, content, usage, finishReason = "stop") {
  return {
    id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finishReason }],
    usage: usage ?? undefined,
  }
}
