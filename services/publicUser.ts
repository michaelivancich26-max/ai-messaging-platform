// The only author fields that may leave the server attached to a message.
//
// Messages are loaded with `include: { user: true }` — the entire User row — and
// were then spread straight onto the wire, so every message broadcast to a room
// carried the author's bcrypt password hash and email address to every other
// client in it. That applied to bot authors too, whose rows are real User rows.
//
// Whitelist, never blacklist: a column added to User later must not silently
// start shipping to clients. The client reads only username and avatarUrl; id is
// used for identity comparisons and isPro drives the Pro badge.
export interface PublicAuthor {
  id: string;
  username: string;
  avatarUrl: string | null;
  isPro: boolean;
}

export function publicAuthor(u: any): PublicAuthor | null | undefined {
  if (!u) return u;
  return {
    id: u.id,
    username: u.username,
    avatarUrl: u.avatarUrl ?? null,
    isPro: !!u.isPro,
  };
}
