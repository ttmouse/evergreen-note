import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const dir = await mkdtemp(path.join(root, 'tmp/menu-keyboard-'))
const compiled = await build({
  stdin: { resolveDir: root, contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {flushSync} from 'react-dom';
    import {useArrowSelect} from './src/slate-item/hooks/useArrowSelect';
    const chosen = []; let editorKeys = 0;
    const root = createRoot(document.getElementById('root'));
    function Menu({body}) {
      const [index] = useArrowSelect({body, defaultSelected:0,
        handle:({item}) => chosen.push(item.title)});
      return React.createElement('div', {contentEditable:true, tabIndex:0,
        'data-index':index, onKeyDown:() => editorKeys++}, '[[');
    }
    const mount = body => flushSync(() => root.render(React.createElement(Menu,{body})));
    const wait = () => new Promise(r => setTimeout(r,30));
    const key = (key, extra={}) => {
      const event = new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra});
      document.querySelector('[contenteditable]').dispatchEvent(event);
      return event.defaultPrevented;
    };
    const check = (value,message) => {if(!value) throw new Error(message)};
    (async()=>{
      mount([{title:'设计知识体系'},{title:'设计师的选拔和招聘'}]); await wait();
      check(!key('Shift'),'ordinary keys must pass through'); await wait();
      check(key('ArrowDown'),'down must be consumed'); await wait();
      check(document.querySelector('[data-index]').dataset.index==='1','down selects second item');
      check(key('Enter'),'enter must be consumed'); await wait();
      check(chosen[0]==='设计师的选拔和招聘','enter chooses highlighted item');
      check(editorKeys===1,'navigation and enter must not reach editor');
      check(!key('Enter',{isComposing:true}),'IME enter must pass through');
      check(chosen.length===1,'IME enter must not choose a link');
      check(key('ArrowUp'),'up must be consumed'); await wait();
      key('Enter'); check(chosen[1]==='设计知识体系','up selects first item');
      key('ArrowUp'); await wait(); key('Enter');
      check(chosen[2]==='设计师的选拔和招聘','up wraps to final item');
      mount([]); await wait();
      check(!key('Enter'),'empty menu enter must pass through');
      check(!key('ArrowDown'),'empty menu arrows must pass through');
      flushSync(()=>root.unmount());
      const event = new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
      document.body.dispatchEvent(event);
      check(!event.defaultPrevented,'unmount must remove capture listener');
      window.testResult={passed:true,chosen,editorKeys};
    })().catch(error=>window.testResult={passed:false,error:error.stack});
  ` }, bundle:true, write:false, platform:'browser', format:'iife',
})
await writeFile(path.join(dir,'test.js'),compiled.outputFiles[0].text)
await writeFile(path.join(dir,'index.html'),'<div id="root"></div><script src="test.js"></script>')
await writeFile(path.join(dir,'runner.cjs'),`
  const {app,BrowserWindow}=require('electron');
  app.setPath('userData',${JSON.stringify(path.join(dir,'profile'))});
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
    await win.loadFile(${JSON.stringify(path.join(dir,'index.html'))});
    let result;
    for(let i=0;i<100;i++) {
      result=await win.webContents.executeJavaScript('window.testResult');
      if(result) break;
      await new Promise(r=>setTimeout(r,30));
    }
    console.log('TEST_RESULT '+JSON.stringify(result));app.exit(result?.passed?0:1);
  }).catch(error=>{console.error(error);app.exit(1)});
`)
const electron = path.join(root,'node_modules/.bin/electron')
const child=spawn(electron,[path.join(dir,'runner.cjs')],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:''},stdio:['ignore','pipe','pipe']})
let output=''; child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data)
const code=await new Promise(resolve=>child.on('exit',resolve))
assert.equal(code,0,output)
console.log(output.trim())
