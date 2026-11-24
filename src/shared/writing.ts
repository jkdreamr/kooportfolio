export const WRITING_LIMITS = { title: 80, author: 32, body: 6000 } as const;
export type WritingPost = {
  id: string;
  title: string;
  author: string;
  body: string;
  createdAt: number;
};
export type WritingDraft = Pick<WritingPost, "title" | "author" | "body">;
export function validateWriting(value: unknown): WritingDraft | null {
  if (!value || typeof value !== "object") return null;
  const post = value as Record<string, unknown>;
  const clean: Record<string, string> = {};
  for (const key of ["title", "author", "body"] as const) {
    if (typeof post[key] !== "string") return null;
    const text = post[key].trim().replace(/\r\n?/g, "\n");
    if (
      !text ||
      text.length > WRITING_LIMITS[key] ||
      Array.from(text).some((char) => {
        const code = char.charCodeAt(0);
        return (code < 32 && code !== 9 && code !== 10) || code === 127;
      })
    )
      return null;
    clean[key] = text;
  }
  return clean as WritingDraft;
}
