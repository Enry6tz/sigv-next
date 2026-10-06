export type Notice = { text: string; ok: boolean } | null;

export function ActionNotice({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p role={notice.ok ? "status" : "alert"} className={notice.ok ? "success-box" : "error-box"}>{notice.text}</p>;
}
