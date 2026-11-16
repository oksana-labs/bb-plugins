import { ActionMenu } from "./action-menu";
// bb-plugin-todo — the Todo page in the BB sidebar.
//
// Lists open tasks grouped by project and sorted by priority, with a project
// filter, a quick-add form, and a collapsed "done" section. Agents add tasks
// through the todo_add tool or `bb todo add`; the "todos-changed" realtime
// signal keeps this page current.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { Priority, rpcContract, Todo } from "./server";
import { TaskDetails } from "./details";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRIORITY_ORDER: Priority[] = ["high", "normal", "low"];
const PRIORITY_LABEL: Record<Priority, string> = {
  high: "Важно",
  normal: "Обычно",
  low: "Потом",
};
const PRIORITY_DOT: Record<Priority, string> = {
  high: "bg-destructive",
  normal: "bg-foreground/50",
  low: "border border-muted-foreground/60 bg-transparent",
};
const LAST_PROJECT_KEY = "bb-plugin-todo:last-project";

function nextPriority(priority: Priority): Priority {
  return PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(priority) + 1) % PRIORITY_ORDER.length]!;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function useTodos() {
  const rpc = useRpc<typeof rpcContract>();
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = useCallback((cause: unknown) => {
    setError(cause instanceof Error ? cause.message : String(cause));
  }, []);
  const refetch = useCallback(() => {
    rpc.call("todos_list").then((result) => {
      setTodos(result.todos);
      setError(null);
    }, report);
  }, [rpc, report]);
  useEffect(() => {
    refetch();
  }, [refetch]);
  useRealtime("todos-changed", refetch);
  return { rpc, todos, error, report, refetch };
}

function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", PRIORITY_DOT[priority])}
    />
  );
}

function TodoRow({
  todo,
  onUpdate,
  onRemove,
}: {
  todo: Todo;
  onUpdate: (patch: { done?: boolean; priority?: Priority }) => void;
  onRemove: () => void;
}) {
  const navigate = useBbNavigate();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  return <li className={cn("my-3 rounded-xl border border-border bg-card p-5 text-sm transition-colors", dragging && "ring-2 ring-primary bg-primary/5")}
    onDragOver={e => {e.preventDefault(); setDragging(true);setOpen(true);}}
    onDragLeave={e => {if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);}}
    onDrop={e => {e.preventDefault();setDragging(false); if (!(e.target as HTMLElement).closest('[aria-label="Карточка задачи"]')) window.dispatchEvent(new CustomEvent(`todo-files-${todo.id}`,{detail:Array.from(e.dataTransfer.files)}));}}>
    <div className="flex items-center gap-3">
      <Checkbox checked={todo.done} onCheckedChange={checked => onUpdate({done:checked === true})} aria-label={`${todo.done ? "Вернуть" : "Выполнить"} «${todo.title}»`}/>
      <button className={cn("min-w-0 text-left flex-1 font-normal text-sm break-words",todo.done && "line-through text-muted-foreground")} onClick={() => setOpen(value => !value)}>{todo.title}</button>
      <button type="button" disabled={todo.done} aria-label={`Приоритет: ${PRIORITY_LABEL[todo.priority]}. Сменить`} title="Нажмите, чтобы сменить приоритет" onClick={() => onUpdate({priority:nextPriority(todo.priority)})} className="inline-flex shrink-0 items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-xs disabled:opacity-60"><PriorityDot priority={todo.priority}/>{todo.done ? "Выполнено" : PRIORITY_LABEL[todo.priority]}</button>
      <Button variant="ghost" size="icon" aria-label={open ? "Свернуть задачу" : "Развернуть задачу"} aria-expanded={open} onClick={() => setOpen(value => !value)}><Icon name={open ? "ChevronUp" : "ChevronDown"} className="size-4"/></Button>
      <ActionMenu><summary aria-label="Действия задачи" className="list-none cursor-pointer px-2 text-lg text-muted-foreground">⋯</summary><div className="absolute right-0 z-20 min-w-40 rounded-md border bg-card p-1 shadow-md">
        <Button variant="ghost" disabled={todo.done} onClick={() => onUpdate({priority:nextPriority(todo.priority)})}>Приоритет: {PRIORITY_LABEL[todo.priority]}</Button>
        {todo.threadId && <Button variant="ghost" onClick={() => navigate.toThread(todo.threadId!)}>Открыть сессию</Button>}
        <Button variant="ghost" onClick={onRemove}>Удалить задачу</Button>
      </div></ActionMenu>
    </div>
    <div className={cn("mt-5 border-t border-border pt-5",!open && "hidden")}><TaskDetails id={todo.id}/></div>
  </li>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-state-hover hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function groupByProject(todos: Todo[]): [string, Todo[]][] {
  const groups = new Map<string, Todo[]>();
  for (const todo of todos) {
    const group = groups.get(todo.project) ?? [];
    group.push(todo);
    groups.set(todo.project, group);
  }
  // Projects with urgent work first, then by size, then by name.
  return [...groups.entries()].sort(([nameA, a], [nameB, b]) => {
    const urgentA = a.filter((todo) => todo.priority === "high").length;
    const urgentB = b.filter((todo) => todo.priority === "high").length;
    return urgentB - urgentA || b.length - a.length || nameA.localeCompare(nameB);
  });
}

