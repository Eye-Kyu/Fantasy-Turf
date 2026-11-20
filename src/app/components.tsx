import { errorMessage, noticeMessage } from "./messages";

/** The error / confirmation banner for the `?error=` and `?saved=` URL codes. */
export function Notices({ error, saved }: { error?: string; saved?: string }) {
  const errorText = errorMessage(error);
  const savedText = noticeMessage(saved);
  return (
    <>
      {errorText && <p className="notice error" role="alert">{errorText}</p>}
      {savedText && <p className="notice ok" role="status">{savedText}</p>}
    </>
  );
}
