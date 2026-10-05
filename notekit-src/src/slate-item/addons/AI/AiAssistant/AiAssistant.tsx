import { IAddon, App, NewAddonParams } from '../../../engine/App'
// import { Configuration, OpenAIApi } from 'openai';
import {
  Item,
  ItemEditor,
  ItemNode,
  ItemTransforms,
  TimeSecond,
  makeItemText,
} from '../../..'
import { showSnack } from '../../../utils/msg/showSnack'
import { trim } from '../../../utils/string/trim'
import { HistoryEditor, Node, Path, Transforms } from '../../../slate.inc'
import { nodeString } from '../../../utils/string/nodeString'
import { Prompt, PromptKey, prompts } from './prompts'
import { FloatMenuItems } from '../../FloatMenu/FloatMenuComp'
import { MEMBER_ID } from '../../../constants'
import { createChatCompletion, DeltaParams, MessageFormat } from './helper'
import { isDate } from '../../Daily/Daily'
import { isEmpty, notEmpty } from '../../../utils/isEmpty'
import { dialogShow } from '../../../utils/msg/showDialog'
import { todayFmt } from '@/slate-item/utils/date/datekit'
import { getActiveEditor } from '../../EditorView/helper'
import { time } from '@/slate-item/utils/date/time'
import { md2outline } from '../../Paste/helper'
import { recur } from '@/slate-item/utils/recur'
import { mkid } from '@/slate-item/utils/string/mkid'
import { omit } from '@/slate-item/utils/object/omit'
import { replaceSlateNode } from '@/slate-item/transforms/helper'
import { $t } from '@/i18n'
import { deepClone } from '@/slate-item/utils/object/deepClone'
import { useAddons } from '@/slate-item/hooks/useAddons'
import { useItem } from '@/slate-item/hooks/useItem'
import { ContextEditorInline } from '../../EditorView/EditorViewContexts'
import React from 'react'
import { cls } from '@/slate-item/styles'
import { current } from 'immer'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'
import { ItemWithWhiteboardNode } from '../../LayoutFactory/Whiteboard/Whiteboard'

declare global {
  interface AppConf {
    chatGPTApiKey: string,
    chatGPTApiModel: string,
    chatGPTApiUrl: string,
    fastNoteExtendedPrompt: string
  }
}

declare global {
  interface UnitPersist {
    aiAssistant?: {
      question?: TimeSecond
      answer?: TimeSecond
      line?: number,
      session?: boolean,
    }
  }
}

export type AiOp =
  | 'replace'
  | 'insert-subitems'
  | 'insert-title'
  | 'insert-next'
  | 'show-dialog'

export type AiCommandParams = {
  title: string
  prompt: string
  op?: AiOp | AiOp[]
}

export type AvailVars = {
  head?: string
  crumbs?: string
  parent?: string
  parentAll?: string
  body?: string
  prev?: string
  next?: string
  nextAll?: string
  prevAll?: string
  above?: string
  below?: string,
}

export interface AiAssistInterface {
  commands: { [id: string]: AiCommandParams }
  registerCommand(commands: { [id: string]: AiCommandParams }): void
  // invokeCommand(
  //   promptKey: string,
  //   data: AvailVars,
  //   options?: any
  // ): Promise<string | null>;
  invokeCommandStream(
    prompt: string,
    options?: any
  ): Promise<string>
  getOp(promptKey: string): AiOp | AiOp[]
}

function parsePrompt(prompt: string, data: AvailVars) {
  return prompt.replace(/{%([^}]+)}/g, (_, key) => {
    return (data as any)[key] ?? ''
  })
}

export class ChatGPT implements AiAssistInterface {
  commands: { [id: string]: AiCommandParams } = {}
  app: App

  constructor(options: { app: App; }) {
    this.app = options.app;
  }

  registerCommand(commands: { [id: string]: AiCommandParams }): void {
    Object.assign(this.commands, commands)
  }

