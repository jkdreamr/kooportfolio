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
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)
    )
      return null;
    clean[key] = text;
  }
  return clean as WritingDraft;
}