function TodosPage() {
  const { rpc, todos, error, report, refetch } = useTodos();
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(
    () => localStorage.getItem(LAST_PROJECT_KEY) ?? "Inbox",
  );
  const [priority, setPriority] = useState<Priority>("normal");
  const [pending, setPending] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const open = useMemo(() => (todos ?? []).filter((todo) => !todo.done), [todos]);
  const done = useMemo(() => (todos ?? []).filter((todo) => todo.done), [todos]);
  const projects = useMemo(
    () => groupByProject(open).map(([name, items]) => ({ name, count: items.length })),
    [open],
  );
  const allProjectNames = useMemo(
    () => [...new Set((todos ?? []).map((todo) => todo.project))].sort(),
    [todos],
  );
  // Drop a filter whose project has no open tasks left.
  const activeFilter =
    filter !== null && projects.some((entry) => entry.name === filter) ? filter : null;
  const visibleGroups = groupByProject(
    activeFilter === null ? open : open.filter((todo) => todo.project === activeFilter),
  );
  const visibleDone =
    activeFilter === null ? done : done.filter((todo) => todo.project === activeFilter);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = title.trim();
    const nextProject = project.trim() || "Inbox";
    if (nextTitle === "" || pending) return;
    setPending(true);
    try {
      await rpc.call("todos_add", { title: nextTitle, project: nextProject, priority });
      localStorage.setItem(LAST_PROJECT_KEY, nextProject);
      setTitle("");
      setPriority("normal");
      refetch();
    } catch (cause) {
      report(cause);
    } finally {
      setPending(false);
    }
  };

  const update = (id: string, patch: { done?: boolean; priority?: Priority }) => {
    rpc.call("todos_update", { id, ...patch }).then(refetch, report);
  };
  const remove = (id: string) => {
    rpc.call("todos_remove", { id }).then(refetch, report);
  };
  const renderRows = (items: Todo[]) => (
    <ul className="">
      {items.map((todo) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          onUpdate={(patch) => update(todo.id, patch)}
          onRemove={() => remove(todo.id)}
        />
      ))}
    </ul>
  );

  return (
    <div className="relative isolate h-full min-h-0 flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto">
      <div className="mx-auto box-border w-full max-w-3xl space-y-4 px-4 pb-6 pt-3 md:px-5 md:pt-4">
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Что сделать?"
            aria-label="Новая задача"
            className="min-w-[12rem] flex-1"
          />
          <Input
            value={project}
            onChange={(event) => setProject(event.target.value)}
            placeholder="Проект"
            aria-label="Проект"
            list="bb-plugin-todo-projects"
            className="w-32 shrink-0"
          />
          <datalist id="bb-plugin-todo-projects">
            {allProjectNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div
            role="radiogroup"
            aria-label="Приоритет"
            className="flex h-9 items-center rounded-md border border-input p-0.5"
          >
            {PRIORITY_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={priority === value}
                title={PRIORITY_LABEL[value]}
                onClick={() => setPriority(value)}
                className={cn(
                  "flex h-full cursor-pointer items-center gap-1.5 rounded-[5px] px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  priority === value
                    ? "bg-state-active text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <PriorityDot priority={value} />
                <span className="hidden sm:inline">{PRIORITY_LABEL[value]}</span>
              </button>
            ))}
          </div>
          <Button type="submit" disabled={pending || title.trim() === ""}>
            <Icon name="Plus" className="size-4" />
            Добавить
          </Button>
        </form>

        {error === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {projects.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={activeFilter === null} onClick={() => setFilter(null)}>
              Все · {open.length}
            </FilterChip>
            {projects.map((entry) => (
              <FilterChip
                key={entry.name}
                active={activeFilter === entry.name}
                onClick={() => setFilter(entry.name)}
              >
                {entry.name} · {entry.count}
              </FilterChip>
            ))}
          </div>
        ) : null}

        {todos === null ? (
          <EmptyState>Загружаю…</EmptyState>
        ) : open.length === 0 ? (
          <EmptyState>
            Открытых задач нет. В любой сессии скажи «поставь это в туду» — задача
            появится здесь.
          </EmptyState>
        ) : (
          visibleGroups.map(([name, items]) => (
            <section key={name} className="space-y-1.5">
              <h2 className="flex items-baseline gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {name}
                <span className="font-normal normal-case tracking-normal">{items.length}</span>
              </h2>
              {renderRows(items)}
            </section>
          ))
        )}

        {visibleDone.length > 0 ? (
          <section className="space-y-1.5">
            <button
              type="button"
              aria-expanded={showDone}
              onClick={() => setShowDone((value) => !value)}
              className="flex cursor-pointer items-center gap-1 px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Icon name={showDone ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
              Выполнено · {visibleDone.length}
            </button>
            {showDone ? renderRows(visibleDone) : null}
          </section>
        ) : null}
      </div>
      </div>
      <div data-todo-preview-root className="pointer-events-none absolute inset-0 z-50"/>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "todos",
    title: "Todo",
    icon: "CircleCheck",
    path: "todos",
    component: TodosPage,
  });
});
