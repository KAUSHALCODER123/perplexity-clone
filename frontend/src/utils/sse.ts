export interface SSEEvent {
  event: string;
  data: string;
}

/**
 * Incremental SSE frame parser.
 *
 * A network chunk has no relationship to SSE frame boundaries: one read can
 * carry six frames, or half of one. Feed every chunk through here and it will
 * hold the incomplete tail until the rest arrives.
 */
export class SSEParser {
  private buffer = '';

  push(chunk: string): SSEEvent[] {
    this.buffer += chunk;
    const events: SSEEvent[] = [];

    // Frames are separated by a blank line. Normalise CRLF first.
    const normalised = this.buffer.replace(/\r\n/g, '\n');
    const frames = normalised.split('\n\n');

    // The final segment is whatever came after the last blank line — it may be
    // a partial frame, so it goes back in the buffer rather than out the door.
    this.buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) events.push(parsed);
    }

    return events;
  }

  /** Flush a trailing frame that arrived without its terminating blank line. */
  flush(): SSEEvent[] {
    const remainder = this.buffer;
    this.buffer = '';
    const parsed = parseFrame(remainder.replace(/\r\n/g, '\n'));
    return parsed ? [parsed] : [];
  }
}

function parseFrame(frame: string): SSEEvent | null {
  if (!frame.trim()) return null;

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Per spec a single leading space after the colon is stripped.
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (!dataLines.length) return null;
  return { event, data: dataLines.join('\n') };
}
