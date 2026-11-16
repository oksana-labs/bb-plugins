import { JSDOM } from 'jsdom';
const dom = new JSDOM('<html><body></body></html>', {url:'https://localhost/'});
for (const key of ['window','document','navigator','HTMLElement','Element','Node','MutationObserver','localStorage']) Object.defineProperty(globalThis,key,{value:(dom.window as any)[key], configurable:true});
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const {loadPluginApp, renderSlot} = await import('@get-bb/plugin-sdk/testing/app');
const {fireEvent, waitFor} = await import('@testing-library/react');
const assert = await import('node:assert/strict');
const app = await loadPluginApp(() => import('./app'));
const task = {id:'test',title:'Test task',notes:'',project:'Inbox',priority:'normal',done:false,createdAt:new Date().toISOString(),doneAt:null,threadId:null};
let comments: any[] = [];
const slot = renderSlot(app.navPanels[0]!,{subPath:''},{rpc:{
 todos_list: () => ({todos:[task]}),
 todos_details: () => ({todo:task,comments,attachments:[]}),
 todos_update: (input: any) => {Object.assign(task,input); return task;},
 comments_add: (input: any) => {const item = {...input,id:'c1',createdAt:new Date().toISOString()}; comments.push(item); return item;},
}});
try {
 fireEvent.click(await slot.findByText('Test task'));
 await slot.findByLabelText('Новый комментарий');
 assert.equal(slot.queryByLabelText('Описание и ссылки'),null);
 fireEvent.change(await slot.findByLabelText('Новый комментарий'),{target:{value:'https://example.com'}});
 await waitFor(() => assert.equal((slot.getAllByText('Добавить')[1] as HTMLButtonElement).disabled,false));
 fireEvent.click(slot.getAllByText('Добавить')[1]);
 await slot.findByText('https://example.com');
 assert.equal(slot.queryByLabelText('Новый комментарий'),null);
 assert.equal(comments.length,1);
 assert.equal((slot.getByText('https://example.com') as HTMLAnchorElement).href,'https://example.com/');
 const menu = slot.getByLabelText('Действия задачи').closest('details')!;
 menu.open = true;
 fireEvent.pointerDown(document.body);
 assert.equal(menu.open,false);
 menu.open = true;
 fireEvent.keyDown(document,{key:'Escape'});
 assert.equal(menu.open,false);
 console.log('PASS: expand card, removed description field, clickable links, add comment');
} finally {slot.lifecycle.unmount();}
