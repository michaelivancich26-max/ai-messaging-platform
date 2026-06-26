// Slur list — blocks creation/sending but allows profanity
const SLUR_PATTERNS = [
  /\bn+i+g+(e+r+|a+)\b/i,
  /\bf+a+g+(o+t+)?\b/i,
  /\bc+h+i+n+k\b/i,
  /\bs+p+i+c+\b/i,
  /\bk+i+k+e\b/i,
  /\bt+r+a+n+n+y\b/i,
  /\br+e+t+a+r+d\b/i,
  /\bc+o+o+n\b/i,
  /\bw+e+t+b+a+c+k\b/i,
  /\bg+o+o+k\b/i,
  /\bs+a+n+d+n+i+g+g+e+r\b/i,
  /\bt+o+w+e+l+h+e+a+d\b/i,
  /\bd+y+k+e\b/i,
  /\bz+i+p+p+e+r+h+e+a+d\b/i,
  /\bc+r+a+c+k+e+r\b/i,
  /\bh+o+n+k+y\b/i,
  /\bw+o+p\b/i,
  /\bg+r+e+a+s+e+r\b/i,
  /\bt+o+w+e+l+h+e+a+d\b/i,
];

export function containsSlur(text: string): boolean {
  return SLUR_PATTERNS.some((p) => p.test(text));
}
