import { createPortal } from "react-dom";
import { ActionMenu } from "./action-menu";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRpc, useRealtime } from "@get-bb/plugin-sdk/app";
import type { rpcContract, Todo, Comment, Attachment } from "./server";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

export function LinkedText({text}: {text: string}) {
  return <span className="whitespace-pre-wrap break-words">{text.split(/(https?:\/\/[^\s<>]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline text-primary">{part}</a> : part)}</span>;
}
const field = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
export function TaskDetails({id}: {id: string}) {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<{todo: Todo; comments: Comment[]; attachments: Attachment[]} | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{name: string; url?: string; text?: string} | null>(null);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const refresh = useCallback(() => {
    rpc.call("todos_details", {id}).then(setData, report);
  }, [rpc, id]);
  useEffect(refresh, [refresh]);
  useRealtime("todos-changed", refresh);
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); refresh(); } catch(e) { report(e); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) throw new Error("Максимальный размер файла — 5 МБ");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });
    await rpc.call("attachments_add", {todoId: id, name: file.name, data});
  }
  async function download(file: Attachment) {
    const result = await rpc.call("attachments_get", {id: file.id});
    const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], {type: "application/octet-stream"}));
    const a = document.createElement("a"); a.href = url; a.download = result.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function select(files: File[]) {
    const valid = files.filter(file => file.size <= 5 * 1024 * 1024);
    if (valid.length !== files.length) setError("Максимальный размер файла — 5 МБ");
    if (valid.length) void run(async () => {for (const file of valid) await upload(file);});
  }
  useEffect(() => {
    const receive = (event: Event) => {if (!busy) select((event as CustomEvent<File[]>).detail);};
    window.addEventListener(`todo-files-${id}`,receive);
    return () => window.removeEventListener(`todo-files-${id}`,receive);
  }, [id,busy]);
  async function submit() {
    await run(async () => {
      if (comment.trim() && !data?.comments.length && !data?.todo.notes) { await rpc.call("comments_add", {todoId: id, text: comment}); setComment(""); }
    });
  }
  async function openPreview(file: Attachment) {
    await run(async () => {
      const result = await rpc.call("attachments_get", {id: file.id});
      const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime: Record<string,string> = {png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",pdf:"application/pdf"};
      if (mime[ext]) setPreview({name:file.name,url:URL.createObjectURL(new Blob([bytes],{type:mime[ext]}))});
      else if (["txt","md","csv","json","log","js","ts","css","html","xml","yaml","yml"].includes(ext)) setPreview({name:file.name,text:new TextDecoder().decode(bytes)});
      else setPreview({name:file.name,text:"Предпросмотр этого формата недоступен. Скачайте файл для открытия."});
    });
  }
  if (!data) return <p role="status">{error || "Загружаю…"}</p>;
  return <div className="space-y-5 text-sm" aria-label="Карточка задачи"
    onDragOver={e => e.preventDefault()} onDrop={e => {e.preventDefault(); if (!busy) select(Array.from(e.dataTransfer.files));}}>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {(data.comments.length > 0 || data.todo.notes) && <section className="space-y-4" aria-label="Заметки">
      {data.todo.notes && <div>{editing === "legacy" ? <div className="space-y-2"><textarea aria-label="Редактировать заметку" className={field} maxLength={4000} value={editText} onChange={e => setEditText(e.target.value)}/><Button disabled={busy || !editText.trim()} onClick={() => run(async () => {await rpc.call("todos_update",{id,notes:editText});setEditing(null);})}>Сохранить</Button><Button variant="ghost" onClick={() => setEditing(null)}>Отмена</Button></div> : <div className="flex items-start justify-between gap-2"><p><LinkedText text={data.todo.notes}/></p><ActionMenu><summary aria-label="Действия заметки" className="cursor-pointer list-none px-2">⋯</summary><div className="absolute right-0 z-10 rounded-md border bg-card p-1 shadow-md"><Button variant="ghost" onClick={() => {setEditing("legacy");setEditText(data.todo.notes);}}>Изменить</Button><Button variant="ghost" onClick={() => run(() => rpc.call("todos_update",{id,notes:""}))}>Удалить</Button></div></ActionMenu></div>}</div>}
      {data.comments.map(item => <div key={item.id}>
        <div className="flex items-center justify-end gap-2 mb-1">

          <ActionMenu><summary aria-label="Действия заметки" className="cursor-pointer list-none px-2 text-muted-foreground">⋯</summary>
            <div className="absolute right-0 z-10 rounded-md border bg-card shadow-md p-1 min-w-32">
              <Button variant="ghost" disabled={busy} onClick={() => {setEditing(item.id); setEditText(item.text);}}>Изменить</Button>
              <Button variant="ghost" disabled={busy} onClick={() => run(() => rpc.call("comments_remove", {id:item.id}))}>Удалить</Button>
            </div>
          </ActionMenu>
        </div>
        {editing === item.id ? <div className="space-y-2"><textarea aria-label="Редактировать комментарий" className={field} value={editText} maxLength={10000} onChange={e => setEditText(e.target.value)}/><Button disabled={busy || !editText.trim()} onClick={() => run(async () => {await rpc.call("comments_edit",{id:item.id,text:editText});setEditing(null);})}>Сохранить</Button><Button variant="ghost" onClick={() => setEditing(null)}>Отмена</Button></div> : <p className="leading-relaxed"><LinkedText text={item.text}/></p>}
      </div>)}
    </section>}
    {data.attachments.length > 0 && <section aria-label="Файлы" className="space-y-3">
      <h3 className="font-medium">Файлы</h3>
      {data.attachments.map(file => <div key={file.id} className="flex items-center gap-3">
        <span className="rounded-lg bg-primary/10 text-primary p-2"><Icon name="File" className="size-5"/></span>
        <button className="min-w-0 flex-1 text-left" disabled={busy} onClick={() => openPreview(file)}><span className="block truncate font-medium">{file.name}</span><span className="text-xs text-muted-foreground">{file.name.split(".").pop()?.toUpperCase()} · {Math.max(1,Math.ceil(file.size/1024))} КБ</span></button>
        <Button variant="ghost" size="icon" aria-label={`Скачать ${file.name}`} disabled={busy} onClick={() => run(() => download(file))}><Icon name="Download" className="size-4"/></Button>
        <ActionMenu><summary aria-label="Действия файла" className="list-none cursor-pointer px-2 text-muted-foreground">⋯</summary><div className="absolute right-0 z-10 rounded-md border bg-card shadow-md p-1"><Button variant="ghost" disabled={busy} onClick={() => run(() => rpc.call("attachments_remove",{id:file.id}))}>Удалить</Button></div></ActionMenu>
      </div>)}
    </section>}
    <div className={!data.comments.length && !data.todo.notes ? "rounded-lg border border-input bg-background p-2 focus-within:ring-1 focus-within:ring-ring" : ""}>
      {!data.comments.length && !data.todo.notes && <textarea aria-label="Новый комментарий" className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none" rows={2} maxLength={10000} placeholder="Добавьте текст или ссылку…" disabled={busy} value={comment} onChange={e => setComment(e.target.value)}/>}

      <div className={`flex items-center justify-between gap-2 ${!data.comments.length && !data.todo.notes ? "border-t border-border pt-2" : ""}`}>
        <Button variant="ghost" size="icon" aria-label="Прикрепить файл" disabled={busy} onClick={() => picker.current?.click()}><Icon name="Paperclip" className="size-4"/></Button>
        {!data.comments.length && !data.todo.notes && <Button disabled={busy || !comment.trim()} onClick={submit}>{busy ? "Добавляю…" : "Добавить"}</Button>}
      </div>
      <input ref={picker} aria-label="Выбрать файлы" type="file" multiple hidden disabled={busy} onChange={e => {select(Array.from(e.target.files ?? [])); e.target.value="";}}/>
    </div>
    <p style={{fontSize:11,color:"#9ca3af"}}>Можно перетащить файлы в карточку</p>
    {preview && document.querySelector("[data-todo-preview-root]") && createPortal(<div role="dialog" aria-label="Предпросмотр файла" className="pointer-events-auto absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-background" onKeyDown={e => {if(e.key === "Escape") setPreview(null);}}>
      <div className="relative z-10 flex shrink-0 justify-between items-center gap-3 border-b border-border bg-background px-6 py-4"><span className="truncate font-medium">{preview.name}</span><Button autoFocus variant="ghost" onClick={() => setPreview(null)}>Закрыть</Button></div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-6">{preview.url ? (/\.pdf$/i.test(preview.name) ? <iframe title={preview.name} src={preview.url} className="w-full min-h-0 flex-1 border-0"/> : <img src={preview.url} alt={preview.name} className="min-h-0 flex-1 object-contain"/>) : <pre className="overflow-auto whitespace-pre-wrap text-sm">{preview.text}</pre>}</div>
    </div>, document.querySelector("[data-todo-preview-root]")!)}
  </div>;
}
