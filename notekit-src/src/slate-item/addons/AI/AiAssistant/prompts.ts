import { AiCommandParams } from './AiAssistant';
import { insert } from '../../../utils/array/insert';

export type Prompt =
  | AiCommandParams
  | {
      title: string;
      subitems: { [id: string]: Prompt };
    };
/*
sub(minNum,maxNum) The count of item's subitems between minNum and maxNum
sub(num) The count of item's subitems is 'num'
sub(num,) The count of item's subitems is at least 'num'
sub(,num) The count of item's subitems is at most 'num'
len(min,max) The length of item's content is between min and max
len(n) The length of item's content is 'n'
len(n,) The length of item's content is at least 'n'
len(,n) The length of item's content is at most 'n'
*/
// const queryPrompt = `You will help user to build a query to find the items in an outline app.
// TypeScript interface for Outline item(sometimes called node):
// interface Item {
//   ky: string //item's ID
//   pky: string //item's parent ID
//   ori: string //item's original text
//   path: string[] //item's path
//   quote: string[] //item's description
//   created: number //item's created time in seconds
//   updated: number //item's updated time in seconds
//   isTopic: boolean //if item is a topic
//   topic: string //if item is a topic, topic is the topic's title in lower case
//   referText: string[] //the IDs of the items which is referenced by this item
//   referBlock: string[] //the IDs of the items which is embedded by this item
//   tags: string[] //the tags of the item
//   foldup: boolean //if item is folded
//   layout: 'markdown' | 'flexmap' | 'outline' | 'whiteboard' | 'kanban' // the layout of the item, default is outline, flexmap means mindmap
//   [addonName: string]: { // when an addon need to save data, it can save data in the field named by addon's name. so we can get the items affected some addon
//     [key: string]: unknown
//   }
// }
// Operators to build a query: AND OR NOT, minus sign (-) same as NOT, space same as AND,these operators must be uppercase.
// Predicate to build a query, both predicate(kw) and predicate:kw are ok.But predicate:kw is preferred.When kw includes space,do use predicate:"kw" to quote it or predicate(kw).Do omit quotation mark when kw doesn't includes space.
// Can use parenthesis to group predicates, like (a OR b) AND c -(d OR e NOT( f OR g))
// start:kw Content starts with 'kw'
// end:kw Content ends with 'kw'
// mark:markName Content includes a substring marked by markName(like bold,italic,underline,highlight,code,strikethrough)
// mark(note,kw) User can add a note to a substring of item, and the note includes 'kw'
// mark(format,kw) User can add a format to a substring of item, and the format is 'kw'
// equal:kw Content equals to 'kw'
// pky:id Item's parent id is 'kw'
// ky:id Item's id is 'kw'
// parent:kw Item's closest parent content includes 'kw'
// under:kw One of all parents of item includes 'kw'
// topic:val Item's topic is 'val'
// has:kw One of subitems of all levels includes 'kw'
// own:kw One of subitems of first level includes 'kw'
// flat:kw The item or one of its all levels subitems includes 'kw'
// link:kw The text of bi-direction link includes 'kw'
// unlink:kw The text of bi-direction link not includes 'kw', or has no bi-direction link
// ref:kw The text of reference link includes 'kw'
// refby:kw The target item is referenced by another items that includes 'kw'
// index(kw,depth) Search as a scrawler, find the index page with 'kw', then go deep into another pages along the reference links and bi-direction links to find the items. 'depth' is the max depth of the pages to go deep into, default is 2
// every(kw,target) Every target should include 'kw', target can be siblings, subitems, prev, next, parent, sub, descendant
// some(kw,target) Target should come after 'kw', target can be siblings, subitems, prev, next, parent, sub, descendant
// with(comp) Content includes a component 'comp', component can be: hyperlink,img,refer,embed,pomo,slider,rating,etc
// with(comp,kw) Content includes a component with value 'kw',for example with(hyperlink, a OR b) means content includes a hyperlink with value a or b
// with(*) Content includes any component
// reg:regExp Content matches the regular expression 'regExp'
// js(item=>boolean) Use javascript to filter items, example: js(item=>item.ori.startsWith('a'))
// kw can either be a normal string or a logical query. can use asterisk wildcard '*' to match any string, for example: with(hyperlink,*) ref(*)
// When kw is empty, it can match nothing
// `