  async invokeCommandStream(
    prompt: string,
    options: { stream?: boolean; history?: MessageFormat[] } = {}
  ) {
    const $ = this.app.addons;
    const model = $.prefer.getValue('chatGPTApiModel');
    const apiUrl = $.prefer.getValue('chatGPTApiUrl');
    const apiKey = $.prefer.getValue('chatGPTApiKey');
    if (isEmpty(apiKey) || isEmpty(model) || isEmpty(apiUrl)) {
      dialogShow({
        title: 'Warning',
        body: 'Please set chatGPT API key, model and URL in config.',
        buttons: {
          Config: () => {
            this.app.addons.prefer.showAddonForm('aiAssistant')
          },
          Cancel: null,
        },
      })
      return ''
    }

    showSnack({
      content: 'AI is running...',
      severity: 'info',
      autoClose: 1000,
    });

    const { history = [], ...opts } = options

    const msgs: MessageFormat[] = [
      {
        role: 'system',
        content: 'NOTE: You are not chatting, your answer will be recorded as outline notes, be precise and clear.'
      },
      ...history,
    ]
    if (notEmpty(prompt)) {
      msgs.push({
        role: 'user',
        content: prompt,
      })
      if (prompt.includes('ABOUT')) {
        msgs.unshift({
          role: 'system',
          content: `Response in the same language used in the content after the capital keyword "ABOUT".`,
        })
      }
    }

    // const maxLen = 4096;
    // let len = 0;
    // const messages: MessageFormat[] = [];
    // for (const m of msgs) {
    //   if (len + m.content.length >= maxLen) {
    //     break;
    //   }
    //   len += m.content.length;
    //   messages.push(m);
    // }

    const result = await createChatCompletion({
      model: model,
      apiUrl: apiUrl,
      messages: msgs,
      // user: MEMBER_ID.toString(32),
      apiKey: apiKey,
      ...opts,
    })

    return result ?? ''
  }

  getOp(promptKey: AiOp): AiOp | AiOp[] {
    return this.commands[promptKey]?.op ?? 'replace'
  }
}

