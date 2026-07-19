// Pasted images are stored verbatim as a base64 data URL — the message content
// begins with {"type":"image"...} and can run to ~8MB. To a text judge that is
// pure non-signal, and because some transcripts are re-sent on every new message
// (scoreMatch rebuilds the whole transcript each turn), a single pasted image
// otherwise inflates every subsequent model call for the rest of the match.
//
// Replace such bodies with a short placeholder before assembling any LLM
// transcript. Non-image content is already length-bounded at write time, so
// nothing else needs truncating here.
export function transcriptText(content: string | null | undefined): string {
  if (!content) return "";
  return content.startsWith('{"type":"image"') ? "[image]" : content;
}