export const prompts = {
  // 'build a query': {
  //   title: 'Build a query',
  //   prompt: `${queryPrompt}\nAccording to these rules, return an exact query without anything else ABOUT:\n/{%head}`,
  //   op: 'insert-subitems',
  // },
  explain: {
    title: 'Explain this',
    prompt: '{%crumbs}explain ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  continue: {
    title: 'Continue writing',
    prompt: '{%crumbs}continue writing ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  'generate content': {
    title: 'Generate content',
    prompt: '{%crumbs}generate content ABOUT:\n/{%head}',
    op: 'insert-subitems',
  },
  // 'generate title': {
  //   title: 'Generate title',
  //   prompt: 'Generate title ABOUT:\n{%head}',
  //   op: 'insert-title',
  // },
  improve: {
    // 润色
    title: 'Improve',
    prompt: '{%crumbs}improve:\n{%head}',
    op: 'insert-subitems',
  },
  'change tone': {
    // 改变语气
    title: 'Change tone',
    subitems: {
      professional: {
        title: 'Professional',
        prompt: '{%crumbs}Change tone to be professional:\n{%head}',
        op: 'show-dialog',
      },
      casual: {
        title: 'Casual',
        prompt: '{%crumbs}Change tone to be casual:\n{%head}',
        op: 'show-dialog',
      },
      straightforward: {
        title: 'Straightforward',
        prompt: '{%crumbs}Change tone to be straightforward:\n{%head}',
        op: 'show-dialog',
      },
      confident: {
        title: 'Confident',
        prompt: '{%crumbs}Change tone to be confident:\n{%head}',
        op: 'show-dialog',
      },
      friendly: {
        title: 'Friendly',
        prompt: '{%crumbs}Change tone to be friendly:\n{%head}',
        op: 'show-dialog',
      },
    },
  },
  outline: {
    title: 'Outline',
    prompt: '{%crumbs} Without asking or any content of overview, write an outline ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  rewriteAuthentically: {
    title: 'Rewrite authentically',
    prompt: '{%crumbs} DO NOT answer the question mentioned below, just rewirite the following content with authentic English:\n{%head}',
    op: 'insert-subitems',
  },
  questions: {
    title: 'Generate questions',
    prompt: '{%crumbs}Ask questions ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  summarize: {
    title: 'Summarize',
    prompt: '{%crumbs}Summarize:\n{%head}',
    op: 'insert-next',
  },
  Poem: {
    title: 'Poem',
    prompt: '{%crumbs}Write a poem ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  essay: {
    // 散文
    title: 'Essay',
    prompt: '{%crumbs}Write an essay ABOUT:\n{%head}',
    op: 'insert-subitems',
  },
  todolist: {
    title: 'Todo list',
    prompt: '{%crumbs} Write a todo list ABOUT:\n```{%head}```',
    op: 'insert-subitems',
  },
  'creative story': {
    title: 'Creative story',
    prompt: 'Write a creative story ABOUT:\n```{%head}```',
    op: 'insert-subitems',
  },
  'meeting agenda': {
    title: 'Meeting agenda',
    prompt: '{%crumbs} Write a meeting agenda ABOUT:\n```{%head}```',
    op: 'insert-subitems',
  },
  'make longer': {
    title: 'Make longer',
    prompt: '{%crumbs} make content longer ABOUT:\n```{%head}```',
    op: 'insert-subitems',
  },
  'make shorter': {
    title: 'Make shorter',
    prompt: '{%crumbs} make content shorter ABOUT:\n```{%head}```',
    op: 'insert-subitems',
  },
  'ask ai': {
    title: 'Ask AI',
    prompt: '{%head}',
    op: 'insert-subitems',
  },
} as const

export type PromptKey = keyof typeof prompts