export function createAiAssistantAddon(params: NewAddonParams) {
  const { app, $ } = params

  class AiAssistant implements IAddon {
    app!: App
    config = {}

    instance!: AiAssistInterface

    getOnly(type: "question"| "answer" | "nonAI", i: Partial<UnitPersist>, exclude?: string) {
      if (i.subitems) {
        i.subitems = (i.subitems as UnitPersist[]).filter((c) => {
          if (type == "answer") return c.aiAssistant?.answer;
          else if (type == "question") return (!c.aiAssistant?.answer) || c.aiAssistant?.question;
          else return !c.aiAssistant?.answer && !c.aiAssistant?.question && c.ky !== exclude;
        });
        for(const c of i.subitems) $.aiAssistant.getOnly(type, c, exclude);
      }
      return i;
    }

    getStringWithSub(i: UnitPersist) {
      return $.exports.getString('markdown', { data: i } as any).replaceAll(/ai responses/gi, "").trim();
    }

    continuationParse(item: ItemNode) {
      let chain: UnitPersist[] = [];
      const findSession = (i: UnitPersist) => {
        chain.push(i);
        if (i.aiAssistant?.session) return i;
        if (i.pky && (!(["-", i.ky].includes(i.pky)))) {
          const father = $.dbMemory.getItem(i.pky);
          return findSession(father);
        } else {
          return null;
        }
      }
      let session = findSession(item);
      let selfSession = item.aiAssistant?.session ?? false;

      if (!session) {
        chain = [item];
        session = item;
        item.DoModify({
          aiAssistant: {
            ...item.aiAssistant,
            session: true,
            question: time(),
          }
        })
        selfSession = true;
      }
      // first construct chat history
      const history: MessageFormat[] = [];
      for (let i = 0; i < chain.length; i++) {
        const s = chain[i];
        if (i === 0) {
          const recurs = $.dbMemory.getItem(s.ky, { isRecur: true });
          $.aiAssistant.getOnly("question", recurs, item.ky);
          history.unshift({ role: 'user', content: this.getStringWithSub(recurs) });
          continue;
        }
        if (s.aiAssistant?.question) {
          const itemWithChildren = $.dbMemory.getItem(s.ky, { isRecur: true });
          const cpItemWithChildren = deepClone(itemWithChildren);
          
          if (!itemWithChildren.subitems) continue;
          $.aiAssistant.getOnly("answer", itemWithChildren, item.ky);
          const answer = $.aiAssistant.getStringWithSub({subitems: itemWithChildren.subitems, ky: s.ky, ori: ""} as UnitPersist)
          $.aiAssistant.getOnly("question", cpItemWithChildren);
          const question = $.aiAssistant.getStringWithSub(cpItemWithChildren)
          history.unshift({ role: 'assistant', content: answer })
          history.unshift({ role: 'user', content: question })
        }
      }
      let nonAI = ""
      if (!selfSession) {
        const recurAll = $.dbMemory.getItem(session.ky, { isRecur: true });
        $.aiAssistant.getOnly("nonAI", recurAll);
        nonAI = $.aiAssistant.getStringWithSub(recurAll);
      }
      history.unshift({role: 'system', content: `Answer in the language by user's requirement or in the language the user used. ${nonAI?"Refer these user notes to answer the question. "+nonAI:""}`})
      return history;
    }

    continuationParseForWhiteBoard(item: ItemNode) {
      const history: MessageFormat[] = [];
      const chains: UnitPersist[][] = [];
      const findSessions = (currentChain: UnitPersist[]) => {
        const i = currentChain[0];
        if (i.aiAssistant?.session) {
          chains.push(currentChain);
          return;
        }
        const refers = $.refer.getBacklinkItems(i.ky);
        for (const refer of refers) {
          const edge = refer as ItemWithWhiteboardNode
          if (
            (!edge.whiteboard?.edge) ||
            edge.whiteboard.edge.target.cell !== i.ky
          ) return;
          const prev = $.dbMemory.getItem(edge.whiteboard.edge.source.cell);
          if (currentChain.findIndex(e=> e.ky === prev.ky) !== -1) continue;
          const subChain = deepClone(currentChain);
          subChain.unshift(prev);
          findSessions(subChain)
        }
      }
      findSessions([item])
      if (chains.length !== 0) {
        const alreadyInMsg: string[] = [item.ky]
        let lastMsg = ""
        for (const chain of chains) {
          lastMsg = ""
          for (const node of chain) {
            if (alreadyInMsg.includes(node.ky)) {
              lastMsg = node.ky
              continue
            }
            const data = $.dbMemory.getItem(node.ky, { isRecur: true });
            if (data.aiAssistant?.question) {
              const dataCopy = deepClone(data);
              const question = $.aiAssistant.getOnly("question", data, item.ky);
              const answer = $.aiAssistant.getOnly("answer", dataCopy, item.ky);
              const questionStr = this.getStringWithSub(question as UnitPersist);
              const answerStr = $.aiAssistant.getStringWithSub({subitems: answer.subitems, ky: answer.ky, ori: ""} as UnitPersist)
              history.push({ role: 'user', content: `BLOCK: ${data.ky}${lastMsg?" PARENT: "+lastMsg:""}\n${questionStr}` })
              history.push({ role: 'assistant', content: `BLOCK: ${data.ky}${lastMsg?" PARENT: "+lastMsg:""}\n${answerStr}` })
            } else {
              const nonAI = $.aiAssistant.getOnly("nonAI", data, item.ky);
              const nonAIStr = this.getStringWithSub(nonAI as UnitPersist);
              if (nonAIStr) history.push({ role: 'user', content: `NOTE: ${data.ky}${lastMsg?" PARENT: "+lastMsg:""}\n${nonAIStr}` })
            }
            alreadyInMsg.push(node.ky)
            lastMsg = node.ky
          }
        }
        history.unshift(
          {
            role: "system",
            content: 'There may be multiple chat session. Each Q&A pair has a unique id and (the id of its previous Q&A pair if exists). Construct chat history first and finish the task in message with capitalized SOLVE THIS at the very beginning. NEVER include BLOCK ID in your response.'
          }
        )
      } else { 
        item.DoModify({
          aiAssistant: {
            ...item.aiAssistant,
            session: true,
            question: time(),
          }
        })
      }
      const recurs = $.dbMemory.getItem(item.ky, { isRecur: true });
      $.aiAssistant.getOnly("question", recurs, item.ky);
      history.push({ role: 'user', content: `SOLVE THIS ${this.getStringWithSub(recurs)}` });
      history.unshift({role: 'system', content: `Answer in the language by user's requirement or in the language the user used.`})
      return history;
    }

    parseVariables(
      item: ItemNode,
      key?: keyof AvailVars
    ): string | Required<AvailVars> | null {
      const editor = item.GetEditor()
      const path = item.GetSlPath()
      const theItem = $.dbMemory.getItem(item.ky, { isRecur: true })

      const handler = {
        head: () =>
          $.exports
            .getString('markdown', {
              item,
              data: theItem,
            })
            .replace(/\(\(|\)\)|\[\[|\]\]/g, ' '), // clean (()) [[]]
        parent: () => $.crumbs.getCrumbs(item)[0].text ?? null,
        crumbs: () => {
          const str = $.crumbs
            .getCrumbs(item)
            .filter((s) => !s.isTopic || !isDate(s.text))
            .map((s) => s.text)
            .join('/')
          if (str.length > 1) {
            return `Under the breadcrumbs <<<${str}>>>,`
          }
        },
        parentAll: () => {
          return $.crumbs
            .getCrumbs(item)
            .map((s) => s.text)
            .join('\n')
        },
        body: () => {
          const content: string[] = []
          const root = editor.item(path)
          for (const [node] of Node.nodes(root as Node)) {
            if ((node as any).type === 'node-head' && root !== node) {
              content.push(trim(nodeString(node)))
            }
          }
          return content.join('\n')
        },
        prev() {
          const prev = editor.itemPathPrev(path)
          return prev ? editor.itemTextPlain(prev) : null
        },
        // next() {
        //   const next = editor.itemPathNext(path);
        //   console.log(next)
        //   return next ? editor.itemTextPlain(next) : null;
        // },
        // nextAll() {
        //   const content: string[] = [];
        //   for (const n of editor.itemNextAll(path)) {
        //     content.push(editor.itemTextPlain(n.GetSlPath()));
        //   }
        //   return content.join('\n');
        // },
      }
      if (key) {
        return (handler as any)[key]?.()
      }
      const result = {} as any
      for (const k of Object.keys(handler)) {
        result[k] = (handler as any)[k]()
      }
      return result
    }

    async invokeCommand(promptKey: string, data: AvailVars, options: any = {}) {
      if (!(promptKey in this.instance.commands)) {
        throw new Error(`Command ${promptKey} is not registered.`)
      }

      const cmd = this.instance.commands[promptKey]
      const prompt = parsePrompt(cmd.prompt, data)
      
      const result = await $.aiAssistant.instance.invokeCommandStream(
        prompt,
        options
      )
      // snack.close(100);
      return result
    }

    registerCommand(commands: { [id: string]: Prompt }) {
      for (const [id, info] of Object.entries(commands)) {
        if ('subitems' in info) {
          $.aiAssistant.registerCommand(info.subitems!)
        } else {
          $.aiAssistant.instance.registerCommand({ [id]: info })
        }
      }
    }

    async handleUserInput(
      promptKey: PromptKey,
      options: { editor: ItemEditor; item: ItemNode; history?: MessageFormat[] }
    ) {
      const { editor, item, history: pHistory ,...opts } = options

      item.DoModify({
        aiAssistant: {
          question: time(),
          ...item.aiAssistant,
        }
      })

      const data = $.aiAssistant.parseVariables(item) as AvailVars
      let currentPath = item.GetSlPath()
      const originPath = currentPath

      const itemAITemplate: ItemNode = editor.itemCreate({
        leaves: ([
          { text: '' },
          $.bilink.createElement({
            topic: "AI Responses",
          }),
          { text: promptKey !== "ask ai" ? ` with the command: ${prompts[promptKey].title}` : "" },
        ] as Node[]),
        pky: item.ky,
        aiAssistant: {
          answer: time(),
        }
      });
      let itemAI: ItemNode = itemAITemplate;
      if (promptKey === 'ask ai') {
        const sub = $.dbMemory.getSubitems(item.ky);

        if (sub && sub.length > 0) {} else {
          itemAI = item;
        }
      }
      


      function handleDelta(delta: DeltaParams) {
        $.dbMemory.withoutSaving(() => {
          const { paragraph, isBreak, isStop } = delta
          if (!isBreak) {
            HistoryEditor.withoutSaving(editor as any, () => {
              // ItemTransforms.replaceText(editor, {
              //   at: currentPath,
              //   text: paragraph,
              // })
              const leaves = $.compat.convertText(
                { ori: paragraph } as any,
                paragraph
              )
              replaceSlateNode(
                editor,
                makeItemText({
                  leaves,
                } as any) as any,
                editor.itemPathText(currentPath)
              )
            })
          } else {
            HistoryEditor.withoutSaving(editor as any, () => {
              // ItemTransforms.replaceText(editor, {
              //   at: currentPath,
              //   text: paragraph.replace(/\n+$/g, ''),
              // })
              // console.log(paragraph)
              const currentItem = editor.item(currentPath)
              replaceSlateNode(
                editor,
                $.compat.convertItem(currentItem) as any,
                currentPath
              )

              ItemTransforms.insertNextItems(editor, {
                at: currentPath,
                items: editor.itemCreate({
                  aiAssistant: {
                    answer: time(),
                  },
                }),
              })
              currentPath = editor.itemPathNext(currentPath)!
            })
          }
        })
      }
      let refreshBlockSet = false;
      const blockIt = () => {
        if (!refreshBlockSet) {
          $.refresh.preventRefresh++;
          refreshBlockSet = true;
        }
      }
      const unblockIt = () => {
        if (refreshBlockSet) {
          $.refresh.preventRefresh--;
          refreshBlockSet = false;
        }
      }

      const invokeOptions = {
        onDelta: (rs: DeltaParams) => {
          blockIt();
          if (Path.equals(currentPath, originPath)) {
            if(itemAI !== item) ItemTransforms.insertLastItems(editor, {
              at: currentPath,
              items: itemAI
            })
            else editor.insertFragment([
              {text: ' -> '},
              ...itemAITemplate.leaves
            ], {
              at: currentPath,
            })
            currentPath = editor.itemPathLastSubitem(currentPath)
            HistoryEditor.withoutSaving(editor as any, () => {
              ItemTransforms.insertItems(editor, {
                at: currentPath,
                items: editor.itemCreate({
                  aiAssistant: {
                    answer: time(),
                  },
                }),
              })
              currentPath = editor.itemPathFirstSubitem(currentPath)
            })
          }
          handleDelta(rs)
        },
        onCompleted: ({ paragraphs }: { paragraphs: string }) => {
          HistoryEditor.withoutSaving(editor as any, () => {
            for (const sub of editor.itemSubitems(itemAI.GetSlPath())) {
              sub.DoRemove()
            }
          })
          unblockIt();
          const lines = md2outline(paragraphs)
          recur(lines as any, (one: UnitPersist) => {
            const v2item = $.compat.convertItem(one as any)
            Object.assign(one, v2item)
          })
          const t = time();
          lines.subitems.forEach((one: any, i) => {
            one.ky = mkid()
            const newItem = Item.make(Item.resolvePkyAndWeight(one as any), {
              editor,
            })
            newItem.aiAssistant = {
              answer: t,
            }
            ItemTransforms.insertLastItems(editor, {
              at: itemAI.GetSlPath(),
              items: newItem,
            }) // 此处添加的是真正会保存的
            $.orderedList?.convert(editor, newItem, { recur: true })
          })
          showSnack({
            content: 'AI completed!',
            severity: 'success',
            autoClose: 1000
          })
        },
        ...opts,
      } as any;

      try {
        let result;
        if (promptKey === 'ask ai') {
          invokeOptions.history = (item as ItemWithWhiteboardNode).whiteboard ? this.continuationParseForWhiteBoard(item) : this.continuationParse(item)
          result = await $.aiAssistant.instance.invokeCommandStream('', invokeOptions)
        } else {
          result = await $.aiAssistant.invokeCommand(promptKey, data, invokeOptions)
        }
        unblockIt();
        return result;
      } catch(e) {
        unblockIt();
      }
    }

    makeFloatMenu(commands: { [id: string]: Prompt }) {
      const menu: FloatMenuItems = {}
      for (const [id, info] of Object.entries(commands)) {
        if ('subitems' in info) {
          menu[id] = {
            title: info.title,
            icon: 'svg_arrow_right',
            subitems: $.aiAssistant.makeFloatMenu(info.subitems),
          }
        } else {
          menu[id] = {
            title: info.title,
            icon: 'svg_magic',
            async onMouseDown() {
              const { editor, item } = $.floatMenu.getContext()
              $.aiAssistant.handleUserInput(id as PromptKey, { editor, item })
            },
          }
        }
      }
      return menu
    }

    addonInfo() {
      return {
        title: 'AI Assistant',
        quote:
          'An AI assistant than can help you to make better notes. This addon is based on ChatGPT, before using it, you need to get an API key from https://platform.openai.com/account/api-keys',
        // defaultValue: 'off',
        type: 'fieldset',
        updated: 20230327,
        subitems: {
          chatGPTApiKey: {
            title: `API Key`,
            type: 'password',
          },
          chatGPTApiUrl: {
            title: `API URL`,
            type: 'text',
            defaultValue: 'https://api.openai.com/v1/chat/completions',
          },
          chatGPTApiModel: {
            title: `Model`,
            type: 'text',
            defaultValue: 'gpt-4o',
          },
          fastNoteExtendedPrompt: {
            title: $t`Set custom prompt for fast note AI parsing (experimental)`,
            type: 'code',
            mode: 'markdown',
            defaultValue: ''
          }
        },
      }
    }

    addonRun() {
      appendStyle(`
        .whiteboard-node > .editor-view > .node-body > .item-editor > .node-top > .node-head > .node-extra {
          display: block !important;
        }
        .whiteboard-node > .editor-view > .node-body > .item-editor > .node-top > .node-head > .node-extra *:not(.ai-session-btn) {
          display: none !important;
        }
      `)
      $.aiAssistant.instance = new ChatGPT({
        app,
      })
      $.aiAssistant.registerCommand(prompts)

      $.slashMenu.addItems({
        sendToAi: {
          title: 'Ask AI',
          icon: 'svg_ai',
          versions: {
            pinyin: { v: 'wen ai' },
            py: { v: 'wai' },
            en: { v: 'askai' },
            cn: { v: '问ai' },
          },
          handle({ editor }) {
            const item = editor.item()
            $.slashMenu.insertText(editor, '')
            $.aiAssistant.handleUserInput('ask ai', { editor, item })
          },
        },
        aiSessionStart: {
          title: 'Start AI Session',
          icon: 'svg_ai',
          versions: {
            pinyin: { v: 'qi dong ai hui hua' },
            py: { v: 'qdaihh' },
            en: { v: 'start ai session' },
            cn: { v: '启动ai会话' },
          },
          handle({ editor }) {
            const item = editor.item()
            $.slashMenu.insertText(editor, '')
            item.DoModify({
              aiAssistant: {
                ...item.aiAssistant,
                session: true,
                // question: 233
                // session: true,
                // answer: 1
              }
            })
            showSnack({
              content: `AI session started.`,
              severity: 'success',
            })
          }
        }
      })

      $.editorView.addExtraItems({
        aiSessionBtn() {
          const ctxItem = useItem();
          const $ = useAddons();

          
          const isReferCxt = React.useContext(ContextEditorInline);
          if(isReferCxt || (!ctxItem.aiAssistant?.session)) return null;

          const onClick = (e: React.MouseEvent) => {
            ctxItem.DoModify({
              aiAssistant: {
                ...ctxItem.aiAssistant,
                session: false,
              }
            })
            showSnack({
              content: `AI session ended.`,
              severity: 'success',
            })
          };

          const style = cls`
            cursor: pointer;
            order: 999;
            color: var(--cl-blue-700);

            &:hover {
              color: var(--cl-blue-600);
            }
          `;

          return (
              <span onClick={onClick} className={[style, "ai-session-btn"].join(' ')}>
                AI
              </span>
          );
        }
      })

      $.floatMenu.addItems({
        aiAssistant: {
          title: 'AI Assistant',
          icon: 'svg_ai',
          subitems: $.aiAssistant.makeFloatMenu(prompts),
        },
      })

      $.hotkey.register({
        aiAssistantAsk: {
          title: 'Ask AI',
          hotkey: 'mod+shift+1',
          modified: true,
          context: 'global',
          handle() {
            const editor = getActiveEditor()
            if (editor) {
              $.aiAssistant.handleUserInput('ask ai', {
                editor,
                item: editor.item(),
              })
            }
          },
        },
        aiSessionStart: {
          title: 'Start AI Session',
          hotkey: 'mod+shift+2',
          modified: true,
          context: 'global',
          handle() {
            const editor = getActiveEditor()
            if (editor) {
              const item = editor.item()
              item.DoModify({
                aiAssistant: {
                  ...item.aiAssistant,
                  session: true,
                }
              })
              showSnack({
                content: `AI session started.`,
                severity: 'success',
              })
            }
          },
        },
      })
    }
  }

  return {
    aiAssistant: new AiAssistant(),
    // ...createAiChatAddon(params),
  }
}
